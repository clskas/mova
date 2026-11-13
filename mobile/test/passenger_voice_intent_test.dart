import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/voice/voice_command_button.dart';

void main() {
  test('passenger voice words map to the right action', () {
    expect(parsePassengerVoiceIntent('je veux un taxi'), PassengerVoiceIntent.taxi);
    expect(parsePassengerVoiceIntent('une moto'), PassengerVoiceIntent.taxi);
    expect(parsePassengerVoiceIntent('envoyer un colis'), PassengerVoiceIntent.parcel);
    expect(parsePassengerVoiceIntent("j'ai faim, commander un repas"), PassengerVoiceIntent.food);
    expect(parsePassengerVoiceIntent('livraison express'), PassengerVoiceIntent.delivery);
    expect(parsePassengerVoiceIntent('réserver pour demain'), PassengerVoiceIntent.scheduled);
    expect(parsePassengerVoiceIntent('covoiturage'), PassengerVoiceIntent.carpool);
    expect(parsePassengerVoiceIntent('louer une voiture'), PassengerVoiceIntent.rental);
    expect(parsePassengerVoiceIntent('déménagement'), PassengerVoiceIntent.moving);
    expect(parsePassengerVoiceIntent('mon solde'), PassengerVoiceIntent.wallet);
    expect(parsePassengerVoiceIntent('historique'), PassengerVoiceIntent.history);
    expect(parsePassengerVoiceIntent('où est ma course'), PassengerVoiceIntent.myRide);
    expect(parsePassengerVoiceIntent('annuler la course'), PassengerVoiceIntent.cancel);
    expect(parsePassengerVoiceIntent('appelle le chauffeur'), PassengerVoiceIntent.callDriver);
    expect(parsePassengerVoiceIntent('partager mon trajet'), PassengerVoiceIntent.share);
    expect(parsePassengerVoiceIntent('au secours'), PassengerVoiceIntent.sos);
    expect(parsePassengerVoiceIntent('payer la course'), PassengerVoiceIntent.pay);
    expect(parsePassengerVoiceIntent("j'ai payé en espèces"), PassengerVoiceIntent.cashPaid);
    expect(parsePassengerVoiceIntent("j'ai reçu le colis"), PassengerVoiceIntent.received);
    expect(parsePassengerVoiceIntent('bonjour'), PassengerVoiceIntent.unknown);
  });
}
