import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { planDriverPayout, planFoodSettlement, planRentalOwner } from '../payouts/payout-plan';

/**
 * Nightly money control. It only reads and reports — it never moves money.
 * 1. Every wallet: balance = sum of its movements, held = sum of active holds.
 * 2. Every job paid online (card / wallet / Mobile Money) recently: what was paid out
 *    (driver, partners, SENGA, refunds − SENGA promo) = what the customer paid.
 * 3. Every job paid recently: each party got exactly what the share formulas give
 *    (driver / courier / owner credits, cash debts, promo top-ups).
 */

export type MoneyAnomaly = {
  kind: 'WALLET_BALANCE' | 'WALLET_HELD' | 'JOB_BALANCE' | 'JOB_SHARE';
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  referenceType?: string;
  referenceId?: string;
  userId?: string;
  expectedCdf: number;
  actualCdf: number;
  differenceCdf: number;
  message: string;
};

type Job = {
  referenceType: string;
  referenceId: string;
  userId: string;
  amountCdf: number;
  method: PaymentMethod;
};

const BALANCE_TYPES = ['CREDIT', 'DEBIT', 'TOPUP_COMPLETED'];
/** Jobs paid between 1 h and this many hours ago (payouts have had time to run). */
const JOB_WINDOW_HOURS = 48;
const MAX_JOBS = 2000;

@Injectable()
export class MoneyControlService {
  private readonly logger = new Logger(MoneyControlService.name);
  private running = false;

  constructor(private prisma: PrismaService) {}

  async latest() {
    return this.prisma.moneyControlRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }

