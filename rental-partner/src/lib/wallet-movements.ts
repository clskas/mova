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
  return desc.startsWith("Recharge") || ref.startsWith("topup_") || desc.includes("Annulation retrait");
}

export function isWalletWithdraw(tx: WalletTx): boolean {
  const desc = tx.description ?? "";
  const ref = tx.reference ?? "";
  return desc.startsWith("Retrait") || ref.startsWith("withdraw_");
}

export function walletTxLabel(tx: WalletTx): string {
  if (tx.description?.trim()) return tx.description;
  if (isWalletRecharge(tx)) return "Recharge";
  if (isWalletWithdraw(tx)) return "Retrait";
  return tx.type === "CREDIT" ? "Crédit" : "Débit";
}
