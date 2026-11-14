import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../sos/notification_tap_router.dart';
import '../../core/i18n/i18n.dart';
import 'passenger_voice_announcer.dart';

/// Alertes passager : chauffeur trouvé, arrivée, course terminée.
class PassengerAlertService {
  PassengerAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static int _notificationId = 0;

  static const _channelId = 'mova_passenger_rides';
  static const _channelName = 'Courses SENGA';

  static Future<void> init() async {
    if (_initialized) return;

    try {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwinInit = DarwinInitializationSettings();
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
          tr(_channelName),
          description: tr('Mises à jour de vos courses taxi et moto'),
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 300, 120, 300]),
        ),
      );

      await androidPlugin?.requestNotificationsPermission();
      _initialized = true;
    } catch (_) {
      // Widget tests / unsupported platforms: skip native plugin init.
      _initialized = true;
    }
  }

  static Future<void> notify({
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_initialized) await init();
    try {
      final id = ++_notificationId;
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            tr(_channelName),
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        payload: payload,
      );
    } catch (_) {
      // Ignore when the notifications plugin is unavailable (tests / desktop).
    }
  }

  /// Phrase française annoncée à voix haute pour un statut de course (pure, testée).
  static String? rideSpeech(String status) => switch (status.toUpperCase()) {
        'DRIVER_ASSIGNED' || 'ACCEPTED' => 'Votre chauffeur est en route vers vous.',
        'ARRIVING' || 'DRIVER_ARRIVED' => 'Votre chauffeur vous attend au point de prise en charge.',
        'IN_PROGRESS' => 'Bon voyage avec SENGA !',
        'COMPLETED' => "Course terminée. Merci d'avoir voyagé avec SENGA.",
        'CANCELLED' => 'Votre course a été annulée.',
        _ => null,
      };

  /// Phrase française annoncée à voix haute pour un statut de livraison (pure, testée).
  static String? deliverySpeech(String status) => switch (status.toUpperCase()) {
        'RESTAURANT_CONFIRMED' => 'Le restaurant a confirmé votre commande.',
        'READY_FOR_PICKUP' => 'Un livreur va prendre en charge votre commande.',
        'PICKED_UP' => 'Votre livreur a récupéré votre commande.',
        'IN_TRANSIT' => 'Votre livraison arrive bientôt.',
        'DELIVERED' => "Merci d'avoir utilisé SENGA !",
        'CANCELLED' => 'Votre livraison a été annulée.',
        _ => null,
      };

  static Future<void> notifyRideStatus(String status) async {
    switch (status) {
      case 'DRIVER_ASSIGNED':
      case 'ACCEPTED':
        await notify(title: tr('Chauffeur assigné'), body: tr('Votre chauffeur est en route vers vous.'));
      case 'ARRIVING':
      case 'DRIVER_ARRIVED':
        await notify(title: tr('Chauffeur arrivé'), body: tr('Votre chauffeur vous attend au point de prise en charge.'));
      case 'IN_PROGRESS':
        await notify(title: tr('Course en cours'), body: tr('Bon voyage avec SENGA !'));
      case 'COMPLETED':
        await notify(title: tr('Course terminée'), body: tr('Pensez à régler le paiement si nécessaire.'));
      case 'CANCELLED':
        await notify(title: tr('Course annulée'), body: tr('Votre course a été annulée.'));
      default:
        break;
    }
    final speech = rideSpeech(status);
    if (speech != null) await PassengerVoiceAnnouncer.announce(speech);
  }

  static Future<void> notifyDeliveryStatus(String status) async {
    switch (status.toUpperCase()) {
      case 'PICKED_UP':
        await notify(title: tr('Colis pris en charge'), body: tr('Votre livreur a récupéré votre commande.'));
      case 'IN_TRANSIT':
        await notify(title: tr('Livreur en route'), body: tr('Votre livraison arrive bientôt.'));
      case 'DELIVERED':
        await notify(title: tr('Livraison terminée'), body: tr('Merci d\'avoir utilisé SENGA !'));
      case 'READY_FOR_PICKUP':
        await notify(title: tr('Commande prête'), body: tr('Un livreur va prendre en charge votre commande.'));
      case 'RESTAURANT_CONFIRMED':
        await notify(title: tr('Commande confirmée'), body: tr('Le restaurant a confirmé votre commande.'));
      case 'CANCELLED':
        await notify(title: tr('Livraison annulée'), body: tr('Votre livraison a été annulée.'));
      default:
        break;
    }
    final speech = deliverySpeech(status);
    if (speech != null) await PassengerVoiceAnnouncer.announce(speech);
  }
}
