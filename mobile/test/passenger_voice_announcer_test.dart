import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/passenger/passenger_alert_service.dart';
import 'package:mova/features/passenger/passenger_voice_announcer.dart';

void main() {
  test('chaque étape de course a une annonce, annulation comprise', () {
    expect(PassengerAlertService.rideSpeech('ACCEPTED'), 'Votre chauffeur est en route vers vous.');
    expect(PassengerAlertService.rideSpeech('DRIVER_ARRIVED'), contains('vous attend'));
    expect(PassengerAlertService.rideSpeech('CANCELLED'), 'Votre course a été annulée.');
    expect(PassengerAlertService.rideSpeech('SEARCHING'), isNull);
  });

  test('chaque étape de livraison a une annonce', () {
    for (final s in ['RESTAURANT_CONFIRMED', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']) {
      expect(PassengerAlertService.deliverySpeech(s), isNotNull, reason: s);
    }
    expect(PassengerAlertService.deliverySpeech('PENDING'), isNull);
  });

  test('voix selon la langue ; le lingala parle français', () {
    expect(PassengerVoiceAnnouncer.voiceFor('en').locale, 'en-US');
    expect(PassengerVoiceAnnouncer.voiceFor('sw').locale, 'sw-KE');
    expect(PassengerVoiceAnnouncer.voiceFor('ln'), (locale: 'fr-FR', useFrench: true));
    expect(PassengerVoiceAnnouncer.voiceFor('fr').useFrench, isTrue);
  });
}
