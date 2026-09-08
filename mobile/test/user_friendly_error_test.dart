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

  test('maps payment gateway English to French', () {
    expect(
      sanitizeUserMessage('Payment Failed, Merchant is not allowed to use this channel0'),
      channelDisabledFr,
    );
  });

  test('maps class-validator English and Prisma codes without leaking internals', () {
    expect(
      sanitizeUserMessage('phone must be a string'),
      'Numéro Mobile Money invalide. Format : +243XXXXXXXXX.',
    );
    expect(
      sanitizeUserMessage(r'otp must match /^\d{6}$/ regular expression'),
      'Code OTP requis (6 chiffres envoyé au numéro Mobile Money).',
    );
    expect(
      sanitizeUserMessage('amountCdf must be an integer number'),
      'Montant invalide. Entrez un nombre entier d’au moins 2 300 FC.',
    );
    expect(
      sanitizeUserMessage('Unique constraint failed P2002 on escrowReady'),
      'Une erreur est survenue. Veuillez réessayer.',
    );
    expect(
      sanitizeUserMessage('Internal server error'),
      'Une erreur est survenue. Veuillez réessayer.',
    );
    expect(
      sanitizeUserMessage('MOVA_DEL_004'),
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  test('OTP-required copy is a withdraw step, not a wallet crash', () {
    expect(
      isWithdrawOtpChallengeMessage(
        'Code OTP requis (6 chiffres envoyé au numéro Mobile Money).',
      ),
      isTrue,
    );
    expect(
      isWithdrawOtpChallengeMessage(
        r'otp must match /^\d{6}$/ regular expression',
      ),
      isTrue,
    );
    expect(isWithdrawOtpChallengeMessage('Recharge Mobile Money refusée.'), isFalse);
  });

  test('maps Laravel Unauthenticated to merchant French, not SENGA login', () {
    expect(
      sanitizeUserMessage('Unauthenticated.'),
      'Authentification marchand SerdiPay expirée. Réessayez la recharge — ce n’est pas votre session SENGA.',
    );
    expect(sanitizeUserMessage('Unauthenticated.'), isNot(contains('Veuillez vous connecter')));
  });

  test('maps SerdiPay merchant-float English to French (not the user SENGA wallet)', () {
    expect(
      sanitizeUserMessage('Your Balance is low'),
      merchantFloatLowFr,
    );
    expect(sanitizeUserMessage('Your Balance is low'), isNot(contains('2301')));
  });
}
