import type { WalletTransaction } from "@/lib/api";

export function isWalletRecharge(tx: WalletTransaction): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  if (desc.startsWith("Recharge")) return true;
  if (ref.startsWith("topup_")) return true;
  if (desc.includes("Annulation retrait")) return true;
  return false;
}

export function isWalletWithdraw(tx: WalletTransaction): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  if (desc.startsWith("Retrait")) return true;
  if (ref.startsWith("withdraw_")) return true;
  return false;
}

export function walletTxLabel(tx: WalletTransaction): string {
  if (tx.description?.trim()) return tx.description;
  if (isWalletRecharge(tx)) return "Recharge";
  if (isWalletWithdraw(tx)) return "Retrait";
  return tx.type === "CREDIT" ? "Crédit" : "Débit";
}
