import type { WalletTransaction } from "@/lib/api";

export function isWalletRecharge(tx: WalletTransaction): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  const type = (tx.type ?? "").toUpperCase();
  if (type === "TOPUP_PENDING" || type === "TOPUP_COMPLETED" || type === "TOPUP_FAILED") return true;
  if (desc.startsWith("Recharge")) return true;
  if (ref.startsWith("topup_") || ref.startsWith("senga_topup_")) return true;
  if (desc.includes("Annulation retrait")) return true;
  return false;
}

export function isWalletWithdraw(tx: WalletTransaction): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  if (desc.startsWith("Retrait")) return true;
  if (ref.startsWith("withdraw_") || ref.startsWith("senga_withdraw_")) return true;
  return false;
}

export function walletTxLabel(tx: WalletTransaction): string {
  if (tx.description?.trim()) return tx.description;
  if (isWalletRecharge(tx)) return "Recharge";
  if (isWalletWithdraw(tx)) return "Retrait";
  return tx.type === "CREDIT" ? "Crédit" : "Débit";
}

/** Last 9 digits of an RDC number (+243 81… and 081… compare equal). */
function phoneKey(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

/** Number a withdrawal was sent to, read from « Retrait OPERATOR vers +243… ». */
export function withdrawDestination(tx: WalletTransaction): string | null {
  const m = /vers\s+(\+?\d[\d\s]{7,})/.exec(tx.description ?? "");
  return m ? m[1].replace(/\s/g, "") : null;
}

/**
 * Withdrawal sent to a number other than the account's own phone (or from an account with
 * no phone, e.g. signed up with an e-mail). Only when the destination is known.
 */
export function isOtherNumberWithdraw(tx: WalletTransaction): boolean {
  if (tx.type !== "DEBIT" || !isWalletWithdraw(tx)) return false;
  const dest = withdrawDestination(tx);
  if (!dest) return false;
  const account = phoneKey(tx.wallet?.userPhone);
  return !account || account !== phoneKey(dest);
}
