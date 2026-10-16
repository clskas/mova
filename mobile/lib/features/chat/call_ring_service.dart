import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../sos/notification_tap_router.dart';

class IncomingCallInfo {
  const IncomingCallInfo({
    required this.deliveryId,
    required this.peerLabel,
    this.starterId = '',
    this.kind = 'delivery',
  });

  /// Identifiant course ou livraison (clé de salle LiveKit).
  final String deliveryId;
  final String peerLabel;
  final String starterId;
  /// `ride` | `delivery`
  final String kind;
}

/// Sonnerie + état UI pour appel vocal LiveKit (livraison).
/// [incoming] pilote l'overlay Décrocher / Refuser.
class CallRingService {
  CallRingService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static final AudioPlayer _player = AudioPlayer();
  static bool _initialized = false;
  static bool _ringing = false;
  static Timer? _safetyTimer;
  static const _maxRing = Duration(seconds: 60);
  static const _assetSound = 'sounds/senga_job.wav';
  static const _channelId = 'mova_voice_call_v2';
  static const _channelName = 'Appels vocaux SENGA';

  /// Après raccroché / refus : ignore les relances chat tant qu’un nouvel
  /// événement socket `action: start` n’a pas clear la suppression.
  static final Set<String> _suppressChatRestart = <String>{};

  /// Livraison actuellement en appel connecté (pas seulement sonnerie).
  static String? _inCallDeliveryId;

  /// Non-null ⇒ afficher l'écran d'appel entrant (Décrocher / Refuser).
  static final ValueNotifier<IncomingCallInfo?> incoming = ValueNotifier<IncomingCallInfo?>(null);

  /// Thread (ride/delivery id) dont l'autre partie a refusé / raccroché via socket.
  /// L'écran d'appel sortant écoute ça pour passer en « Appel terminé ».
  static final ValueNotifier<String?> peerEndedThreadId = ValueNotifier<String?>(null);

  static void notifyPeerEnded(String threadId) {
    if (threadId.isEmpty) return;
    // Toujours notifier (ValueNotifier ignore si la valeur est identique).
    if (peerEndedThreadId.value == threadId) {
      peerEndedThreadId.value = null;
    }
    peerEndedThreadId.value = threadId;
  }

  /// Hook global socket `ride:call` / `delivery:call` — ouvre l’overlay sur `start`
  /// (même après un refus / raccroché) et coupe la sonnerie dès `end`.
  static void handleRealtimeCallEvent(Map<String, dynamic> payload) {
    final action = payload['action']?.toString() ?? 'start';
    final id = payload['rideId']?.toString() ??
        payload['deliveryId']?.toString() ??
        '';
    if (id.isEmpty) return;
    if (action == 'start') {
      allowNewIncoming(id);
      final starterId = payload['starterId']?.toString() ?? '';
      final isRide = payload['rideId'] != null && payload['rideId'].toString().isNotEmpty;
      final starterRole = payload['starterRole']?.toString() ?? '';
      final peerLabel = starterRole == 'driver' || starterRole == 'courier'
          ? (isRide ? 'Chauffeur' : 'Livreur')
          : (isRide ? 'Passager' : 'Contact');
      unawaited(startIncoming(
        deliveryId: id,
        starterId: starterId,
        peerLabel: peerLabel,
        kind: isRide ? 'ride' : 'delivery',
        fromRealtime: true,
      ));
      return;
    }
    notifyPeerEnded(id);
    unawaited(forceStop());
  }

  static bool get isRinging => _ringing;
  static String? get activeDeliveryId => incoming.value?.deliveryId;
  static String? get inCallDeliveryId => _inCallDeliveryId;

  static void markInCall(String deliveryId) {
    if (deliveryId.isEmpty) return;
    _inCallDeliveryId = deliveryId;
    _suppressChatRestart.add(deliveryId);
  }

  static void clearInCall(String? deliveryId) {
    if (deliveryId == null || deliveryId.isEmpty || _inCallDeliveryId == deliveryId) {
      _inCallDeliveryId = null;
    }
  }

  /// Autorise une nouvelle sonnerie (événement LiveKit socket `start`).
  static void allowNewIncoming(String deliveryId) {
    if (deliveryId.isEmpty) return;
    _suppressChatRestart.remove(deliveryId);
  }

