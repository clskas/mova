import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notifications sonores + vibration + badge non-lus pour le chat.
class ChatAlertService {
  ChatAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static final AudioPlayer _player = AudioPlayer();
  static bool _initialized = false;
  static int _notificationId = 10000;

  /// Ex. `ride:abc`, `delivery:xyz` — pas de notification si le fil est ouvert.
  static String? activeThreadKey;

  /// Compteurs non-lus par fil (`ride:id` → n). Écoutez pour badges UI.
  static final ValueNotifier<Map<String, int>> unreadByThread =
      ValueNotifier<Map<String, int>>(const {});

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

  static const _channelId = 'mova_chat_v2';
  static const _channelName = 'Messages SENGA';
  static const _assetSound = 'sounds/senga_job.wav';

  static Future<void> init() async {
    if (_initialized) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
    );

    final androidPlugin =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
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
    try {
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.setVolume(1.0);
    } catch (_) {
      /* ignore */
    }
    _initialized = true;
  }

  static String threadKey(String kind, String id) => '$kind:$id';

  static int unreadCount(String kind, String threadId) {
    if (threadId.isEmpty) return 0;
    return unreadByThread.value[threadKey(kind, threadId)] ?? 0;
  }

  static int get totalUnread {
    var n = 0;
    for (final v in unreadByThread.value.values) {
      n += v;
    }
    return n;
  }

  static void clearUnread(String kind, String threadId) {
    if (threadId.isEmpty) return;
    final key = threadKey(kind, threadId);
    final next = Map<String, int>.from(unreadByThread.value);
    if (!next.containsKey(key)) return;
    next.remove(key);
    unreadByThread.value = next;
  }

  static void _bumpUnread(String kind, String threadId) {
    if (threadId.isEmpty) return;
    final key = threadKey(kind, threadId);
    if (activeThreadKey == key) return;
    final next = Map<String, int>.from(unreadByThread.value);
    next[key] = (next[key] ?? 0) + 1;
    unreadByThread.value = next;
  }

  static Future<void> _playChatSound() async {
    await HapticFeedback.mediumImpact();
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.play(AssetSource(_assetSound), volume: 1.0);
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert sound: $e');
      try {
        await SystemSound.play(SystemSoundType.alert);
      } catch (_) {
        /* ignore */
      }
    }
  }

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
    _bumpUnread(kind, threadId);
    await _playChatSound();

    final from = switch (senderRole) {
      'driver' => 'Chauffeur',
      'passenger' => 'Passager',
      'courier' => 'Livreur',
      'partner' => 'Restaurant',
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
          channelShowBadge: true,
          number: unreadCount(kind, threadId),
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          badgeNumber: totalUnread,
        ),
      ),
      payload: key,
    );
  }

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
    if (threadId.isNotEmpty) _bumpUnread(kind, threadId);
    await _playChatSound();

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
          channelShowBadge: true,
          number: threadId.isEmpty ? null : unreadCount(kind, threadId),
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          badgeNumber: totalUnread,
        ),
      ),
      payload: threadId.isEmpty ? null : threadKey(kind, threadId),
    );
  }
}
