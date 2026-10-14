import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../core/config/market_config.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/geo/geo_utils.dart';
import 'driver_alert_prefs.dart';

/// Alertes chauffeur : vibration + **son SENGA dédié** (ou son système / mute).
///
/// Pour courses/livraisons : sonnerie en boucle (comme un appel) jusqu’à
/// [stopRinging] — acceptation, refus, annulation passager, ou offre disparue.
///
/// Android : canaux distincts (le son d’un canal est immuable après création).
/// iOS : `senga_job.wav` ou son par défaut / silencieux selon les prefs.
class DriverJobAlertService {
  DriverJobAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static final AudioPlayer _player = AudioPlayer();
  static bool _initialized = false;
  static int _notificationId = 0;

  static bool _ringing = false;
  static final Set<String> _activeOfferKeys = {};
  static Timer? _ringSafetyTimer;
  static const _maxRingDuration = Duration(minutes: 3);

  /// v5 : aligné FCM (`mova_driver_jobs_v5`) — les canaux Android sont immuables.
  static const _channelSengaId = 'mova_driver_jobs_v5';
  static const _channelSystemId = 'mova_driver_jobs_system_v3';
  static const _channelSilentId = 'mova_driver_jobs_silent_v3';
  static const _channelName = 'Missions & courses SENGA';
  static const _androidSound = RawResourceAndroidNotificationSound('senga_job');
  static const _iosSound = 'senga_job.wav';
  static const _assetSound = 'sounds/senga_job.wav';

  static bool get isRinging => _ringing;

  static Future<void> init() async {
    if (_initialized) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
    );

