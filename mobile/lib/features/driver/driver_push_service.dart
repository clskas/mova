import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../sos/notification_tap_router.dart';
import 'driver_job_alert_service.dart';

String? _sosPayloadFromFcm(Map<String, dynamic> data, {String? title, String? body}) {
  final type = data['type']?.toString() ?? '';
  if (type != 'INCIDENT_CREATED' && type != 'SOS') return null;
  return NotificationTapRouter.encodeSosPayload(
    incidentId: data['incidentId']?.toString(),
    title: title ?? data['title']?.toString() ?? 'Alerte SOS',
    body: body ?? data['body']?.toString(),
    lat: double.tryParse(data['lat']?.toString() ?? ''),
    lng: double.tryParse(data['lng']?.toString() ?? ''),
    rideId: data['rideId']?.toString(),
    referenceType: data['referenceType']?.toString(),
    referenceId: data['referenceId']?.toString(),
    forOps: data['forOps']?.toString() == '1' || data['forOps'] == true,
  );
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Si FCM a déjà affiché une notification système (son inclus), éviter le double bip.
  if (message.notification != null) return;
  await DriverJobAlertService.init();
  final title = message.data['title']?.toString() ?? 'SENGA Driver';
  final body = message.data['body']?.toString() ?? 'Nouvelle alerte';
  final jobKind = message.data['jobKind']?.toString() ?? message.data['type']?.toString() ?? '';
  final sosPayload = _sosPayloadFromFcm(message.data, title: title, body: body);
  final refId = message.data['referenceId']?.toString() ??
      message.data['rideId']?.toString() ??
      message.data['deliveryId']?.toString();
  final isOffer = sosPayload == null &&
      (jobKind.contains('RIDE') ||
          jobKind.contains('DELIVERY') ||
          jobKind.contains('OFFER') ||
          jobKind.contains('JOB') ||
          jobKind.contains('CALL'));
  String? offerKey;
  if (isOffer && refId != null && refId.isNotEmpty) {
    final kind = jobKind.contains('DELIVERY') ? 'delivery' : 'ride';
    offerKey = DriverJobAlertService.offerKey(kind, refId);
  }
  await DriverJobAlertService.notify(
    title: title,
    body: body,
    payload: sosPayload ?? (jobKind.isNotEmpty ? jobKind : message.data['type']?.toString()),
    ringUntilStopped: isOffer,
    offerKey: offerKey,
  );
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
        final title = message.notification?.title ?? message.data['title']?.toString() ?? 'SENGA Driver';
        final body = message.notification?.body ?? message.data['body']?.toString() ?? 'Nouvelle alerte';
        final jobKind = message.data['jobKind']?.toString() ?? message.data['type']?.toString() ?? '';
        final sosPayload = _sosPayloadFromFcm(message.data, title: title, body: body);
        final refId = message.data['referenceId']?.toString() ??
            message.data['rideId']?.toString() ??
            message.data['deliveryId']?.toString();
        final isOffer = sosPayload == null &&
            (jobKind.contains('RIDE') ||
                jobKind.contains('DELIVERY') ||
                jobKind.contains('OFFER') ||
                jobKind.contains('JOB'));
        // Évite un 2ᵉ bip « système » pendant que la sonnerie SENGA tourne déjà via le poll.
        if (isOffer && DriverJobAlertService.isRinging) return;
        String? offerKey;
        if (isOffer && refId != null && refId.isNotEmpty) {
          final kind = jobKind.contains('DELIVERY') ? 'delivery' : 'ride';
          offerKey = DriverJobAlertService.offerKey(kind, refId);
        }
        await DriverJobAlertService.notify(
          title: title,
          body: body,
          payload: sosPayload ?? jobKind,
          ringUntilStopped: isOffer,
          offerKey: offerKey,
        );
      });

      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        NotificationTapRouter.openFromFcmData(
          Map<String, dynamic>.from(message.data),
          title: message.notification?.title,
          body: message.notification?.body,
        );
      });
      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        NotificationTapRouter.openFromFcmData(
          Map<String, dynamic>.from(initial.data),
          title: initial.notification?.title,
          body: initial.notification?.body,
        );
      }

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
