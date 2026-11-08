import { Injectable, Logger } from '@nestjs/common';
import { FRAUD_INCIDENT_REFERENCE, INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

type MovaService = 'auth' | 'ride' | 'driver' | 'payment';

type RideFraudSignals = {
  periodDays: number;
  generatedAt: string;
  cancellations: {
    rideId: string;
    passengerId: string;
    driverId: string | null;
    cancelledBy: string | null;
    cancelReason: string | null;
    acceptedAt: string | null;
    cancelledAt: string | null;
    vehicleType: string;
    amountCdf: number;
    serviceType?: 'RIDE' | 'DELIVERY';
  }[];
  pairs: {
    passengerId: string;
    driverId: string;
    totalRides: number;
    cancelledAfterAccept: number;
    completed: number;
  }[];
  unpaidCompleted: {
    rideId: string;
    passengerId: string;
    driverId: string | null;
    completedAt: string | null;
    amountCdf: number;
    paymentStatus: string | null;
    serviceType?: 'RIDE' | 'DELIVERY';
  }[];
};

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type FraudSample = { id: string; serviceType: 'RIDE' | 'DELIVERY' };

export type FraudAlert = {
  entityId: string;
  entityType: 'DRIVER' | 'PASSENGER';
  /** Display name / phone of the person (from the account). */
  entityName?: string | null;
  entityPhone?: string | null;
  score: number;
  severity: FraudSeverity;
  cancellationsAfterAccept: number;
  unpaidCompleted: number;
  recurringPairs: number;
  counterpartIds: string[];
  counterparts?: { id: string; name?: string | null; phone?: string | null }[];
  reasons: string[];
  sampleRideIds: string[];
  samples?: FraudSample[];
  incidentCreated: boolean;
  /** Last time the team closed a review of this person (no new signal since → « déjà examiné »). */
  review?: { incidentId: string; status: string; resolvedAt: string | null; outcome?: string | null } | null;
  reviewed?: boolean;
  latestSignalAt?: string | null;
};

export type FraudAlertsResponse = {
  periodDays: number;
  generatedAt: string;
  autoIncidentThreshold: number;
  summary: {
    totalAlerts: number;
    highSeverity: number;
    cancellationsAfterAccept: number;
    unpaidCompleted: number;
    recurringPairs: number;
    incidentsCreated: number;
    reviewed: number;
    testAccountsExcluded: number;
  };
  alerts: FraudAlert[];
};

export type FraudIncidentResult = {
  created: boolean;
  alreadyExists: boolean;
  incidentId?: string;
  message: string;
};

type FraudIncidentRow = {
  id: string;
  referenceId?: string | null;
  status?: string;
  resolvedAt?: string | null;
  createdAt?: string;
  notes?: Array<{ text?: string }> | null;
};

type UserBrief = { name: string | null; phone: string | null };

/** Poids de scoring anti-contournement (ajustables). */
const WEIGHT_CANCELLATION = 10;
const WEIGHT_UNPAID = 15;
const WEIGHT_PAIR = 8;
/** Score from which an alert is « Risque élevé ». */
const HIGH_RISK_SCORE = 60;

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };
  private jsonHeaders = { ...this.headers, 'Content-Type': 'application/json' };
  private testIdsCache: { at: number; ids: Set<string> } | null = null;
  private briefCache = new Map<string, { at: number; brief: UserBrief }>();

  private async fetchJson<T>(service: MovaService, path: string): Promise<T> {
    const res = await fetch(serviceUrl(service, path), { headers: this.headers });
    if (!res.ok) throw new Error(`Fraud proxy failed: ${service}${path}`);
    return res.json() as Promise<T>;
  }

  private severityFor(score: number): FraudSeverity {
    if (score >= HIGH_RISK_SCORE) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /** Staff, store-review demo and Google test accounts: their activity is not fraud. */
  private async testAccountIds(): Promise<Set<string>> {
    if (this.testIdsCache && Date.now() - this.testIdsCache.at < 5 * 60_000) return this.testIdsCache.ids;
    try {
      const res = await this.fetchJson<{ ids?: string[] }>('auth', '/internal/users/report-test-accounts');
      const ids = new Set(res.ids ?? []);
      this.testIdsCache = { at: Date.now(), ids };
      return ids;
    } catch {
      return this.testIdsCache?.ids ?? new Set();
    }
  }

  async userBrief(id: string): Promise<UserBrief> {
    const hit = this.briefCache.get(id);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.brief;
    try {
      const u = await this.fetchJson<{ firstName?: string; lastName?: string; phone?: string; email?: string }>(
        'auth',
        `/internal/users/${id}`,
      );
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
      const brief = { name, phone: u.phone ?? null };
      this.briefCache.set(id, { at: Date.now(), brief });
      return brief;
    } catch {
      return { name: null, phone: null };
    }
  }

  /**
   * Alerts are computed on each visit; nothing is created automatically (an admin opens a
   * dispute or marks a false positive). A person already reviewed with no new signal since
   * is listed apart (« Déjà examinés »).
   */
  async getAlerts(opts: { days?: number; autoCreate?: boolean; threshold?: number } = {}): Promise<FraudAlertsResponse> {
    const days = Math.min(Math.max(Number(opts.days) || 30, 1), 180);
    const threshold = Number(opts.threshold) || HIGH_RISK_SCORE;

    const [signals, testIds] = await Promise.all([
      this.fetchJson<RideFraudSignals>('ride', `/internal/fraud/signals?days=${days}`).catch(
        () => ({ periodDays: days, generatedAt: new Date().toISOString(), cancellations: [], pairs: [], unpaidCompleted: [] } as RideFraudSignals),
      ),
      this.testAccountIds(),
    ]);

    type Acc = {
      entityId: string;
      entityType: 'DRIVER' | 'PASSENGER';
      cancellationsAfterAccept: number;
      unpaidCompleted: number;
      recurringPairs: number;
      counterpartIds: Set<string>;
      samples: Map<string, FraudSample>;
      latestSignalAt: number;
    };
    const acc = new Map<string, Acc>();
    let testAccountsExcluded = 0;
    const isTest = (...ids: (string | null | undefined)[]) => ids.some((id) => id != null && testIds.has(id));
    const touch = (entityType: 'DRIVER' | 'PASSENGER', entityId: string): Acc => {
      const key = `${entityType}:${entityId}`;
      let entry = acc.get(key);
      if (!entry) {
        entry = {
          entityId,
          entityType,
          cancellationsAfterAccept: 0,
          unpaidCompleted: 0,
          recurringPairs: 0,
          counterpartIds: new Set(),
          samples: new Map(),
          latestSignalAt: 0,
        };
        acc.set(key, entry);
      }
      return entry;
    };
    const addSample = (entry: Acc, id: string, serviceType: 'RIDE' | 'DELIVERY' = 'RIDE', at?: string | null) => {
      if (entry.samples.size < 8) entry.samples.set(id, { id, serviceType });
      const t = at ? Date.parse(at) : NaN;
      if (Number.isFinite(t) && t > entry.latestSignalAt) entry.latestSignalAt = t;
    };

    for (const c of signals.cancellations) {
      if (isTest(c.passengerId, c.driverId)) {
        testAccountsExcluded++;
        continue;
      }
      const passenger = touch('PASSENGER', c.passengerId);
      passenger.cancellationsAfterAccept += 1;
      addSample(passenger, c.rideId, c.serviceType, c.cancelledAt);
      if (c.driverId) {
        const driver = touch('DRIVER', c.driverId);
        driver.cancellationsAfterAccept += 1;
        addSample(driver, c.rideId, c.serviceType, c.cancelledAt);
      }
    }

    for (const u of signals.unpaidCompleted) {
      if (isTest(u.passengerId, u.driverId)) {
        testAccountsExcluded++;
        continue;
      }
      const passenger = touch('PASSENGER', u.passengerId);
      passenger.unpaidCompleted += 1;
      addSample(passenger, u.rideId, u.serviceType, u.completedAt);
      if (u.driverId) {
        const driver = touch('DRIVER', u.driverId);
        driver.unpaidCompleted += 1;
        addSample(driver, u.rideId, u.serviceType, u.completedAt);
      }
    }

    for (const p of signals.pairs) {
      if (isTest(p.passengerId, p.driverId)) continue;
      const passenger = touch('PASSENGER', p.passengerId);
      passenger.recurringPairs += 1;
      passenger.counterpartIds.add(p.driverId);
      const driver = touch('DRIVER', p.driverId);
      driver.recurringPairs += 1;
      driver.counterpartIds.add(p.passengerId);
    }

    const alerts: FraudAlert[] = [...acc.values()]
      .map((entry) => {
        const score =
          entry.cancellationsAfterAccept * WEIGHT_CANCELLATION +
          entry.unpaidCompleted * WEIGHT_UNPAID +
          entry.recurringPairs * WEIGHT_PAIR;
        const reasons: string[] = [];
        if (entry.cancellationsAfterAccept > 0)
          reasons.push(
            `${entry.cancellationsAfterAccept} annulation(s) au moins 3 min après l'acceptation (course possible hors app)`,
          );
        if (entry.recurringPairs > 0) reasons.push(`${entry.recurringPairs} binôme(s) récurrent(s) hors système`);
        if (entry.unpaidCompleted > 0)
          reasons.push(`${entry.unpaidCompleted} course(s)/livraison(s) terminée(s) depuis plus de 24 h sans paiement validé`);
        const samples = [...entry.samples.values()];
        return {
          entityId: entry.entityId,
          entityType: entry.entityType,
          score,
          severity: this.severityFor(score),
          cancellationsAfterAccept: entry.cancellationsAfterAccept,
          unpaidCompleted: entry.unpaidCompleted,
          recurringPairs: entry.recurringPairs,
          counterpartIds: [...entry.counterpartIds],
          reasons,
          sampleRideIds: samples.map((s) => s.id),
          samples,
          incidentCreated: false,
          latestSignalAt: entry.latestSignalAt ? new Date(entry.latestSignalAt).toISOString() : null,
        } as FraudAlert;
      })
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);

    // Reviews: open dispute → « Litige ouvert »; closed with no newer signal → « Déjà examiné ».
    const reviews = await this.loadFraudReviews();
    for (const alert of alerts) {
      const rows = reviews.get(this.referenceId(alert.entityType, alert.entityId)) ?? [];
      const open = rows.find((r) => r.status === 'OPEN');
      if (open) {
        alert.incidentCreated = true;
        alert.review = { incidentId: open.id, status: 'OPEN', resolvedAt: null };
        continue;
      }
      const closed = rows.find((r) => r.status !== 'OPEN' && r.resolvedAt);
      if (closed) {
        const lastNote = Array.isArray(closed.notes) ? closed.notes[closed.notes.length - 1]?.text ?? null : null;
        alert.review = { incidentId: closed.id, status: closed.status ?? 'RESOLVED', resolvedAt: closed.resolvedAt ?? null, outcome: lastNote };
        const reviewedAt = Date.parse(closed.resolvedAt ?? '');
        const latest = alert.latestSignalAt ? Date.parse(alert.latestSignalAt) : 0;
        alert.reviewed = Number.isFinite(reviewedAt) && latest <= reviewedAt;
        if (!alert.reviewed) alert.reasons.push('Nouveaux signaux depuis le dernier examen');
      }
    }

    // Names / phones of the people shown (top 100 alerts).
    await Promise.all(
      alerts.slice(0, 100).map(async (alert) => {
        const brief = await this.userBrief(alert.entityId);
        alert.entityName = brief.name;
        alert.entityPhone = brief.phone;
        alert.counterparts = await Promise.all(
          alert.counterpartIds.slice(0, 5).map(async (id) => ({ id, ...(await this.userBrief(id)) })),
        );
      }),
    );

    const active = alerts.filter((a) => !a.reviewed);
    const summary = {
      totalAlerts: active.length,
      highSeverity: active.filter((a) => a.severity === 'HIGH').length,
      cancellationsAfterAccept: signals.cancellations.length,
      unpaidCompleted: signals.unpaidCompleted.length,
      recurringPairs: signals.pairs.length,
      incidentsCreated: alerts.filter((a) => a.incidentCreated).length,
      reviewed: alerts.length - active.length,
      testAccountsExcluded,
    };

    return {
      periodDays: signals.periodDays ?? days,
      generatedAt: signals.generatedAt ?? new Date().toISOString(),
      autoIncidentThreshold: threshold,
      summary,
      alerts,
    };
  }

  /** Crée un incident FRAUD pour l'alerte si aucun n'est déjà ouvert (idempotent). */
  async createIncident(alert: Pick<FraudAlert, 'entityId' | 'entityType' | 'reasons'> & { score?: number }): Promise<FraudIncidentResult> {
    return this.ensureIncident({
      entityId: alert.entityId,
      entityType: alert.entityType,
      reasons: alert.reasons ?? [],
      score: alert.score ?? 0,
    });
  }

  /**
   * « Faux positif » : the review is recorded (closed as DISMISSED) so the alert moves to
   * « Déjà examinés » until a new signal appears. The person is never notified.
   */
  async dismissAlert(
    alert: Pick<FraudAlert, 'entityId' | 'entityType' | 'reasons'> & { score?: number },
    actorName: string,
    comment?: string,
  ): Promise<{ dismissed: boolean; incidentId?: string; message: string }> {
    const ensured = await this.ensureIncident({
      entityId: alert.entityId,
      entityType: alert.entityType,
      reasons: alert.reasons ?? [],
      score: alert.score ?? 0,
    });
    if (!ensured.incidentId) return { dismissed: false, message: ensured.message };
    const res = await fetch(serviceUrl('driver', `/internal/incidents/${ensured.incidentId}/resolve`), {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({ status: 'DISMISSED', outcome: 'FALSE_POSITIVE', actorName, comment }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(body || `Classement impossible (${res.status})`);
    }
    return { dismissed: true, incidentId: ensured.incidentId, message: 'Alerte classée « faux positif ».' };
  }

  private referenceId(entityType: string, entityId: string) {
    return `${entityType}:${entityId}`;
  }

  /** Every anti-fraud dispute (open and closed), newest first, grouped by person. */
  private async loadFraudReviews(): Promise<Map<string, FraudIncidentRow[]>> {
    const rows = await this.fetchJson<FraudIncidentRow[]>(
      'driver',
      `/internal/incidents/by-reference-type?referenceType=${FRAUD_INCIDENT_REFERENCE}`,
    ).catch(() => [] as FraudIncidentRow[]);
    const map = new Map<string, FraudIncidentRow[]>();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row.referenceId) continue;
      const list = map.get(row.referenceId) ?? [];
      list.push(row);
      map.set(row.referenceId, list);
    }
    return map;
  }

  private async findOpenIncident(referenceId: string): Promise<{ id: string } | null> {
    const existing = await this.fetchJson<{ id: string }[]>(
      'driver',
      `/internal/incidents/by-reference?referenceType=${FRAUD_INCIDENT_REFERENCE}&referenceId=${encodeURIComponent(referenceId)}`,
    ).catch(() => []);
    return Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
  }

  private async ensureIncident(alert: {
    entityId: string;
    entityType: 'DRIVER' | 'PASSENGER';
    reasons: string[];
    score: number;
  }): Promise<FraudIncidentResult> {
    const referenceId = this.referenceId(alert.entityType, alert.entityId);
    const open = await this.findOpenIncident(referenceId);
    if (open) {
      return {
        created: false,
        alreadyExists: true,
        incidentId: open.id,
        message: 'Un litige est déjà ouvert pour cette alerte.',
      };
    }

    const label = alert.entityType === 'DRIVER' ? 'Chauffeur/livreur' : 'Client';
    const description = `Alerte anti-contournement (score ${alert.score}). ${label} suspecté. ${alert.reasons.join(' ; ')}`;
    // userId = the suspect; referenceType FRAUD_AUTO keeps every notification away from them.
    const res = await fetch(serviceUrl('driver', '/internal/incidents'), {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        userId: alert.entityId,
        type: 'FRAUD',
        description,
        referenceType: FRAUD_INCIDENT_REFERENCE,
        referenceId,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(body || `Création incident échouée (${res.status})`);
    }
    const row = (await res.json()) as { id?: string };
    return {
      created: true,
      alreadyExists: false,
      incidentId: row.id,
      message: 'Litige ouvert avec succès.',
    };
  }
}
