/// Messages utilisateur sans détails techniques (HTTP, exceptions, codes internes).
String sanitizeUserMessage(
  String? raw, {
  String fallback = 'Une erreur est survenue. Veuillez réessayer.',
}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final msg = raw.trim();
  if (RegExp(r'^HTTP \d').hasMatch(msg)) return fallback;
  if (msg.contains('Exception:') ||
      msg.contains('SocketException') ||
      msg.contains('FormatException') ||
      msg.contains('TimeoutException')) {
    return fallback;
  }
  if (RegExp(r'MOVA_[A-Z]+_\d+').hasMatch(msg)) return fallback;
  if (msg.length > 180) return fallback;
  return msg;
}