  async history(take = 30) {
    return this.prisma.moneyControlRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
      select: { id: true, startedAt: true, finishedAt: true, anomalyCount: true, checkedWallets: true, checkedJobs: true },
    });
  }

  async run() {
    if (this.running) return { started: false, message: 'Contrôle déjà en cours' };
    this.running = true;
    const startedAt = new Date();
    try {
      const anomalies: MoneyAnomaly[] = [];
      const checkedWallets = await this.checkWallets(anomalies);
      const jobs = await this.recentJobs();
      for (const job of jobs) {
        try {
          await this.checkJob(job, anomalies);
        } catch (e) {
          this.logger.warn(`money control ${job.referenceType}/${job.referenceId}: ${(e as Error).message}`);
        }
      }
      const serious = anomalies.filter((a) => a.severity !== 'INFO');
      if (serious.length > 0) {
        this.logger.error(
          `Contrôle des comptes : ${serious.length} anomalie(s) — ${serious
            .slice(0, 5)
            .map((a) => `${a.kind} ${a.referenceType ?? ''} ${a.referenceId ?? a.userId ?? ''} écart ${a.differenceCdf}`)
            .join(' | ')}`,
        );
      }
      return this.prisma.moneyControlRun.create({
        data: {
          startedAt,
          finishedAt: new Date(),
          checkedWallets,
          checkedJobs: jobs.length,
          anomalyCount: serious.length,
          anomalies: anomalies as unknown as Prisma.InputJsonValue,
        },
      });
    } finally {
      this.running = false;
    }
  }

  // ---------- 1. wallets ----------

  private async checkWallets(out: MoneyAnomaly[]): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; userId: string; balance: number; held: number; ledger: bigint | number; activeHolds: bigint | number }>
    >`
      SELECT w.id, w."userId", w."balanceCdf" AS balance, w."heldBalanceCdf" AS held,
        COALESCE((SELECT SUM(t."amountCdf") FROM wallet_transactions t
                  WHERE t."walletId" = w.id AND t.type IN (${Prisma.join(BALANCE_TYPES)})), 0) AS ledger,
        COALESCE((SELECT SUM(h."amountCdf") FROM wallet_holds h
                  WHERE h."walletId" = w.id AND h.status = 'ACTIVE'), 0) AS "activeHolds"
      FROM wallets w
    `;
    for (const w of rows) {
      const ledger = Number(w.ledger);
      const holds = Number(w.activeHolds);
      if (ledger !== w.balance) {
        out.push({
          kind: 'WALLET_BALANCE',
          severity: 'HIGH',
          userId: w.userId,
          expectedCdf: ledger,
          actualCdf: w.balance,
          differenceCdf: w.balance - ledger,
          message: 'Le solde du portefeuille ne correspond pas à la somme de ses mouvements.',
        });
      }
      if (holds !== (w.held ?? 0)) {
        out.push({
          kind: 'WALLET_HELD',
          severity: 'MEDIUM',
          userId: w.userId,
          expectedCdf: holds,
          actualCdf: w.held ?? 0,
          differenceCdf: (w.held ?? 0) - holds,
          message: 'Le montant bloqué (séquestre) ne correspond pas aux séquestres actifs.',
        });
      }
    }
    return rows.length;
  }

  // ---------- 2 & 3. jobs ----------

  private async recentJobs(): Promise<Job[]> {
    const to = new Date(Date.now() - 3600_000);
    const from = new Date(Date.now() - JOB_WINDOW_HOURS * 3600_000);
    const [rides, services] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'COMPLETED', updatedAt: { gte: from, lte: to } },
        take: MAX_JOBS,
      }),
      this.prisma.servicePayment.findMany({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: from, lte: to },
          fundsFrozen: false,
          OR: [{ escrowHeld: false }, { payoutReleased: true }],
        },
        take: MAX_JOBS,
      }),
    ]);
    return [
      ...rides.map((p) => ({ referenceType: 'RIDE', referenceId: p.rideId, userId: p.userId, amountCdf: p.amountCdf, method: p.method })),
      ...services.map((p) => ({
        referenceType: p.referenceType.toUpperCase(),
        referenceId: p.referenceId,
        userId: p.userId,
        amountCdf: p.amountCdf,
        method: p.method,
      })),
    ];
  }

  private async ledgerFor(referenceId: string) {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { reference: { contains: referenceId }, type: { in: ['CREDIT', 'DEBIT'] } },
      include: { wallet: { select: { userId: true } } },
    });
    const credits = rows.filter((r) => r.type === 'CREDIT');
    const promoCost = rows
      .filter((r) => r.type === 'DEBIT' && r.reference?.startsWith('PROMO_COST:'))
      .reduce((s, r) => s - r.amountCdf, 0);
    const creditByRef = (prefix: string) =>
      credits.filter((r) => r.reference?.startsWith(prefix)).reduce((s, r) => s + r.amountCdf, 0);
    return { credits, promoCost, creditByRef };
  }

  /** Cash debts of a job, at their original amount (partial payments from the wallet added back). */
  private async debtsFor(referenceId: string) {
    const debts = await this.prisma.driverCashDebt.findMany({ where: { referenceId } });
    const original = new Map<string, number>();
    for (const d of debts) {
      const partials = await this.prisma.walletTransaction.findMany({
        where: { type: 'DEBIT', reference: { startsWith: `CASH_DEBT_PARTIAL:${d.id}:` } },
        select: { amountCdf: true },
      });
      original.set(d.id, d.amountCdf + partials.reduce((s, t) => s - t.amountCdf, 0));
    }
    const by = (category: string) =>
      debts.filter((d) => d.category === category).reduce((s, d) => s + (original.get(d.id) ?? d.amountCdf), 0);
    return { by, debts };
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(serviceUrl('ride', path), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private push(out: MoneyAnomaly[], job: Job, kind: MoneyAnomaly['kind'], expected: number, actual: number, message: string, severity: MoneyAnomaly['severity'] = 'HIGH') {
    if (expected === actual) return;
    out.push({
      kind,
      severity,
      referenceType: job.referenceType,
      referenceId: job.referenceId,
      userId: job.userId,
      expectedCdf: expected,
      actualCdf: actual,
      differenceCdf: actual - expected,
      message,
    });
  }

  async checkJob(job: Job, out: MoneyAnomaly[]) {
    const cash = job.method === PaymentMethod.CASH;
    const ledger = await this.ledgerFor(job.referenceId);
    const { by: debtBy } = await this.debtsFor(job.referenceId);

    // 2. Conservation (online payments): everything paid out = what the customer paid.
    let depositPending = 0;
    if (job.referenceType === 'RENTAL') {
      const s = await this.fetchJson<{ depositCdf?: number }>(`/internal/services/RENTAL/${job.referenceId}/rental-settlement`);
      const depositMoved =
        ledger.creditByRef(`RENTAL_DEPOSIT_REFUND:${job.referenceId}`) + ledger.creditByRef(`RENTAL_DEPOSIT_RETAINED:${job.referenceId}`);
      if (depositMoved === 0) depositPending = Math.max(0, Math.round(s?.depositCdf ?? 0));
    }
    if (!cash) {
      const paidOut = ledger.credits.reduce((s, r) => s + r.amountCdf, 0) - ledger.promoCost;
      const expected = job.amountCdf - depositPending;
      this.push(out, job, 'JOB_BALANCE', expected, paidOut, 'Ce qui a été versé ne correspond pas à ce que le client a payé.');
      if (depositPending > 0 && paidOut === expected) {
        out.push({
          kind: 'JOB_BALANCE',
          severity: 'INFO',
          referenceType: job.referenceType,
          referenceId: job.referenceId,
          expectedCdf: depositPending,
          actualCdf: 0,
          differenceCdf: 0,
          message: 'Caution encore chez SENGA : en attente de la décision du loueur.',
        });
      }
    }

    // 3. Shares: each party got what the formulas give.
    if (job.referenceType === 'RENTAL') {
      const s = await this.fetchJson<{ ownerUserId?: string | null; partnerNetCdf?: number; platformFeeCdf?: number; rentalPaidCdf?: number }>(
        `/internal/services/RENTAL/${job.referenceId}/rental-settlement`,
      );
      if (!s?.ownerUserId || s.rentalPaidCdf == null) return;
      const plan = planRentalOwner({ rentalPaidCdf: s.rentalPaidCdf, ownerNetCdf: s.partnerNetCdf ?? 0, platformFeeCdf: s.platformFeeCdf ?? 0, cash });
      this.push(out, job, 'JOB_SHARE', plan.ownerWalletCredit, ledger.creditByRef(`RENTAL_OWNER:${job.referenceId}`), 'Part du loueur différente du calcul.');
      this.push(out, job, 'JOB_SHARE', plan.ownerPromoTopUp, ledger.creditByRef(`PROMO_TOPUP:RENTAL:${job.referenceId}`), 'Compensation promo du loueur différente du calcul.');
      this.push(out, job, 'JOB_SHARE', plan.promoCost, ledger.promoCost, 'Coût promo SENGA différent du calcul.', 'MEDIUM');
      return;
    }

    if (job.referenceType === 'DELIVERY') {
      const s = await this.fetchJson<{
        deliveryType?: string | null;
        totalPaidCdf?: number;
        platformFeeCdf?: number;
        driver?: { userId: string; netCdf: number } | null;
        restaurants?: { ownerUserId: string | null; netCdf: number }[];
      }>(`/internal/services/DELIVERY/${job.referenceId}/food-settlement`);
      if (s?.deliveryType === 'FOOD') {
        const owners = (s.restaurants ?? []).filter((r) => r.ownerUserId);
        const plan = planFoodSettlement({
          totalPaidCdf: s.totalPaidCdf ?? 0,
          restaurantNets: owners.map((r) => r.netCdf),
          courierNetCdf: s.driver?.netCdf ?? 0,
          platformFeeCdf: s.platformFeeCdf ?? 0,
          cash,
        });
        const restaurantsDue = cash ? 0 : plan.restaurantCredits.reduce((a, b) => a + b, 0);
        this.push(out, job, 'JOB_SHARE', restaurantsDue, ledger.creditByRef(`DELIVERY_FOOD_RESTAURANT:${job.referenceId}`), 'Part des restaurants différente du calcul.');
        this.push(out, job, 'JOB_SHARE', plan.courierWalletCredit, ledger.creditByRef(`DELIVERY_PAYOUT:${job.referenceId}`), 'Part du livreur différente du calcul.');
        this.push(out, job, 'JOB_SHARE', plan.courierPromoTopUp, ledger.creditByRef(`PROMO_TOPUP:DELIVERY:${job.referenceId}`), 'Compensation promo du livreur différente du calcul.');
        if (cash) {
          this.push(out, job, 'JOB_SHARE', plan.restaurantDebts.reduce((a, b) => a + b, 0), debtBy('RESTAURANT_SHARE'), 'Part restaurant à reverser (espèces) différente du calcul.');
          this.push(out, job, 'JOB_SHARE', plan.platformDebt, debtBy('PLATFORM_FEE'), 'Commission à reverser (espèces) différente du calcul.');
        }
        return;
      }
    }

    // Rides and the other services: one driver and SENGA.
    const payout =
      job.referenceType === 'RIDE'
        ? await this.fetchJson<{ driverId?: string | null; driverNetCdf?: number; isShared?: boolean }>(`/internal/rides/${job.referenceId}/payout`)
        : await this.fetchJson<{ driverId?: string | null; driverNetCdf?: number; customerRefundCdf?: number }>(
            `/internal/services/${job.referenceType}/${job.referenceId}/payout`,
          );
    if (!payout?.driverId || (payout as { isShared?: boolean }).isShared) return;
    const plan = planDriverPayout({
      driverNetCdf: payout.driverNetCdf ?? 0,
      paidCdf: job.amountCdf,
      refundCdf: (payout as { customerRefundCdf?: number }).customerRefundCdf ?? 0,
      cash,
    });
    const type = job.referenceType;
    this.push(out, job, 'JOB_SHARE', plan.driverWalletCredit, ledger.creditByRef(`${type}_PAYOUT:${job.referenceId}`), 'Part du chauffeur différente du calcul.');
    this.push(out, job, 'JOB_SHARE', plan.driverPromoTopUp, ledger.creditByRef(`PROMO_TOPUP:${type}:${job.referenceId}`), 'Compensation promo du chauffeur différente du calcul.');
    this.push(out, job, 'JOB_SHARE', plan.customerRefundCredit, ledger.creditByRef(`BUDGET_REFUND:${type}:${job.referenceId}`), 'Remboursement du client différent du calcul.');
    if (cash) {
      this.push(out, job, 'JOB_SHARE', plan.driverDebt, debtBy('PLATFORM_FEE'), 'Commission à reverser (espèces) différente du calcul.');
    }
  }
}
