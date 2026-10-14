import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../sos/notification_tap_router.dart';

/// Notifications sonores + vibration + badge non-lus pour le chat.
class ChatAlertService {
  ChatAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static AudioPlayer _player = AudioPlayer(playerId: 'senga_chat_alert');
  static bool _initialized = false;
  static int _notificationId = 10000;
  static const _prefsKey = 'senga_chat_unread_v1';

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

  static const _channelId = 'mova_chat_v3';
  static const _channelName = 'Messages SENGA';
  static const _assetSound = 'sounds/senga_job.wav';

  static Future<void> init() async {
    if (_initialized) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
      onDidReceiveNotificationResponse: NotificationTapRouter.onLocalNotificationResponse,
      onDidReceiveBackgroundNotificationResponse:
          NotificationTapRouter.onBackgroundNotificationResponse,
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
    await _iosRequestPermissions();
    await _configurePlayer();
    await _restoreUnread();
    _initialized = true;
  }

  static Future<void> _iosRequestPermissions() async {
    final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    await ios?.requestPermissions(alert: true, badge: true, sound: true);
  }

  static Future<void> _configurePlayer() async {
    try {
      final ctx = AudioContextConfig(
        route: AudioContextConfigRoute.system,
        focus: AudioContextConfigFocus.duckOthers,
        respectSilence: false,
        stayAwake: false,
      ).build();
      await _player.setAudioContext(ctx);
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.setVolume(1.0);
      await _player.setPlayerMode(PlayerMode.mediaPlayer);
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert player config: $e');
    }
  }

  static Future<void> _recreatePlayer() async {
    try {
      await _player.dispose();
    } catch (_) {
      /* ignore */
    }
    _player = AudioPlayer(playerId: 'senga_chat_alert');
    await _configurePlayer();
  }

  static Future<void> _restoreUnread() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final map = <String, int>{};
      for (final e in decoded.entries) {
        final n = e.value;
        if (n is int && n > 0) {
          map[e.key.toString()] = n;
        } else if (n is num && n > 0) {
          map[e.key.toString()] = n.toInt();
        }
      }
      if (map.isNotEmpty) unreadByThread.value = map;
    } catch (_) {
      /* ignore */
    }
  }

  static Future<void> _persistUnread() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(unreadByThread.value));
    } catch (_) {
      /* ignore */
    }
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
    unawaited(_persistUnread());
  }

  static void _bumpUnread(String kind, String threadId) {
    if (threadId.isEmpty) return;
    final key = threadKey(kind, threadId);
    if (activeThreadKey == key) return;
    final next = Map<String, int>.from(unreadByThread.value);
    next[key] = (next[key] ?? 0) + 1;
    unreadByThread.value = next;
    unawaited(_persistUnread());
  }

  static Future<void> _playChatSound() async {
    await HapticFeedback.mediumImpact();
    try {
      await _player.stop();
      await _player.play(AssetSource(_assetSound), volume: 1.0);
      return;
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert sound: $e');
    }
    try {
      await _recreatePlayer();
      await _player.play(AssetSource(_assetSound), volume: 1.0);
      return;
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert sound retry: $e');
    }
    try {
      await SystemSound.play(SystemSoundType.alert);
    } catch (_) {
      /* ignore */
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
    try {
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
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert notif: $e');
    }
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
    try {
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
    } catch (e) {
      if (kDebugMode) debugPrint('ChatAlert notif: $e');
    }
  }
}
