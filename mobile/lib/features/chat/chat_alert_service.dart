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

  /// Déduplique les messages déjà signalés (WebSocket temps réel ET poll serveur
  /// partagent le même id de message → une seule bannière).
  static final Set<String> _shownMessageIds = <String>{};

  static bool _markShown(String? messageId) {
    if (messageId == null || messageId.isEmpty) return true;
    if (_shownMessageIds.contains(messageId)) return false;
    _shownMessageIds.add(messageId);
    if (_shownMessageIds.length > 400) {
      _shownMessageIds.remove(_shownMessageIds.first);
    }
    return true;
  }

  static const _channelId = 'mova_chat';
  static const _channelName = 'Messages SENGA';

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
    String? messageId,
  }) async {
    final key = threadKey(kind, threadId);
    if (activeThreadKey == key) return;
    if (text.trim().isEmpty) return;
    if (!_markShown(messageId)) return;

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
          ticker: 'Nouveau message SENGA',
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

  /// Bannière issue d'une notification serveur (poll local, sans FCM). Le titre
  /// et le corps sont déjà formatés côté serveur (« Message du passager », « Reçu
  /// de paiement »…). Respecte le fil ouvert et la déduplication par messageId.
  static Future<void> notifyFromServer({
    required String kind,
    required String threadId,
    String? messageId,
    required String title,
    required String body,
  }) async {
    if (threadId.isNotEmpty && activeThreadKey == threadKey(kind, threadId)) return;
    if (!_markShown(messageId)) return;
    if (title.trim().isEmpty && body.trim().isEmpty) return;

    await init();
    await HapticFeedback.mediumImpact();
    await SystemSound.play(SystemSoundType.alert);

    final id = ++_notificationId;
    await _plugin.show(
      id: id,
      title: title.isEmpty ? 'Message SENGA' : title,
      body: body.length > 120 ? '${body.substring(0, 117)}…' : body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 250, 100, 250]),
          ticker: 'Nouveau message SENGA',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: threadId.isEmpty ? null : threadKey(kind, threadId),
    );
  }
}
