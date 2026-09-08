import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/auth/pin_session.dart';

void main() {
  test('Google-only (no phone) must set a PIN', () {
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: ''), isTrue);
    expect(sessionNeedsPinSetup(pinConfigured: false, phone: 'marie@gmail.com'), isTrue);
    expect(isEmailIdentity('marie@gmail.com'), isTrue);
    expect(isEmailIdentity('+243812345678'), isFalse);
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

  test('first-login PIN copy matches resto/location', () {
    expect(connectionPinHeadingFr, contains('PIN de connexion'));
    expect(pinSetupHintFr, contains('Choisissez / confirmez'));
    expect(pinResetHeadingFr, contains('nouveau code PIN'));
    expect(connectionPinPrompt('+243893515173'), 'Entrez le PIN pour +243 ••• 173');
    expect(connectionPinPrompt('kise.ndiki@gmail.com'), 'Entrez le PIN pour ki***@gmail.com');
  });

  test('login identity prefers +243 then Google email, never leftover +243', () {
    expect(
      loginIdentityFromAuth(
        accountPhone: '',
        accountEmail: 'Kise.Ndiki@gmail.com',
        fallback: '+243',
      ),
      'kise.ndiki@gmail.com',
    );
    expect(isRememberedLoginIdentity('+243'), isFalse);
    expect(isRememberedLoginIdentity('kise.ndiki@gmail.com'), isTrue);
  });
}
