import { HttpStatus } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';

export type PartnerWalletTransaction = {
  id: string;
  amountCdf: number;
  type: string;
  description?: string;
  reference?: string;
  createdAt: string;
};

export type PartnerWalletSnapshot = {
  balanceCdf: number;
  formattedBalance: string;
  transactions: PartnerWalletTransaction[];
};

export async function fetchPartnerWallet(ownerUserId: string): Promise<PartnerWalletSnapshot> {
  try {
    const res = await fetch(serviceUrl('payment', `/internal/wallets/${ownerUserId}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) {
      throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, HttpStatus.BAD_GATEWAY, 'Portefeuille indisponible.');
    }
    const wallet = (await res.json()) as {
      balanceCdf?: number;
      formattedBalance?: string;
      transactions?: PartnerWalletTransaction[];
    };
    const balanceCdf = wallet.balanceCdf ?? 0;
    return {
      balanceCdf,
      formattedBalance: wallet.formattedBalance ?? `${balanceCdf.toLocaleString('fr-CD')} FC`,
      transactions: wallet.transactions ?? [],
    };
  } catch (e) {
    if (e instanceof MovaHttpException) throw e;
    throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, HttpStatus.BAD_GATEWAY, 'Portefeuille indisponible.');
  }
}

export function filterPartnerTransactions(
  transactions: PartnerWalletTransaction[],
  descriptionPrefix: string,
  opts?: { from?: Date; to?: Date; q?: string },
) {
  const q = opts?.q?.trim().toLowerCase();
  return transactions.filter((tx) => {
    if (tx.type !== 'CREDIT') return false;
    if (!String(tx.description ?? '').startsWith(descriptionPrefix)) return false;
    const created = new Date(tx.createdAt);
    if (opts?.from && created < opts.from) return false;
    if (opts?.to && created > opts.to) return false;
    if (q) {
      const hay = `${tx.description ?? ''} ${tx.reference ?? ''} ${tx.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sumTransactionAmounts(rows: PartnerWalletTransaction[]) {
  return rows.reduce((sum, tx) => sum + (tx.amountCdf ?? 0), 0);
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
