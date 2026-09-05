import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/error/user_friendly_error.dart';

void main() {
  test('maps class-validator PIN English to French', () {
    expect(
      sanitizeUserMessage(
        r'pin must match /^\d{6}$/ regular expression. pin must be longer than or equal to 6 characters',
      ),
      'Le code PIN doit contenir 6 chiffres.',
    );
  });

  test('keeps the existing French PIN copy', () {
    expect(
      sanitizeUserMessage('Le code PIN doit contenir 6 chiffres.'),
      'Le code PIN doit contenir 6 chiffres.',
    );
  });
}
