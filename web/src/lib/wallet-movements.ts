export type WalletTx = {
  id?: string;
  type?: string;
  amountCdf?: number;
  description?: string;
  reference?: string;
  createdAt?: string;
};

export function isWalletRecharge(tx: WalletTx): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  if (desc.startsWith("Recharge")) return true;
  if (ref.startsWith("topup_")) return true;
  if (desc.includes("Annulation retrait")) return true;
  return false;
}

export function isWalletWithdraw(tx: WalletTx): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  if (desc.startsWith("Retrait")) return true;
  if (ref.startsWith("withdraw_")) return true;
  return false;
}

export function isMobileMoneyMovement(tx: WalletTx): boolean {
  return isWalletRecharge(tx) || isWalletWithdraw(tx);
}

export function walletTxLabel(tx: WalletTx): string {
  if (tx.description?.trim()) return tx.description;
  if (isWalletRecharge(tx)) return "Recharge";
  if (isWalletWithdraw(tx)) return "Retrait";
  return tx.type === "CREDIT" ? "Crédit" : "Débit";
}
