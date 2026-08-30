const TECHNICAL_PATTERNS = [
  /^HTTP \d/i,
  /\bHTTP\s*\d{3}\b/i,
  /\(\s*\d{3}\s*\)/,
  /^Erreur \d{3}$/,
  /^PDF \d+$/i,
  /API\s*:/i,
  /https?:\/\//i,
  /afri-soft\.com/i,
  /onrender\.com/i,
  /localhost:\d+/i,
  /NEXT_PUBLIC_[A-Z0-9_]+/,
  /Exception:/i,
  /SocketException/i,
  /TimeoutException/i,
  /FormatException/i,
  /MOVA_[A-Z]+_\d+/,
  /SENGA_[A-Z]+_\d+/,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /fetch failed/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /Network request failed/i,
  /PrismaClient/i,
  /\bPrisma\b/,
  /NestJS/i,
  /Internal server error/i,
  /Forbidden resource/i,
  /^Unauthorized$/i,
  /^Forbidden$/i,
  /^Bad Request$/i,
  /^Not Found$/i,
  /Unexpected token/i,
  /Cannot (GET|POST|PUT|PATCH|DELETE)\b/i,
  /Unique constraint/i,
  /Foreign key constraint/i,
  /TypeError:/i,
  /SyntaxError:/i,
  /AggregateError/i,
  /^\s*at\s+\S+/m,
  /\.dart:\d+/i,
  /\.(ts|js|tsx|jsx):\d+/i,
  /SERDIPAY_/i,
  /SMS_PROVIDER/i,
  /AFRICAS_TALKING/i,
  /TWILIO_(ACCOUNT_SID|AUTH_TOKEN|PHONE_NUMBER|VERIFY)/i,
  /Définissez [A-Z0-9_]+/,
];

export const LOGIN_GOOGLE_UNAVAILABLE = "Connexion Google impossible pour le moment. Réessayez.";
export const LOGIN_OTP_UNAVAILABLE = "Impossible d'envoyer le code. Réessayez.";
export const LOGIN_GENERIC = "Connexion impossible. Réessayez.";

export function httpStatusUserMessage(status: number): string {
  if (status === 401) return "Non autorisé. Veuillez vous connecter.";
  if (status === 403) return "Accès refusé.";
  if (status === 404) return "Ressource introuvable.";
  if (status === 429) return "Trop de tentatives. Réessayez dans un instant.";
  if (status === 502 || status === 503) return "Service temporairement indisponible. Réessayez dans quelques minutes.";
  if (status >= 500) return "Une erreur interne est survenue.";
  return "Une erreur est survenue. Veuillez réessayer.";
}

export function sanitizeUserMessage(
  raw: unknown,
  fallback = "Une erreur est survenue. Veuillez réessayer.",
): string {
  if (raw == null) return fallback;
  const msg = String(raw).trim();
  if (!msg) return fallback;
  if (msg.length > 180) return fallback;
  if (TECHNICAL_PATTERNS.some((re) => re.test(msg))) return fallback;
  return msg;
}

/** Map any thrown value to a safe French UI string. */
export function toUserErrorMessage(
  err: unknown,
  fallback = "Une erreur est survenue. Veuillez réessayer.",
): string {
  const status =
    err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : 0;
  const generic = "Une erreur est survenue. Veuillez réessayer.";
  const resolvedFallback =
    fallback !== generic ? fallback : status ? httpStatusUserMessage(status) : generic;
  const raw = err instanceof Error ? err.message : err;
  return sanitizeUserMessage(raw, resolvedFallback);
}