    final androidPlugin =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final vibration = Int64List.fromList([0, 450, 180, 450]);

    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _channelSystemId,
        '$_channelName (son téléphone)',
        description: 'Missions avec le son de notification système',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        vibrationPattern: vibration,
        audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
      ),
    );
    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _channelSilentId,
        '$_channelName (sans son)',
        description: 'Missions en vibration seule (son coupé dans l’app)',
        importance: Importance.max,
        playSound: false,
        enableVibration: true,
        vibrationPattern: vibration,
        audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
      ),
    );
    try {
      await androidPlugin?.createNotificationChannel(
        AndroidNotificationChannel(
          _channelSengaId,
          _channelName,
          description: 'Nouvelles courses, livraisons et missions — son SENGA',
          importance: Importance.max,
          playSound: true,
          sound: _androidSound,
          enableVibration: true,
          vibrationPattern: vibration,
          audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
        ),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('Canal SENGA indisponible, fallback système : $e');
    }

    await androidPlugin?.requestNotificationsPermission();
    await DriverAlertPrefs.ensureLoaded();
    try {
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.setPlayerMode(PlayerMode.mediaPlayer);
      await _player.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            isSpeakerphoneOn: true,
            stayAwake: true,
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

  /// Joue le WAV SENGA une fois (test / mission ponctuelle).
  static Future<void> playSengaSound() async {
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.play(AssetSource(_assetSound), volume: 1.0);
    } catch (e) {
      if (kDebugMode) debugPrint('Lecture son SENGA (in-app) échouée : $e');
    }
  }

  /// Sonnerie en boucle jusqu’à [stopRinging] (acceptation / annulation / refus).
  static Future<void> startRinging({String? offerKey}) async {
    await init();
    await DriverAlertPrefs.ensureLoaded();
    if (DriverAlertPrefs.muted) return;

    if (offerKey != null && offerKey.isNotEmpty) {
      _activeOfferKeys.add(offerKey);
    }

    if (_ringing) {
      _armRingSafety();
      return;
    }

    _ringing = true;
    _armRingSafety();
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      await _player.play(AssetSource(_assetSound), volume: 1.0);
    } catch (e) {
      _ringing = false;
      if (kDebugMode) debugPrint('Sonnerie SENGA (boucle) échouée : $e');
    }
  }

  /// Arrête la sonnerie. Si [offerKey] est fourni, n’arrête que si plus aucune
  /// offre active (ou si c’est la dernière clé suivie).
  static Future<void> stopRinging({String? offerKey}) async {
    if (offerKey != null && offerKey.isNotEmpty) {
      _activeOfferKeys.remove(offerKey);
      if (_activeOfferKeys.isNotEmpty) return;
    } else {
      _activeOfferKeys.clear();
    }
    await _haltRingPlayer();
  }

  /// Synchronise les offres encore ouvertes : coupe le son si plus aucune offre.
  static Future<void> syncActiveOffers(Set<String> openOfferKeys) async {
    _activeOfferKeys.removeWhere((k) => !openOfferKeys.contains(k));
    if (_activeOfferKeys.isEmpty) {
      await _haltRingPlayer();
    }
  }

  static Future<void> _haltRingPlayer() async {
    _ringSafetyTimer?.cancel();
    _ringSafetyTimer = null;
    _ringing = false;
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.stop);
    } catch (_) {
      /* ignore */
    }
    // Retirer la notif « ongoing » type appel si elle était affichée.
    try {
      if (_notificationId > 0) {
        await _plugin.cancel(id: _notificationId);
      }
    } catch (_) {
      /* ignore */
    }
  }

  static void _armRingSafety() {
    _ringSafetyTimer?.cancel();
    _ringSafetyTimer = Timer(_maxRingDuration, () {
      unawaited(_haltRingPlayer());
    });
  }

  static Future<void> notify({
    required String title,
    required String body,
    String? payload,
    /// Sonnerie continue (courses / livraisons) jusqu’à [stopRinging].
    bool ringUntilStopped = false,
    String? offerKey,
  }) async {
    await init();
    await DriverAlertPrefs.ensureLoaded();
    final muted = DriverAlertPrefs.muted;
    final style = DriverAlertPrefs.style;

    try {
      await HapticFeedback.heavyImpact();
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await HapticFeedback.heavyImpact();
    } catch (_) {
      /* ignore — haptics absents en isolate background */
    }

    final preferSenga = !muted && style == DriverAlertSoundStyle.senga;
    final channelId = muted
        ? _channelSilentId
        : (preferSenga ? _channelSengaId : _channelSystemId);
    final playSound = !muted;

    final id = ++_notificationId;
    final shown = await _showSafe(
      id: id,
      title: title,
      body: body,
      payload: payload,
      channelId: channelId,
      playSound: playSound,
      useSengaSound: preferSenga,
      asCall: ringUntilStopped,
    );

    if (!shown && preferSenga) {
      await _showSafe(
        id: id,
        title: title,
        body: body,
        payload: payload,
        channelId: _channelSystemId,
        playSound: true,
        useSengaSound: false,
        asCall: ringUntilStopped,
      );
    }

    if (muted) return;

    if (ringUntilStopped) {
      // Boucle in-app (volume sonnerie) — fiable au premier plan et avec l’écran offres.
      unawaited(startRinging(offerKey: offerKey));
    } else if (preferSenga) {
      unawaited(playSengaSound());
    }
  }

  static Future<bool> _showSafe({
    required int id,
    required String title,
    required String body,
    required String? payload,
    required String channelId,
    required bool playSound,
    required bool useSengaSound,
    bool asCall = false,
  }) async {
    try {
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            channelId,
            _channelName,
            channelDescription: 'Alertes chauffeur SENGA',
            importance: Importance.max,
            priority: Priority.max,
            category: asCall
                ? AndroidNotificationCategory.call
                : AndroidNotificationCategory.message,
            playSound: playSound,
            sound: null,
            enableVibration: true,
            vibrationPattern: Int64List.fromList([0, 450, 180, 450]),
            audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
            ticker: title,
            ongoing: asCall,
            autoCancel: !asCall,
            fullScreenIntent: asCall,
            visibility: NotificationVisibility.public,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: playSound && !asCall,
            // La boucle in-app gère le son « appel » ; évite un bip unique court.
            sound: (!asCall && useSengaSound) ? _iosSound : null,
            interruptionLevel: InterruptionLevel.timeSensitive,
          ),
        ),
        payload: payload,
      );
      return true;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Notification locale échouée (canal=$channelId, senga=$useSengaSound) : $e');
      }
      return false;
    }
  }

  static String missionKey(Map<String, dynamic> mission) {
    final id = mission['id']?.toString() ?? '';
    final type = mission['type']?.toString() ?? 'MISSION';
    return '$type:$id';
  }

  static String offerKey(String kind, String id) => '$kind:$id';

  static String messageForMissions(List<Map<String, dynamic>> missions) {
    if (missions.isEmpty) return 'Nouvelle mission assignée';
    if (missions.length > 1) return '${missions.length} nouvelles missions assignées';
    final m = missions.first;
    final label = m['label']?.toString() ??
        switch (m['type']?.toString()) {
          'RENTAL' => 'Location véhicule',
          'MOVING' => 'Déménagement',
          'SCHEDULED' => 'Course planifiée',
          'ERRAND' => 'Courses & commissions',
          _ => 'Mission',
        };
    return 'Nouvelle mission : $label';
  }

  static String rideOfferMessage(Map<String, dynamic> offer) {
    final pickup = offer['pickupAddress']?.toString() ?? 'près de vous';
    final driverNet = DriverEarningsDisplay.netFromMap(offer);
    final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
    final dist = pickupKm != null ? ' · ${GeoUtils.formatDistanceKm(pickupKm)}' : '';
    if (driverNet != null) return 'Course · $pickup$dist · ${MarketConfig.formatCdf(driverNet)}';
    return 'Nouvelle course disponible · $pickup$dist';
  }

  static String deliveryOfferMessage(Map<String, dynamic> offer) {
    final kind = offer['type']?.toString() ?? offer['deliveryType']?.toString() ?? 'Livraison';
    final pickup = offer['pickupAddress']?.toString() ?? '';
    final driverNet = DriverEarningsDisplay.netFromMap(offer);
    final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
    final tripKm =
        (offer['tripDistanceKm'] as num?)?.toDouble() ?? (offer['distanceKm'] as num?)?.toDouble();
    final parts = <String>[kind];
    if (pickup.isNotEmpty) parts.add(pickup);
    if (pickupKm != null) parts.add('à ${GeoUtils.formatDistanceKm(pickupKm)}');
    if (tripKm != null) parts.add('trajet ${GeoUtils.formatDistanceKm(tripKm)}');
    if (driverNet != null) parts.add(MarketConfig.formatCdf(driverNet));
    return parts.join(' · ');
  }
}
