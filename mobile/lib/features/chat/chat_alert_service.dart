import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notifications sonores + vibration pour les messages chat (hors écran chat ouvert).
class ChatAlertService {
  ChatAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static int _notificationId = 10000;

  /// Ex. `ride:abc`, `delivery:xyz` — pas de notification si le fil est ouvert.
  static String? activeThreadKey;

  static const _channelId = 'mova_chat';
  static const _channelName = 'Messages MOVA';

  static Future<void> init() async {
    if (_initialized) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
    );

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'Nouveaux messages passager / chauffeur / livreur',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList([0, 250, 100, 250]),
      ),
    );

    await androidPlugin?.requestNotificationsPermission();
    _initialized = true;
  }

  static String threadKey(String kind, String id) => '$kind:$id';

  static Future<void> notifyIncoming({
    required String kind,
    required String threadId,
    required String senderRole,
    required String text,
    String peerLabel = 'Contact',
  }) async {
    final key = threadKey(kind, threadId);
    if (activeThreadKey == key) return;
    if (text.trim().isEmpty) return;

    await init();
    await HapticFeedback.mediumImpact();
    await SystemSound.play(SystemSoundType.alert);

    final from = switch (senderRole) {
      'driver' => 'Chauffeur',
      'passenger' => 'Passager',
      'courier' => 'Livreur',
      _ => peerLabel,
    };

    final id = ++_notificationId;
    await _plugin.show(
      id: id,
      title: 'Message — $from',
      body: text.length > 120 ? '${text.substring(0, 117)}…' : text,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 250, 100, 250]),
          ticker: 'Nouveau message MOVA',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: key,
    );
  }
}
