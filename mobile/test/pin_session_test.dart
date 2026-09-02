import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/auth/pin_session.dart';

void main() {
  test('Google-only (no phone) must set a PIN', () {
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: ''), isTrue);
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: 'marie@gmail.com'), isTrue);
  });

  test('phone OTP without PIN must set a PIN', () {
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: '+243812345678'), isTrue);
  });

  test('seed demo phones skip PIN setup', () {
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: '+243900000010'), isFalse);
    expect(isSeedDemoPhone('+243900000031'), isTrue);
  });

  test('existing PIN skips setup and requires unlock on cold start', () {
    expect(sessionNeedsPinSetup(pinConfigured: true, phone: ''), isFalse);
    expect(sessionRequiresPinUnlock(pinConfigured: true, phone: 'marie@gmail.com'), isTrue);
    expect(sessionRequiresPinUnlock(pinConfigured: true, phone: '+243900000010'), isFalse);
  });
}
