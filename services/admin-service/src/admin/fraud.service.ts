import { Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

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
  }[];
};

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type FraudAlert = {
  entityId: string;
  entityType: 'DRIVER' | 'PASSENGER';
  score: number;
  severity: FraudSeverity;
  cancellationsAfterAccept: number;
  unpaidCompleted: number;
  recurringPairs: number;
  counterpartIds: string[];
  reasons: string[];
  sampleRideIds: string[];
  incidentCreated: boolean;
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
  };
  alerts: FraudAlert[];
};

export type FraudIncidentResult = {
  created: boolean;
  alreadyExists: boolean;
  incidentId?: string;
  message: string;
};

type DriverIncidentRow = {
  id: string;
  referenceType?: string | null;
  referenceId?: string | null;
  status?: string;
};

/** Poids de scoring anti-contournement (ajustables). */
const WEIGHT_CANCELLATION = 10;
const WEIGHT_UNPAID = 15;
const WEIGHT_PAIR = 8;
const DEFAULT_AUTO_THRESHOLD = 60;

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private headers = { 'x-internal-api-key': INTERNAL_API_KEY };
  private jsonHeaders = { ...this.headers, 'Content-Type': 'application/json' };

  private async fetchJson<T>(service: MovaService, path: string): Promise<T> {
    const res = await fetch(serviceUrl(service, path), { headers: this.headers });
    if (!res.ok) throw new Error(`Fraud proxy failed: ${service}${path}`);
    return res.json() as Promise<T>;
  }

  private severityFor(score: number): FraudSeverity {
    if (score >= DEFAULT_AUTO_THRESHOLD) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  async getAlerts(opts: { days?: number; autoCreate?: boolean; threshold?: number } = {}): Promise<FraudAlertsResponse> {
    const days = Math.min(Math.max(Number(opts.days) || 30, 1), 180);
    const threshold = Number(opts.threshold) || DEFAULT_AUTO_THRESHOLD;
    const autoCreate = opts.autoCreate !== false;

    const signals = await this.fetchJson<RideFraudSignals>('ride', `/internal/fraud/signals?days=${days}`).catch(
      () => ({ periodDays: days, generatedAt: new Date().toISOString(), cancellations: [], pairs: [], unpaidCompleted: [] } as RideFraudSignals),
    );

    type Acc = {
      entityId: string;
      entityType: 'DRIVER' | 'PASSENGER';
      cancellationsAfterAccept: number;
      unpaidCompleted: number;
      recurringPairs: number;
      counterpartIds: Set<string>;
      sampleRideIds: Set<string>;
    };
    const acc = new Map<string, Acc>();
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
          sampleRideIds: new Set(),
        };
        acc.set(key, entry);
      }
      return entry;
    };
    const addSample = (entry: Acc, rideId?: string | null) => {
      if (rideId && entry.sampleRideIds.size < 8) entry.sampleRideIds.add(rideId);
    };

    for (const c of signals.cancellations) {
      const passenger = touch('PASSENGER', c.passengerId);
      passenger.cancellationsAfterAccept += 1;
      addSample(passenger, c.rideId);
      if (c.driverId) {
        const driver = touch('DRIVER', c.driverId);
        driver.cancellationsAfterAccept += 1;
        addSample(driver, c.rideId);
      }
    }

    for (const u of signals.unpaidCompleted) {
      const passenger = touch('PASSENGER', u.passengerId);
      passenger.unpaidCompleted += 1;
      addSample(passenger, u.rideId);
      if (u.driverId) {
        const driver = touch('DRIVER', u.driverId);
        driver.unpaidCompleted += 1;
        addSample(driver, u.rideId);
      }
    }

    for (const p of signals.pairs) {
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
          reasons.push(`${entry.cancellationsAfterAccept} annulation(s) après acceptation (course possible hors app)`);
        if (entry.recurringPairs > 0)
          reasons.push(`${entry.recurringPairs} binôme(s) récurrent(s) hors système`);
        if (entry.unpaidCompleted > 0)
          reasons.push(`${entry.unpaidCompleted} course(s) terminée(s) sans paiement validé`);
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
          sampleRideIds: [...entry.sampleRideIds],
          incidentCreated: false,
        };
      })
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);

    const openRefs = await this.loadOpenFraudReferences();
    for (const alert of alerts) {
      if (openRefs.has(this.referenceId(alert.entityType, alert.entityId))) {
        alert.incidentCreated = true;
      }
    }

    let incidentsCreated = 0;
    if (autoCreate) {
      for (const alert of alerts) {
        if (alert.score < threshold || alert.incidentCreated) continue;
        try {
          const result = await this.ensureIncident(alert);
          if (result.created) {
            alert.incidentCreated = true;
            incidentsCreated += 1;
          } else if (result.alreadyExists) {
            alert.incidentCreated = true;
          }
        } catch (e) {
          this.logger.warn(`Auto-incident fraude échoué pour ${alert.entityType}:${alert.entityId}: ${(e as Error).message}`);
        }
      }
    }

    const summary = {
      totalAlerts: alerts.length,
      highSeverity: alerts.filter((a) => a.severity === 'HIGH').length,
      cancellationsAfterAccept: signals.cancellations.length,
      unpaidCompleted: signals.unpaidCompleted.length,
      recurringPairs: signals.pairs.length,
      incidentsCreated,
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

  private referenceId(entityType: string, entityId: string) {
    return `${entityType}:${entityId}`;
  }

  private async loadOpenFraudReferences(): Promise<Set<string>> {
    const incidents = await this.fetchJson<DriverIncidentRow[]>('driver', '/internal/incidents').catch(() => []);
    return new Set(
      incidents
        .filter((i) => i.referenceType === 'FRAUD_AUTO' && i.status === 'OPEN' && i.referenceId)
        .map((i) => i.referenceId as string),
    );
  }

  private async findOpenIncident(referenceId: string): Promise<DriverIncidentRow | null> {
    const existing = await this.fetchJson<DriverIncidentRow[]>(
      'driver',
      `/internal/incidents/by-reference?referenceType=FRAUD_AUTO&referenceId=${encodeURIComponent(referenceId)}`,
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
    const res = await fetch(serviceUrl('driver', '/internal/incidents'), {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        userId: alert.entityId,
        type: 'FRAUD',
        description,
        referenceType: 'FRAUD_AUTO',
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
