import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/client_apps_config.dart';

void main() {
  test('fills empty fields from a driving licence, keeps what the driver typed', () {
    final first = TextEditingController();
    final last = TextEditingController(text: 'Mukendi');
    final number = TextEditingController();
    final expiry = TextEditingController();
    final filled = applyScannedFields(
      'DRIVERS_LICENSE',
      {'firstName': 'Jean', 'lastName': 'KABILA', 'licenseNumber': 'KIN-123', 'expiryDate': '2030-03-11'},
      {'firstName': first, 'lastName': last, 'licenseNumber': number, 'DRIVERS_LICENSE.expiryDate': expiry},
    );
    expect(first.text, 'Jean');
    expect(last.text, 'Mukendi');
    expect(number.text, 'KIN-123');
    expect(expiry.text, '2030-03-11');
    expect(filled, ['prénom', 'n° de permis', "date d'expiration"]);
  });

  test('an insurance expiry goes to the insurance date only', () {
    final license = TextEditingController();
    final insurance = TextEditingController();
    applyScannedFields(
      'VEHICLE_INSURANCE',
      {'expiryDate': '2027-05-31'},
      {'DRIVERS_LICENSE.expiryDate': license, 'VEHICLE_INSURANCE.expiryDate': insurance},
    );
    expect(insurance.text, '2027-05-31');
    expect(license.text, isEmpty);
  });

  test('selfie is not scanned', () {
    expect(kScannableDocTypes.contains('SELFIE'), isFalse);
    expect(kScannableDocTypes.contains('DRIVERS_LICENSE'), isTrue);
  });
}
