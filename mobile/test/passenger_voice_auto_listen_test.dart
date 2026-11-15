import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/voice/voice_command_button.dart';
import 'package:mova/features/passenger/passenger_voice_announcer.dart';

void main() {
  test('micro opens by itself at the key moments only', () {
    expect(PassengerVoiceAnnouncer.isVoiceMoment('DRIVER_ARRIVED'), isTrue);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('arriving'), isTrue);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('COMPLETED'), isTrue);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('IN_PROGRESS'), isFalse);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('SEARCHING'), isFalse);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('IN_TRANSIT', delivery: true), isTrue);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('DELIVERED', delivery: true), isTrue);
    expect(PassengerVoiceAnnouncer.isVoiceMoment('PICKED_UP', delivery: true), isFalse);
  });

  test('admin switch and the passenger switch must both be on', () {
    kPassengerVoiceAutoListen = true;
    PassengerVoiceAnnouncer.autoListen.value = true;
    expect(PassengerVoiceAnnouncer.autoListenActive, isTrue);
    PassengerVoiceAnnouncer.autoListen.value = false;
    expect(PassengerVoiceAnnouncer.autoListenActive, isFalse);
    PassengerVoiceAnnouncer.autoListen.value = true;
    applyDriverVoiceConfig({'passengerAutoListenEnabled': false});
    expect(PassengerVoiceAnnouncer.autoListenActive, isFalse);
    applyDriverVoiceConfig({'passengerAutoListenEnabled': true});
    expect(PassengerVoiceAnnouncer.autoListenActive, isTrue);
  });
}
