/// Aligné sur PinAuth / LocalPinSetup / API PIN_SIX_DIGITS_FR.
const pinSixDigitsFr = 'Le code PIN doit contenir 6 chiffres.';
const paymentFailedFr =
    'Le paiement Mobile Money a échoué. Réessayez ou contactez le support SENGA.';
const validationFailedFr = 'Données invalides. Vérifiez les champs.';

bool _isClassValidatorPinMessage(String msg) {
  final lower = msg.toLowerCase();
  if (!RegExp(r'\bpin\b|confirmpin').hasMatch(lower)) return false;
  return lower.contains('must match') ||
      lower.contains('regular expression') ||
      lower.contains('must be longer than or equal to') ||
      lower.contains('must be shorter than or equal to') ||
      lower.contains('must be a string');
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

/// Messages utilisateur sans détails techniques (HTTP, exceptions, codes internes).
String sanitizeUserMessage(
  String? raw, {
  String fallback = 'Une erreur est survenue. Veuillez réessayer.',
}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final msg = raw.trim();
  if (_isClassValidatorPinMessage(msg)) return pinSixDigitsFr;
  if (_isPaymentGatewayEnglish(msg)) return paymentFailedFr;
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
