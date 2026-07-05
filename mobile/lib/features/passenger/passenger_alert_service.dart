import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Alertes passager : chauffeur trouvé, arrivée, course terminée.
class PassengerAlertService {
  PassengerAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static int _notificationId = 0;

  static const _channelId = 'mova_passenger_rides';
  static const _channelName = 'Courses MOVA';

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
        description: 'Mises à jour de vos courses taxi et moto',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList([0, 300, 120, 300]),
      ),
    );

    await androidPlugin?.requestNotificationsPermission();
    _initialized = true;
  }

  static Future<void> notify({
    required String title,
    required String body,
  }) async {
    if (!_initialized) await init();
    final id = ++_notificationId;
    await _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  static Future<void> notifyRideStatus(String status) async {
    switch (status) {
      case 'DRIVER_ASSIGNED':
      case 'ACCEPTED':
        await notify(title: 'Chauffeur assigné', body: 'Votre chauffeur est en route vers vous.');
      case 'ARRIVING':
      case 'DRIVER_ARRIVED':
        await notify(title: 'Chauffeur arrivé', body: 'Votre chauffeur vous attend au point de prise en charge.');
      case 'IN_PROGRESS':
        await notify(title: 'Course en cours', body: 'Bon voyage avec MOVA !');
      case 'COMPLETED':
        await notify(title: 'Course terminée', body: 'Pensez à régler le paiement si nécessaire.');
      default:
        break;
    }
  }
}
