import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/i18n/i18n.dart';
import 'package:mova/core/voice/voice_command_button.dart';

void main() {
  test('driver words in English and Swahili', () {
    expect(parseDriverVoiceIntent('accept'), DriverVoiceIntent.accept);
    expect(parseDriverVoiceIntent('nakubali'), DriverVoiceIntent.accept);
    expect(parseDriverVoiceIntent('reject'), DriverVoiceIntent.reject);
    expect(parseDriverVoiceIntent('kataa'), DriverVoiceIntent.reject);
    expect(parseDriverVoiceIntent("I've arrived"), DriverVoiceIntent.arrived);
    expect(parseDriverVoiceIntent('nimefika'), DriverVoiceIntent.arrived);
    expect(parseDriverVoiceIntent('start the trip'), DriverVoiceIntent.start);
    expect(parseDriverVoiceIntent('tuanze'), DriverVoiceIntent.start);
    expect(parseDriverVoiceIntent('finish'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('nimemaliza'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('cancel the ride'), DriverVoiceIntent.cancel);
    expect(parseDriverVoiceIntent('ghairi'), DriverVoiceIntent.cancel);
    expect(parseDriverVoiceIntent('cash received'), DriverVoiceIntent.cashReceived);
    expect(parseDriverVoiceIntent('sijapokea pesa'), DriverVoiceIntent.cashNotReceived);
    expect(parseDriverVoiceIntent('go offline'), DriverVoiceIntent.offline);
    expect(parseDriverVoiceIntent('go online'), DriverVoiceIntent.online);
    expect(parseDriverVoiceIntent('ramani'), DriverVoiceIntent.navigate);
  });

  test('passenger words in English and Swahili', () {
    expect(parsePassengerVoiceIntent('I need a taxi'), PassengerVoiceIntent.taxi);
    expect(parsePassengerVoiceIntent('nataka pikipiki'), PassengerVoiceIntent.taxi);
    expect(parsePassengerVoiceIntent('send a parcel'), PassengerVoiceIntent.parcel);
    expect(parsePassengerVoiceIntent('nina njaa, chakula'), PassengerVoiceIntent.food);
    expect(parsePassengerVoiceIntent('cancel'), PassengerVoiceIntent.cancel);
    expect(parsePassengerVoiceIntent('nimelipa'), PassengerVoiceIntent.cashPaid);
    expect(parsePassengerVoiceIntent('I paid cash'), PassengerVoiceIntent.cashPaid);
    expect(parsePassengerVoiceIntent('msaada'), PassengerVoiceIntent.sos);
    expect(parsePassengerVoiceIntent('where is my ride'), PassengerVoiceIntent.myRide);
    expect(parsePassengerVoiceIntent('salio'), PassengerVoiceIntent.wallet);
  });

  test('speech language follows the app language (Lingala: French)', () {
    appLanguage.value = 'en';
    expect(voiceLocaleId(), 'en_US');
    appLanguage.value = 'sw';
    expect(voiceLocaleId(), 'sw_KE');
    appLanguage.value = 'ln';
    expect(voiceLocaleId(), 'fr_FR');
    appLanguage.value = 'fr';
    expect(voiceLocaleId(), 'fr_FR');
  });

  test('common Lingala words (best effort)', () {
    expect(parseDriverVoiceIntent('nandimi'), DriverVoiceIntent.accept);
    expect(parseDriverVoiceIntent('naboyi'), DriverVoiceIntent.reject);
    expect(parseDriverVoiceIntent('nakomi'), DriverVoiceIntent.arrived);
    expect(parseDriverVoiceIntent('tokende'), DriverVoiceIntent.start);
    expect(parseDriverVoiceIntent('nasilisi'), DriverVoiceIntent.finish);
    expect(parseDriverVoiceIntent('afuti te'), DriverVoiceIntent.cashNotReceived);
    expect(parsePassengerVoiceIntent('nafuti'), PassengerVoiceIntent.cashPaid);
    expect(parsePassengerVoiceIntent('nalingi kokende na motuka'), PassengerVoiceIntent.taxi);
    expect(parsePassengerVoiceIntent('longola'), PassengerVoiceIntent.cancel);
  });
}
