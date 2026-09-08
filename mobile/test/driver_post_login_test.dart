import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/driver/driver_post_login.dart';

void main() {
  test('incomplete dossier stays on onboarding, not PIN or home', () {
    expect(
      driverPostLoginTarget({
        'profile': {
          'onboardingCompleted': false,
          'kycStatus': 'PENDING',
          'needsActivationPin': false,
        },
      }),
      DriverPostLoginTarget.onboarding,
    );
  });

  test('KYC pending after dossier goes to home wait, not PIN', () {
    expect(
      driverPostLoginTarget({
        'profile': {
          'onboardingCompleted': true,
          'kycStatus': 'PENDING',
          'activationPinVerified': false,
          'needsActivationPin': false,
        },
      }),
      DriverPostLoginTarget.home,
    );
  });

  test('KYC OK without activation PIN blocks on PIN screen', () {
    expect(
      driverNeedsActivationPin({
        'kycStatus': 'APPROVED',
        'needsActivationPin': true,
        'activationPinVerified': false,
      }),
      isTrue,
    );
    expect(
      driverPostLoginTarget({
        'profile': {
          'onboardingCompleted': true,
          'kycStatus': 'APPROVED',
          'needsActivationPin': true,
          'activationPinVerified': false,
        },
      }),
      DriverPostLoginTarget.activationPin,
    );
  });

  test('KYC OK infers PIN gate even if needsActivationPin flag is missing', () {
    expect(
      driverNeedsActivationPin({
        'kycStatus': 'APPROVED',
        'activationPinVerified': false,
      }),
      isTrue,
    );
  });

  test('verified activation PIN goes to home', () {
    expect(
      driverNeedsActivationPin({
        'kycStatus': 'APPROVED',
        'needsActivationPin': false,
        'activationPinVerified': true,
      }),
      isFalse,
    );
    expect(
      driverPostLoginTarget({
        'profile': {
          'onboardingCompleted': true,
          'kycStatus': 'APPROVED',
          'activationPinVerified': true,
        },
      }),
      DriverPostLoginTarget.home,
    );
  });
}
