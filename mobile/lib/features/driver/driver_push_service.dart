import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import 'driver_job_alert_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await DriverJobAlertService.init();
  final title = message.notification?.title ?? message.data['title']?.toString() ?? 'MOVA Chauffeur';
  final body = message.notification?.body ?? message.data['body']?.toString() ?? 'Nouvelle alerte';
  await DriverJobAlertService.notify(title: title, body: body, payload: message.data['type']?.toString());
}

/// Enregistre le token FCM (si Firebase configuré) pour les push même app fermée.
/// Copiez `android/app/google-services.json.example` vers `google-services.json`
/// après création du projet Firebase (package `cd.mova.mova.driver`).
class DriverPushService {
  DriverPushService._();

  static bool _initialized = false;

  static Future<void> init(ApiClient api) async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await DriverJobAlertService.init();

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

      FirebaseMessaging.onMessage.listen((message) async {
        final title = message.notification?.title ?? message.data['title']?.toString() ?? 'MOVA Chauffeur';
        final body = message.notification?.body ?? message.data['body']?.toString() ?? 'Nouvelle alerte';
        await DriverJobAlertService.notify(title: title, body: body, payload: message.data['type']?.toString());
      });

      final token = await messaging.getToken();
      if (token != null) {
        await _registerToken(api, token);
      }
      messaging.onTokenRefresh.listen((token) => _registerToken(api, token));
      _initialized = true;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('FCM non disponible (ajoutez google-services.json) : $e');
      }
    }
  }

  static Future<void> _registerToken(ApiClient api, String token) async {
    final result = await api.post('/notifications/push-tokens', {
      'token': token,
      'platform': defaultTargetPlatform.name,
      'appFlavor': 'driver',
    });
    if (result case Failure(:final error)) {
      if (kDebugMode) debugPrint('Enregistrement token push échoué : ${error.message}');
    }
  }
}
