import { Logger } from '@nestjs/common';
import { afrisoftPayHubBaseUrl, formatCdf, INTERNAL_API_KEY, isAfrisoftPayHubMode, serviceUrl } from '@mova/shared';

const logger = new Logger('PartnerWallet');
const WALLET_TIMEOUT_MS = 8000;
const HUB_HEALTH_TIMEOUT_MS = 4000;

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
  available: boolean;
  unavailableReason?: string;
};

export type PartnerTransactionsPage = {
  balanceCdf: number;
  formattedBalance: string;
  data: PartnerWalletTransaction[];
  pagination: { skip: number; take: number; total: number };
  periodTotalCdf?: number;
  available: boolean;
  unavailableReason?: string;
};

const UNAVAILABLE_REASON =
  "Portefeuille temporairement indisponible. Le solde s'affichera dès que le service de paiement sera prêt.";

export function emptyPartnerWallet(reason = UNAVAILABLE_REASON): PartnerWalletSnapshot {
  return {
    balanceCdf: 0,
    formattedBalance: formatCdf(0),
    transactions: [],
    available: false,
    unavailableReason: reason,
  };
}

export function availableZeroWallet(): PartnerWalletSnapshot {
  return {
    balanceCdf: 0,
    formattedBalance: formatCdf(0),
    transactions: [],
    available: true,
  };
}

export function emptyPartnerTransactions(
  opts?: { skip?: number; take?: number; reason?: string; available?: boolean },
): PartnerTransactionsPage {
  const available = opts?.available ?? false;
  return {
    balanceCdf: 0,
    formattedBalance: formatCdf(0),
    data: [],
    pagination: { skip: opts?.skip ?? 0, take: opts?.take ?? 50, total: 0 },
    periodTotalCdf: 0,
    available,
    unavailableReason: available ? undefined : (opts?.reason ?? UNAVAILABLE_REASON),
  };
}

async function timedFetch(url: string, init?: RequestInit, timeoutMs = WALLET_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function paymentHeaders(json = false): Record<string, string> {
  return {
    'x-internal-api-key': INTERNAL_API_KEY,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function paymentFetch(path: string, init?: RequestInit): Promise<Response> {
  return timedFetch(serviceUrl('payment', path), {
    ...init,
    headers: {
      ...paymentHeaders(Boolean(init?.body)),
      ...(init?.headers ?? {}),
    },
  });
}

function envGet(key: string) {
  return process.env[key];
}

/** True when the MM hub (pay.afri-soft.com) answers 200 — not a fake balance. */
export async function isPayHubHealthy(): Promise<boolean> {
  if (isAfrisoftPayHubMode(envGet)) return true;
  const base = afrisoftPayHubBaseUrl(envGet).replace(/\/$/, '');
  try {
    const res = await timedFetch(`${base}/health`, undefined, HUB_HEALTH_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

function mapWalletBody(wallet: {
  balanceCdf?: number;
  formattedBalance?: string;
  transactions?: PartnerWalletTransaction[];
}): PartnerWalletSnapshot {
  const balanceCdf = wallet.balanceCdf ?? 0;
  return {
    balanceCdf,
    formattedBalance: wallet.formattedBalance ?? formatCdf(balanceCdf),
    transactions: wallet.transactions ?? [],
    available: true,
  };
}

async function createWalletIfMissing(ownerUserId: string): Promise<void> {
  try {
    const res = await paymentFetch('/internal/wallets', {
      method: 'POST',
      body: JSON.stringify({ userId: ownerUserId }),
    });
    if (!res.ok) {
      logger.warn(`Wallet POST ${res.status} for ${ownerUserId}`);
    }
  } catch (e) {
    logger.warn(`Wallet POST failed for ${ownerUserId}: ${e instanceof Error ? e.message : e}`);
  }
}

async function unavailableOrZero<T extends { available: boolean }>(
  ownerUserId: string,
  down: T,
  zero: T,
): Promise<T> {
  if (await isPayHubHealthy()) {
    logger.warn(`Wallet fetch failed for ${ownerUserId} but pay hub is healthy — returning available 0 FC`);
    return zero;
  }
  return down;
}

export async function fetchPartnerWallet(ownerUserId: string): Promise<PartnerWalletSnapshot> {
  try {
    let res = await paymentFetch(`/internal/wallets/${ownerUserId}`);
    if (res.status === 404) {
      await createWalletIfMissing(ownerUserId);
      res = await paymentFetch(`/internal/wallets/${ownerUserId}`);
    }
    if (res.ok) {
      return mapWalletBody((await res.json()) as Parameters<typeof mapWalletBody>[0]);
    }
    logger.warn(`Wallet GET ${res.status} for ${ownerUserId}`);
  } catch (e) {
    logger.warn(`Wallet unreachable for ${ownerUserId}: ${e instanceof Error ? e.message : e}`);
  }
  return unavailableOrZero(ownerUserId, emptyPartnerWallet(), availableZeroWallet());
}

export async function fetchPartnerTransactions(
  ownerUserId: string,
  opts?: { descriptionPrefix: string; from?: Date; to?: Date; q?: string; skip?: number; take?: number },
): Promise<PartnerTransactionsPage> {
  const skip = opts?.skip ?? 0;
  const take = opts?.take ?? 50;
  try {
    const params = new URLSearchParams();
    if (opts?.descriptionPrefix) params.set('descriptionPrefix', opts.descriptionPrefix);
    if (opts?.from) params.set('from', opts.from.toISOString());
    if (opts?.to) params.set('to', opts.to.toISOString());
    if (opts?.q) params.set('q', opts.q);
    params.set('skip', String(skip));
    params.set('take', String(take));
    let res = await paymentFetch(`/internal/wallets/${ownerUserId}/transactions?${params.toString()}`);
    if (res.status === 404) {
      await createWalletIfMissing(ownerUserId);
      res = await paymentFetch(`/internal/wallets/${ownerUserId}/transactions?${params.toString()}`);
    }
    if (res.ok) {
      const body = (await res.json()) as {
        balanceCdf?: number;
        formattedBalance?: string;
        data?: PartnerWalletTransaction[];
        pagination?: { skip: number; take: number; total: number };
        periodTotalCdf?: number;
      };
      return {
        balanceCdf: body.balanceCdf ?? 0,
        formattedBalance: body.formattedBalance ?? formatCdf(body.balanceCdf ?? 0),
        data: body.data ?? [],
        pagination: body.pagination ?? { skip, take, total: body.data?.length ?? 0 },
        periodTotalCdf: body.periodTotalCdf,
        available: true,
      };
    }
    logger.warn(`Wallet transactions GET ${res.status} for ${ownerUserId}`);
  } catch (e) {
    logger.warn(`Wallet transactions unreachable for ${ownerUserId}: ${e instanceof Error ? e.message : e}`);
  }
  return unavailableOrZero(
    ownerUserId,
    emptyPartnerTransactions({ skip, take }),
    emptyPartnerTransactions({ skip, take, available: true }),
  );
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
