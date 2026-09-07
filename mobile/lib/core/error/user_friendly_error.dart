/// Aligné sur PinAuth / LocalPinSetup / API PIN_SIX_DIGITS_FR.
const pinSixDigitsFr = 'Le code PIN doit contenir 6 chiffres.';
const paymentFailedFr =
    'Le paiement Mobile Money a échoué. Réessayez ou contactez le support SENGA.';
const validationFailedFr = 'Données invalides. Vérifiez les champs.';
const withdrawOtpPromptFr =
    'Saisissez le code SMS à 6 chiffres envoyé au numéro Mobile Money.';
const merchantFloatLowFr =
    'Le compte de versement n’a pas assez de fonds. Votre solde SENGA n’a pas été débité.';

/// Backend « OTP requis / invalide / expiré » is a withdraw *step*, not a wallet crash.
bool isWithdrawOtpChallengeMessage(String? raw) {
  final msg = (raw ?? '').trim().toLowerCase();
  if (msg.isEmpty) return false;
  if (msg.contains('code otp requis')) return true;
  if (msg.contains('demandez un nouveau code')) return true;
  if (!RegExp(r'\botp\b').hasMatch(msg)) return false;
  return msg.contains('requis') ||
      msg.contains('required') ||
      msg.contains('expir') ||
      msg.contains('invalide') ||
      msg.contains('invalid') ||
      msg.contains('must match');
}

bool _isClassValidatorPinMessage(String msg) {
  final lower = msg.toLowerCase();
  if (!RegExp(r'\bpin\b|confirmpin').hasMatch(lower)) return false;
  return lower.contains('must match') ||
      lower.contains('regular expression') ||
      lower.contains('must be longer than or equal to') ||
      lower.contains('must be shorter than or equal to') ||
      lower.contains('must be a string');
}

bool _isMerchantFloatEnglish(String msg) {
  final lower = msg.toLowerCase();
  if (lower.contains('not allowed to use this channel')) return false;
  return lower.contains('your balance is low') ||
      lower.contains('balance is low') ||
      lower.contains('low balance') ||
      RegExp(r'\binsufficient (funds|balance|float)\b').hasMatch(lower) ||
      lower.contains('not enough funds') ||
      lower.contains('not enough balance') ||
      (lower.contains('merchant') && (lower.contains('float') || lower.contains('insufficient')));
}

bool _isPaymentGatewayEnglish(String msg) {
  final lower = msg.toLowerCase();
  return lower.contains('payment failed') ||
      lower.contains('merchant is not allowed') ||
      lower.contains('failed to process the payment') ||
      lower.contains('channel0');
}

bool _isClassValidatorEnglish(String msg) {
  return RegExp(r'must match .+ regular expression', caseSensitive: false).hasMatch(msg) ||
      RegExp(r'must be longer than or equal to', caseSensitive: false).hasMatch(msg) ||
      RegExp(r'must be shorter than or equal to', caseSensitive: false).hasMatch(msg) ||
      RegExp(
        r'must be an? (string|number|boolean|integer|uuid|array|object|email)',
        caseSensitive: false,
      ).hasMatch(msg);
}

String? _withdrawFieldMessage(String msg) {
  final lower = msg.toLowerCase();
  if (RegExp(r'\botp\b').hasMatch(lower) &&
      (_isClassValidatorEnglish(msg) || lower.contains('required') || lower.contains('must'))) {
    return 'Code OTP requis (6 chiffres envoyé au numéro Mobile Money).';
  }
  if (RegExp(r'\bphone\b').hasMatch(lower) && _isClassValidatorEnglish(msg)) {
    return 'Numéro Mobile Money invalide. Format : +243XXXXXXXXX.';
  }
  if (RegExp(r'amountcdf|amount_cdf').hasMatch(lower) &&
      (_isClassValidatorEnglish(msg) || lower.contains('must not be less'))) {
    return 'Montant invalide. Entrez un nombre entier d’au moins 2 300 FC.';
  }
  return null;
}

/// Messages utilisateur sans détails techniques (HTTP, exceptions, codes internes).
String sanitizeUserMessage(
  String? raw, {
  String fallback = 'Une erreur est survenue. Veuillez réessayer.',
}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final msg = raw.trim();
  if (_isClassValidatorPinMessage(msg)) return pinSixDigitsFr;
  if (_isMerchantFloatEnglish(msg)) return merchantFloatLowFr;
  if (_isPaymentGatewayEnglish(msg)) return paymentFailedFr;
  final withdrawField = _withdrawFieldMessage(msg);
  if (withdrawField != null) return withdrawField;
  if (_isClassValidatorEnglish(msg)) return validationFailedFr;
  if (RegExp(r'^HTTP \d', caseSensitive: false).hasMatch(msg)) return fallback;
  if (RegExp(r'https?://', caseSensitive: false).hasMatch(msg)) return fallback;
  if (msg.toLowerCase().contains('onrender.com')) return fallback;
  if (RegExp(r'localhost:\d+').hasMatch(msg)) return fallback;
  if (RegExp(r'^Erreur \d{3}$').hasMatch(msg)) return fallback;
  if (RegExp(r'^PDF \d+$', caseSensitive: false).hasMatch(msg)) return fallback;
  if (msg.contains('Exception:') ||
      msg.contains('SocketException') ||
      msg.contains('FormatException') ||
      msg.contains('TimeoutException') ||
      msg.contains('TypeError:') ||
      msg.contains('SyntaxError:') ||
      msg.contains('AggregateError')) {
    return fallback;
  }
  if (RegExp(r'MOVA_[A-Z]+_\d+').hasMatch(msg)) return fallback;
  if (RegExp(r'SENGA_[A-Z]+_\d+').hasMatch(msg)) return fallback;
  if (msg.contains('ECONNREFUSED') ||
      msg.contains('ECONNRESET') ||
      msg.contains('ETIMEDOUT') ||
      msg.contains('ENOTFOUND') ||
      msg.contains('fetch failed') ||
      msg.contains('Failed to fetch') ||
      msg.contains('NetworkError') ||
      msg.contains('Network request failed') ||
      msg.contains('ClientException') ||
      msg.contains('HandshakeException')) {
    return fallback;
  }
  if (msg.contains('PrismaClient') ||
      msg.contains('Prisma') ||
      RegExp(r'\bP20\d{2}\b').hasMatch(msg) ||
      msg.contains('escrowReady') ||
      msg.toLowerCase().contains('mapbox') ||
      msg.contains('Invalid Token') ||
      msg.contains('NestJS') ||
      msg.toLowerCase().contains('internal server error') ||
      msg.toLowerCase().contains('forbidden resource') ||
      msg.contains('Unique constraint') ||
      msg.contains('Foreign key constraint') ||
      RegExp(r'Cannot (GET|POST|PUT|PATCH|DELETE)\b').hasMatch(msg) ||
      RegExp(r'Unexpected token').hasMatch(msg)) {
    return fallback;
  }
  if (RegExp(r'^\s*at\s+\S+', multiLine: true).hasMatch(msg)) return fallback;
  if (RegExp(r'\.dart:\d+').hasMatch(msg)) return fallback;
  if (msg.length > 180) return fallback;
  return msg;
}
