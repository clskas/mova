const TECHNICAL_PATTERNS = [
  /^HTTP \d/i,
  /\bHTTP\s*\d{3}\b/i,
  /\(\s*\d{3}\s*\)/,
  /^Erreur \d{3}$/,
  /^PDF \d+$/i,
  /API\s*:/i,
  /https?:\/\//i,
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
  /\.(ts|js|tsx|jsx):\d+/i,
  /must match .+ regular expression/i,
  /must be longer than or equal to/i,
  /must be shorter than or equal to/i,
  /must be an? (string|number|boolean|integer|uuid|array|object|email)/i,
  /\bP20\d{2}\b/,
  /\bescrowReady\b/,
  /\bchannel0\b/,
  /Payment Failed/i,
  /Merchant is not allowed/i,
  /Failed to process the payment/i,
  /\bmapbox\b/i,
  /Invalid Token/i,
  /CinetPay non configuré/i,
  /Échec init CinetPay/i,
  /SERDIPAY_/i,
  /SMS_PROVIDER/i,
];

export const PIN_SIX_DIGITS_FR = "Le code PIN doit contenir 6 chiffres.";
export const PAYMENT_FAILED_FR =
  "Le paiement Mobile Money a échoué. Réessayez ou contactez le support SENGA.";
export const VALIDATION_FAILED_FR = "Données invalides. Vérifiez les champs.";

function isClassValidatorPinMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (!/\bpin\b|confirmpin/.test(lower)) return false;
  return (
    /must match/.test(lower) ||
    /regular expression/.test(lower) ||
    /must be longer than or equal to/.test(lower) ||
    /must be shorter than or equal to/.test(lower) ||
    /must be a string/.test(lower)
  );
}

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
  if (isClassValidatorPinMessage(msg)) return PIN_SIX_DIGITS_FR;
  if (/payment failed|merchant is not allowed|failed to process the payment|channel0/i.test(msg)) {
    return PAYMENT_FAILED_FR;
  }
  if (
    /must match .+ regular expression|must be longer than or equal to|must be shorter than or equal to|must be an? (string|number|boolean|integer|uuid|array|object|email)/i.test(
      msg,
    )
  ) {
    return VALIDATION_FAILED_FR;
  }
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
