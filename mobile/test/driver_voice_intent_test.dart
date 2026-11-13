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
}
