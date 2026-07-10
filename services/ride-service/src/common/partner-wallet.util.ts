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

export async function fetchPartnerTransactions(
  ownerUserId: string,
  opts?: { descriptionPrefix: string; from?: Date; to?: Date; q?: string; skip?: number; take?: number },
): Promise<{
  balanceCdf: number;
  formattedBalance: string;
  data: PartnerWalletTransaction[];
  pagination: { skip: number; take: number; total: number };
  periodTotalCdf?: number;
}> {
  const params = new URLSearchParams();
  if (opts?.descriptionPrefix) params.set('descriptionPrefix', opts.descriptionPrefix);
  if (opts?.from) params.set('from', opts.from.toISOString());
  if (opts?.to) params.set('to', opts.to.toISOString());
  if (opts?.q) params.set('q', opts.q);
  params.set('skip', String(opts?.skip ?? 0));
  params.set('take', String(opts?.take ?? 50));
  const res = await fetch(
    serviceUrl('payment', `/internal/wallets/${ownerUserId}/transactions?${params.toString()}`),
    { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
  );
  if (!res.ok) {
    throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, HttpStatus.BAD_GATEWAY, 'Historique portefeuille indisponible.');
  }
  const body = (await res.json()) as {
    balanceCdf?: number;
    formattedBalance?: string;
    data?: PartnerWalletTransaction[];
    pagination?: { skip: number; take: number; total: number };
    periodTotalCdf?: number;
  };
  return {
    balanceCdf: body.balanceCdf ?? 0,
    formattedBalance: body.formattedBalance ?? `${body.balanceCdf ?? 0} FC`,
    data: body.data ?? [],
    pagination: body.pagination ?? { skip: 0, take: 50, total: body.data?.length ?? 0 },
    periodTotalCdf: body.periodTotalCdf,
  };
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
