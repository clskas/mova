import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IncidentType, Prisma } from '@prisma/client';
import { INCIDENT_OUTCOMES, IncidentOutcome, MOVA_EVENTS, IncidentCreatedPayload, IncidentUpdatePayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export type CreateIncidentInput = {
  userId: string;
  type: IncidentType;
  description: string;
  rideId?: string;
  lat?: number;
  lng?: number;
  referenceType?: string;
  referenceId?: string;
  counterpartyUserId?: string;
  isEmergency?: boolean;
};

type TrailPoint = { lat: number; lng: number; at: string };
type Note = { at: string; by: string; text: string };

/** Positions are accepted this long after a SOS. */
export const SOS_FOLLOW_UP_MS = 30 * 60_000;
/** A SOS nobody took in this delay is escalated once. */
export const SOS_ESCALATION_MS = 2 * 60_000;
/** At most this many SOS per user in [SOS_RATE_WINDOW_MS] (avoids repeated alerts by mistake). */
export const SOS_RATE_MAX = 3;
export const SOS_RATE_WINDOW_MS = 10 * 60_000;
const MAX_TRAIL = 150;
const MAX_NOTES = 100;
const MAX_TRUSTED_CONTACTS = 3;

export function normalizeRdcPhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  let local = digits;
  if (local.startsWith('243')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  return /^[89]\d{8}$/.test(local) ? `+243${local}` : null;
}

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

@Injectable()
export class IncidentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentsService.name);
  private escalationTimer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    this.escalationTimer = setInterval(() => void this.escalateUnacknowledged(), 30_000);
    this.escalationTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.escalationTimer) clearInterval(this.escalationTimer);
  }

  private async publish(channel: string, payload: object) {
    try {
      await this.redis.publish(channel, payload);
    } catch {
      /* non-blocking */
    }
  }

  async create(input: CreateIncidentInput) {
    const isEmergency = input.isEmergency ?? input.type === IncidentType.SOS;
    if (isEmergency) {
      const recent = await this.prisma.incident.count({
        where: { userId: input.userId, isEmergency: true, createdAt: { gte: new Date(Date.now() - SOS_RATE_WINDOW_MS) } },
      });
      if (recent >= SOS_RATE_MAX) {
        throw new HttpException(
          'Plusieurs alertes SOS viennent d’être envoyées. L’équipe SENGA est déjà prévenue ; en cas de danger, appelez le 112.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const hasPos = validCoord(input.lat, input.lng);
    const now = new Date();
    const incident = await this.prisma.incident.create({
      data: {
        userId: input.userId,
        type: input.type,
        description: String(input.description ?? '').slice(0, 2000),
        rideId: input.rideId,
        lat: hasPos ? input.lat : undefined,
        lng: hasPos ? input.lng : undefined,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        counterpartyUserId: input.counterpartyUserId,
        isEmergency,
        ...(hasPos && isEmergency
          ? { trail: [{ lat: input.lat!, lng: input.lng!, at: now.toISOString() }] as Prisma.InputJsonValue, lastLocationAt: now }
          : {}),
      },
    });
    const payload: IncidentCreatedPayload = {
      incidentId: incident.id,
      userId: incident.userId,
      type: incident.type,
      rideId: incident.rideId ?? undefined,
      referenceType: incident.referenceType ?? undefined,
      referenceId: incident.referenceId ?? undefined,
      lat: incident.lat ?? undefined,
      lng: incident.lng ?? undefined,
      isEmergency: incident.isEmergency,
    };
    await this.publish(MOVA_EVENTS.INCIDENT_CREATED, payload);
    return incident;
  }

  /** Every open incident, plus the 500 most recent closed ones. */
  async list() {
    const [open, recent] = await Promise.all([
      this.prisma.incident.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.incident.findMany({ where: { status: { not: 'OPEN' } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    return [...open, ...recent].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Anti-fraud incidents (open and closed) — the fraud page shows which alerts were reviewed. */
  async listByReferenceType(referenceType: string) {
    return this.prisma.incident.findMany({
      where: { referenceType },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { id: true, referenceId: true, status: true, resolvedAt: true, createdAt: true, notes: true },
    });
  }

  private readonly publicSelect = {
    id: true,
    type: true,
    description: true,
    status: true,
    isEmergency: true,
    rideId: true,
    referenceType: true,
    referenceId: true,
    acknowledgedAt: true,
    acknowledgedByName: true,
    resolvedAt: true,
    createdAt: true,
  } satisfies Prisma.IncidentSelect;

  /** The user's own reports (status shown in the app). */
  async listMine(userId: string) {
    return this.prisma.incident.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: this.publicSelect,
    });
  }

  async getMine(userId: string, id: string) {
    const row = await this.prisma.incident.findFirst({ where: { id, userId }, select: this.publicSelect });
    if (!row) throw new NotFoundException('Signalement introuvable.');
    return row;
  }

  /** Live position after a SOS (owner only, open SOS, first 30 minutes). */
  async addLocation(userId: string, id: string, lat: unknown, lng: unknown) {
    if (!validCoord(lat, lng)) throw new BadRequestException('Position invalide.');
    const row = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Signalement introuvable.');
    const open = row.isEmergency && row.status === 'OPEN' && Date.now() - row.createdAt.getTime() <= SOS_FOLLOW_UP_MS;
    if (!open) return { tracking: false };
    const now = new Date();
    const trail = (Array.isArray(row.trail) ? (row.trail as TrailPoint[]) : []).slice(-(MAX_TRAIL - 1));
    trail.push({ lat: lat as number, lng: lng as number, at: now.toISOString() });
    await this.prisma.incident.update({
      where: { id },
      data: { lat: lat as number, lng: lng as number, lastLocationAt: now, trail: trail as Prisma.InputJsonValue },
    });
    return { tracking: true };
  }

  /** Ops agent takes the SOS / incident in charge: the user is told. */
  async acknowledge(id: string, actorId: string, actorName?: string) {
    const row = await this.prisma.incident.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Signalement introuvable.');
    if (row.acknowledgedAt) return row;
    const name = (actorName ?? '').trim().slice(0, 80) || 'Équipe SENGA';
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: actorId,
        acknowledgedByName: name,
        notes: this.appendNote(row.notes, name, 'Pris en charge'),
      },
    });
    await this.publish(MOVA_EVENTS.INCIDENT_ACKNOWLEDGED, this.updatePayload(updated, name));
    return updated;
  }

  async addNote(id: string, actorName: string, text: string) {
    const clean = String(text ?? '').trim().slice(0, 1000);
    if (!clean) throw new BadRequestException('La note est vide.');
    const row = await this.prisma.incident.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Signalement introuvable.');
    return this.prisma.incident.update({
      where: { id },
      data: { notes: this.appendNote(row.notes, (actorName ?? '').trim() || 'Équipe SENGA', clean) },
    });
  }

  async findOpenByReference(referenceType: string, referenceId: string) {
    return this.prisma.incident.findMany({
      where: { referenceType, referenceId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Close (RESOLVED / DISMISSED) or reopen (OPEN) an incident. `outcome` (INCIDENT_OUTCOMES key)
   * and `comment` go into the timeline; the reporter is told the outcome.
   */
  async resolve(id: string, status: string, actorName?: string, opts?: { outcome?: string; comment?: string }) {
    const row = await this.prisma.incident.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Signalement introuvable.');
    const by = (actorName ?? '').trim() || 'Équipe SENGA';
    const clean = ['OPEN', 'RESOLVED', 'DISMISSED'].includes(status) ? status : 'RESOLVED';
    const outcomeKey = opts?.outcome && opts.outcome in INCIDENT_OUTCOMES ? (opts.outcome as IncidentOutcome) : undefined;
    const outcomeText = outcomeKey ? INCIDENT_OUTCOMES[outcomeKey] : undefined;
    const comment = String(opts?.comment ?? '').trim().slice(0, 1000);
    const noteText =
      clean === 'OPEN'
        ? `Rouvert${comment ? ` — ${comment}` : ''}`
        : `${outcomeText ?? (clean === 'DISMISSED' ? 'Classé sans suite' : 'Résolu')}${comment ? ` — ${comment}` : ''}`;
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        status: clean,
        resolvedAt: clean !== 'OPEN' ? new Date() : null,
        // Reopened: the team must take it in charge again.
        ...(clean === 'OPEN' ? { acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null } : {}),
        notes: this.appendNote(row.notes, by, noteText),
      },
    });
    if (clean !== 'OPEN' && row.status === 'OPEN') {
      await this.publish(MOVA_EVENTS.INCIDENT_RESOLVED, this.updatePayload(updated, by, outcomeText));
    }
    return updated;
  }

  async countOpen() {
    return this.prisma.incident.count({ where: { status: 'OPEN' } });
  }

  /** SOS still not taken after 2 minutes: alert the ops team once more. */
  async escalateUnacknowledged(now = Date.now()) {
    try {
      const rows = await this.prisma.incident.findMany({
        where: {
          isEmergency: true,
          status: 'OPEN',
          acknowledgedAt: null,
          escalatedAt: null,
          createdAt: { lte: new Date(now - SOS_ESCALATION_MS), gte: new Date(now - 60 * 60_000) },
        },
        take: 20,
      });
      for (const row of rows) {
        const updated = await this.prisma.incident.update({ where: { id: row.id }, data: { escalatedAt: new Date(now) } });
        await this.publish(MOVA_EVENTS.INCIDENT_ESCALATED, this.updatePayload(updated));
      }
      return rows.length;
    } catch (e) {
      this.logger.warn(`SOS escalation skipped: ${(e as Error).message.slice(0, 160)}`);
      return 0;
    }
  }

  async listTrustedContacts(userId: string) {
    return this.prisma.trustedContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, phone: true },
    });
  }

  /** Replaces the user's emergency contacts (max 3, +243 numbers). */
  async setTrustedContacts(userId: string, contacts: unknown) {
    const list = Array.isArray(contacts) ? contacts : [];
    if (list.length > MAX_TRUSTED_CONTACTS) {
      throw new BadRequestException(`Maximum ${MAX_TRUSTED_CONTACTS} contacts d’urgence.`);
    }
    const clean: { name: string; phone: string }[] = [];
    for (const raw of list) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? '').trim().slice(0, 60);
      const phone = normalizeRdcPhone(o.phone);
      if (!name) throw new BadRequestException('Indiquez le nom de chaque contact.');
      if (!phone) throw new BadRequestException('Numéro de contact invalide (+243 suivi de 9 chiffres).');
      if (!clean.some((c) => c.phone === phone)) clean.push({ name, phone });
    }
    await this.prisma.$transaction([
      this.prisma.trustedContact.deleteMany({ where: { userId } }),
      ...clean.map((c) => this.prisma.trustedContact.create({ data: { userId, ...c } })),
    ]);
    return this.listTrustedContacts(userId);
  }

  async purgeTrustedContacts(userId: string) {
    await this.prisma.trustedContact.deleteMany({ where: { userId } });
  }

  private appendNote(raw: Prisma.JsonValue | null, by: string, text: string): Prisma.InputJsonValue {
    const notes = (Array.isArray(raw) ? (raw as Note[]) : []).slice(-(MAX_NOTES - 1));
    notes.push({ at: new Date().toISOString(), by, text });
    return notes as Prisma.InputJsonValue;
  }

  private updatePayload(
    row: {
      id: string;
      userId: string;
      type: string;
      isEmergency: boolean;
      lat: number | null;
      lng: number | null;
      referenceType?: string | null;
    },
    byName?: string,
    outcome?: string,
  ): IncidentUpdatePayload {
    return {
      incidentId: row.id,
      userId: row.userId,
      type: row.type,
      isEmergency: row.isEmergency,
      byName,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
      referenceType: row.referenceType ?? undefined,
      outcome,
    };
  }
}