  static Future<void> init() async {
    if (_initialized) return;
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
      onDidReceiveNotificationResponse: NotificationTapRouter.onLocalNotificationResponse,
      onDidReceiveBackgroundNotificationResponse:
          NotificationTapRouter.onBackgroundNotificationResponse,
    );
    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'Appels vocaux livraison SENGA',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ),
    );
    await android?.requestNotificationsPermission();
    try {
      // Focus transitoire : LiveKit doit pouvoir reprendre le micro après stop.
      await _player.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            isSpeakerphoneOn: true,
            stayAwake: false,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.notificationRingtone,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
          iOS: AudioContextIOS(
            category: AVAudioSessionCategory.playback,
            options: const {
              AVAudioSessionOptions.duckOthers,
              AVAudioSessionOptions.mixWithOthers,
            },
          ),
        ),
      );
    } catch (_) {
      /* ignore */
    }
    _initialized = true;
  }

  /// Démarre sonnerie + overlay (ignore si on est l'appelant).
  /// [fromRealtime] true = événement socket `delivery:call` (peut relancer après raccroché).
  static Future<void> startIncoming({
    required String deliveryId,
    required String starterId,
    String? myUserId,
    String peerLabel = 'Contact',
    String kind = 'delivery',
    bool fromRealtime = false,
  }) async {
    if (myUserId != null && myUserId.isNotEmpty && starterId == myUserId) return;
    if (deliveryId.isEmpty) return;

    if (!fromRealtime && _suppressChatRestart.contains(deliveryId)) {
      return;
    }
    if (fromRealtime) {
      allowNewIncoming(deliveryId);
      // Nouvel `action: start` = l'appel précédent est terminé (évite blocage
      // si clearInCall n'a pas tourné après un échec « livraison introuvable »).
      if (_inCallDeliveryId == deliveryId) {
        _inCallDeliveryId = null;
      }
    }

    // Déjà en communication connectée sur ce fil : ne pas re-sonner.
    if (_inCallDeliveryId == deliveryId) return;

    await init();

    // Forcer une notification ValueNotifier même si un overlay fantôme restait.
    if (incoming.value?.deliveryId == deliveryId) {
      incoming.value = null;
    }
    incoming.value = IncomingCallInfo(
      deliveryId: deliveryId,
      peerLabel: peerLabel,
      starterId: starterId,
      kind: kind,
    );
    await HapticFeedback.heavyImpact();

    try {
      await _plugin.show(
        id: 77001,
        title: 'Appel vocal SENGA',
        body: '$peerLabel vous appelle — touchez Décrocher.',
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.call,
            fullScreenIntent: true,
            playSound: true,
            enableVibration: true,
            ongoing: true,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: false,
            // Son géré uniquement par AudioPlayer (boucle) — évite mélange APNs + asset.
            presentSound: false,
            interruptionLevel: InterruptionLevel.timeSensitive,
          ),
        ),
        payload: 'call:$deliveryId',
      );
    } catch (e) {
      if (kDebugMode) debugPrint('CallRing notif: $e');
    }

    if (_ringing) {
      _armSafety();
      return;
    }
    _ringing = true;
    _armSafety();
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      await _player.play(AssetSource(_assetSound), volume: 1.0);
    } catch (e) {
      _ringing = false;
      if (kDebugMode) debugPrint('CallRing audio: $e');
    }
  }

  static Future<void> stop({String? deliveryId}) async {
    final active = incoming.value?.deliveryId;
    if (deliveryId != null && active != null && deliveryId != active) {
      // Même si l’overlay a déjà été fermé, couper l’audio si on est encore
      // en sonnerie « fantôme » pour cette livraison.
      if (_ringing && _suppressChatRestart.contains(deliveryId)) {
        await _haltAudioAndNotif();
      }
      if (deliveryId.isNotEmpty) _suppressChatRestart.add(deliveryId);
      clearInCall(deliveryId);
      return;
    }
    final endedId = deliveryId ?? active;
    if (endedId != null && endedId.isNotEmpty) {
      _suppressChatRestart.add(endedId);
    }
    clearInCall(endedId);
    _safetyTimer?.cancel();
    _safetyTimer = null;
    _ringing = false;
    incoming.value = null;
    await _haltAudioAndNotif();
  }

  /// Force l’arrêt audio (raccroché) même sans match d’overlay.
  static Future<void> forceStop() async {
    final endedId = incoming.value?.deliveryId ?? _inCallDeliveryId;
    if (endedId != null && endedId.isNotEmpty) {
      _suppressChatRestart.add(endedId);
    }
    _inCallDeliveryId = null;
    _safetyTimer?.cancel();
    _safetyTimer = null;
    _ringing = false;
    incoming.value = null;
    await _haltAudioAndNotif();
  }

  static Future<void> _haltAudioAndNotif() async {
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.stop);
      // Abandonner le focus audio pour que WebRTC / LiveKit prenne le micro.
      try {
        await _player.setAudioContext(
          AudioContext(
            android: const AudioContextAndroid(
              audioFocus: AndroidAudioFocus.none,
            ),
            iOS: AudioContextIOS(
              category: AVAudioSessionCategory.ambient,
              options: const {AVAudioSessionOptions.mixWithOthers},
            ),
          ),
        );
      } catch (_) {
        /* ignore */
      }
      // Ne pas `release()` : ça casse souvent le son chat (autre AudioPlayer)
      // juste après un appel / une sonnerie.
    } catch (_) {
      /* ignore */
    }
    try {
      await _plugin.cancel(id: 77001);
    } catch (_) {
      /* ignore */
    }
  }

  static void _armSafety() {
    _safetyTimer?.cancel();
    _safetyTimer = Timer(_maxRing, () => unawaited(stop()));
  }
}
