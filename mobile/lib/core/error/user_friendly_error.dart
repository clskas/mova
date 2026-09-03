/// Messages utilisateur sans détails techniques (HTTP, exceptions, codes internes).
String sanitizeUserMessage(
  String? raw, {
  String fallback = 'Une erreur est survenue. Veuillez réessayer.',
}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final msg = raw.trim();
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
