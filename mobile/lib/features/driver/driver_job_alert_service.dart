import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Alertes chauffeur : vibration, son système et notification tray (y compris arrière-plan).
class DriverJobAlertService {
  DriverJobAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static int _notificationId = 0;

  static const _channelId = 'mova_driver_jobs';
  static const _channelName = 'Missions & courses MOVA';

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
        description: 'Nouvelles courses, livraisons et missions assignées',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList([0, 450, 180, 450]),
        audioAttributesUsage: AudioAttributesUsage.alarm,
      ),
    );

    await androidPlugin?.requestNotificationsPermission();
    _initialized = true;
  }

  static Future<void> notify({
    required String title,
    required String body,
    String? payload,
  }) async {
    await init();
    await HapticFeedback.heavyImpact();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await HapticFeedback.heavyImpact();
    await SystemSound.play(SystemSoundType.alert);

    final id = ++_notificationId;
    await _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: 'Alertes chauffeur MOVA',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.call,
          fullScreenIntent: true,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 450, 180, 450]),
          audioAttributesUsage: AudioAttributesUsage.alarm,
          ticker: title,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          interruptionLevel: InterruptionLevel.timeSensitive,
        ),
      ),
      payload: payload,
    );
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
    final fare = offer['estimatedFareCdf'];
    if (fare != null) return 'Course disponible · $pickup · $fare FC';
    return 'Nouvelle course disponible · $pickup';
  }

  static String deliveryOfferMessage(Map<String, dynamic> offer) {
    final kind = offer['type']?.toString() ?? offer['deliveryType']?.toString() ?? 'Livraison';
    final pickup = offer['pickupAddress']?.toString() ?? '';
    if (pickup.isNotEmpty) return '$kind · $pickup';
    return 'Nouvelle livraison disponible';
  }
}
