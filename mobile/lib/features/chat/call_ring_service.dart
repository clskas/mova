import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Sonnerie d'appel vocal LiveKit (livraison) — boucle jusqu'à stop ou timeout.
class CallRingService {
  CallRingService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static final AudioPlayer _player = AudioPlayer();
  static bool _initialized = false;
  static bool _ringing = false;
  static String? _activeDeliveryId;
  static Timer? _safetyTimer;
  static const _maxRing = Duration(seconds: 45);
  static const _assetSound = 'sounds/senga_job.wav';
  static const _channelId = 'mova_voice_call';
  static const _channelName = 'Appels vocaux SENGA';

  static bool get isRinging => _ringing;
  static String? get activeDeliveryId => _activeDeliveryId;

  static Future<void> init() async {
    if (_initialized) return;
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
    );
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'Sonnerie pour rejoindre un appel vocal livraison',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ),
    );
    await android?.requestNotificationsPermission();
    _initialized = true;
  }

  /// Démarre la sonnerie pour un appel entrant (ignore si on est déjà l'appelant).
  static Future<void> startIncoming({
    required String deliveryId,
    required String starterId,
    String? myUserId,
    String peerLabel = 'Contact',
  }) async {
    if (myUserId != null && myUserId.isNotEmpty && starterId == myUserId) return;
    await init();
    _activeDeliveryId = deliveryId;
    await HapticFeedback.heavyImpact();

    try {
      await _plugin.show(
        id: 77001,
        title: 'Appel vocal SENGA',
        body: '$peerLabel vous appelle — ouvrez « Appeler » pour répondre.',
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
            presentBadge: true,
            presentSound: true,
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
    if (deliveryId != null &&
        _activeDeliveryId != null &&
        deliveryId != _activeDeliveryId) {
      return;
    }
    _safetyTimer?.cancel();
    _safetyTimer = null;
    _ringing = false;
    _activeDeliveryId = null;
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.stop);
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
