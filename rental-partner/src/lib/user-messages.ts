const TECHNICAL_PATTERNS = [
  /^HTTP \d/i,
  /^Erreur \d{3}$/,
  /Exception:/i,
  /SocketException/i,
  /TimeoutException/i,
  /MOVA_[A-Z]+_\d+/,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /NetworkError/i,
];

export function sanitizeUserMessage(raw: unknown, fallback = "Une erreur est survenue. Veuillez réessayer."): string {
  if (raw == null) return fallback;
  const msg = String(raw).trim();
  if (!msg) return fallback;
  if (msg.length > 180) return fallback;
  if (TECHNICAL_PATTERNS.some((re) => re.test(msg))) return fallback;
  return msg;
}
