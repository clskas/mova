/** Identifiant public court (style Uber) — affiché dans l'app et le support. */
export function formatMovaPublicId(userId: string, role: string): string {
  const prefix = role === 'DRIVER' ? 'DRV' : 'RDR';
  const compact = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}-${compact}`;
}

/** Masque le téléphone pour affichage (ex. +243 *** 9010). */
export function maskPhoneRdc(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `+243 *** ${last4}`;
}

/** Masque l'e-mail pour affichage (ex. ma***@gmail.com). */
export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at < 1) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${domain}`;
}
