import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/voice/voice_command_button.dart';

void main() {
  test('driver voice words map to the right action', () {
    expect(parseDriverVoiceIntent('Je suis arrivé'), DriverVoiceIntent.arrived);
    expect(parseDriverVoiceIntent('on démarre'), DriverVoiceIntent.start);
    expect(parseDriverVoiceIntent('Course terminée'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('arrivé à destination'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('itinéraire'), DriverVoiceIntent.navigate);
    expect(parseDriverVoiceIntent('appelle le passager'), DriverVoiceIntent.callPassenger);
    expect(parseDriverVoiceIntent('mets-moi en ligne'), DriverVoiceIntent.online);
    expect(parseDriverVoiceIntent('hors ligne'), DriverVoiceIntent.offline);
    expect(parseDriverVoiceIntent("j'accepte"), DriverVoiceIntent.accept);
    expect(parseDriverVoiceIntent('je refuse'), DriverVoiceIntent.reject);
    expect(parseDriverVoiceIntent('bonjour'), DriverVoiceIntent.unknown);
  });

  test('new driver actions: cancel, cash, Pool, delivery', () {
    expect(parseDriverVoiceIntent('annuler la course'), DriverVoiceIntent.cancel);
    expect(parseDriverVoiceIntent('le passager est absent'), DriverVoiceIntent.cancel);
    expect(parseDriverVoiceIntent('cash reçu'), DriverVoiceIntent.cashReceived);
    expect(parseDriverVoiceIntent("j'ai reçu l'argent"), DriverVoiceIntent.cashReceived);
    expect(parseDriverVoiceIntent('cash non reçu'), DriverVoiceIntent.cashNotReceived);
    expect(parseDriverVoiceIntent("il n'a pas payé"), DriverVoiceIntent.cashNotReceived);
    expect(parseDriverVoiceIntent('passager pris'), DriverVoiceIntent.passengerPicked);
    expect(parseDriverVoiceIntent('passager déposé'), DriverVoiceIntent.passengerDropped);
    expect(parseDriverVoiceIntent('colis livré'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('en route vers le client'), DriverVoiceIntent.start);
    expect(parseDriverVoiceIntent('le destinataire est injoignable'), DriverVoiceIntent.unreachable);
  });

  test('admin voice settings: only valid values are applied', () {
    applyDriverVoiceConfig({'autoListenEnabled': false, 'autoListenSeconds': 15});
    expect(kDriverVoiceAutoListen, isFalse);
    expect(kDriverVoiceAutoListenSeconds, 15);
    applyDriverVoiceConfig({'autoListenSeconds': 99});
    expect(kDriverVoiceAutoListenSeconds, 15);
    applyDriverVoiceConfig({'autoListenEnabled': true, 'autoListenSeconds': 10});
  });
}
