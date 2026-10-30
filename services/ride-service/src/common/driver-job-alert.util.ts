import {
  DriverJobAlertPayload,
  DriverJobKind,
  DriverJobStopPayload,
  DriverJobStopReason,
  MOVA_EVENTS,
  RedisService,
  VehicleType,
} from '@mova/shared';
import { MatchingService } from '../matching/matching.service';
import { filterDriversNotDebtBlocked } from './driver-debt.util';
import { filterDriversAcceptingDeliveries, filterDriversAcceptingRides } from './driver-eligibility.util';

/** Types d'engins à notifier pour colis, express, courses/commissions, etc. */
export const DELIVERY_ALERT_VEHICLE_TYPES: VehicleType[] = [
  VehicleType.MOTO_TAXI,
  VehicleType.STANDARD,
  VehicleType.COMFORT,
  VehicleType.VIP,
  VehicleType.UTILITAIRE,
  VehicleType.CAMION,
];

const ALERT_TTL_SEC = 15 * 60;

function alertCacheKey(jobKind: DriverJobKind | string, referenceId: string): string {
  return `driver-job-alert:${jobKind}:${referenceId}`;
}

async function cacheAlertedDrivers(
  redis: RedisService,
  jobKind: DriverJobKind,
  referenceId: string,
  driverUserIds: string[],
): Promise<void> {
  if (driverUserIds.length === 0) return;
  try {
    await redis.client.setex(
      alertCacheKey(jobKind, referenceId),
      ALERT_TTL_SEC,
      JSON.stringify(driverUserIds),
    );
  } catch {
    /* Redis down — le stop pourra encore utiliser SEARCH_ATTEMPT (courses). */
  }
}

export async function loadAlertedDrivers(
  redis: RedisService,
  jobKind: DriverJobKind,
  referenceId: string,
): Promise<string[]> {
  try {
    const raw = await redis.client.get(alertCacheKey(jobKind, referenceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export async function publishDriverJobAlert(
  redis: RedisService,
  payload: DriverJobAlertPayload,
): Promise<void> {
  if (!payload.driverUserIds?.length) return;
  await redis.publish(MOVA_EVENTS.DRIVER_JOB_ALERT, payload);
  await cacheAlertedDrivers(redis, payload.jobKind, payload.referenceId, payload.driverUserIds);
}

/**
 * Notifie les livreurs SENGA à proximité (pas les chauffeurs « courses uniquement »).
 * Utilisé pour DELIVERY_OFFER (colis, repas, express, courses/errands).
 */
export async function notifyNearbyDrivers(
  redis: RedisService,
  matching: MatchingService,
  opts: {
    jobKind: DriverJobKind;
    referenceId: string;
    pickupLat: number;
    pickupLng: number;
    pickupAddress?: string;
    title: string;
    body: string;
    vehicleTypes?: VehicleType[];
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const types = opts.vehicleTypes ?? [VehicleType.MOTO_TAXI, VehicleType.STANDARD];
  const seen = new Set<string>();
  const forDelivery = opts.jobKind === 'DELIVERY_OFFER';
  for (const vehicleType of types) {
    const drivers = await matching.findDrivers(opts.pickupLat, opts.pickupLng, vehicleType, 0, {
      forDelivery,
    });
    for (const d of drivers) seen.add(d.userId);
  }
  let driverUserIds = await filterDriversNotDebtBlocked([...seen]);
  if (forDelivery) {
    driverUserIds = await filterDriversAcceptingDeliveries(driverUserIds);
  } else if (opts.jobKind === 'RIDE_OFFER') {
    driverUserIds = await filterDriversAcceptingRides(driverUserIds);
  }
  if (driverUserIds.length === 0) return;
  await publishDriverJobAlert(redis, {
    jobKind: opts.jobKind,
    referenceId: opts.referenceId,
    driverUserIds,
    title: opts.title,
    body: opts.body,
    pickupAddress: opts.pickupAddress,
    pickupLat: opts.pickupLat,
    pickupLng: opts.pickupLng,
    data: opts.data,
  });
}

/**
 * Coupe la sonnerie côté apps fermées (FCM JOB_STOP) + invalide le cache d’alerte.
 */
export async function publishDriverJobStop(
  redis: RedisService,
  opts: {
    jobKind: DriverJobKind;
    referenceId: string;
    reason: DriverJobStopReason;
    driverUserIds?: string[];
    excludeUserIds?: string[];
  },
): Promise<void> {
  const cached = await loadAlertedDrivers(redis, opts.jobKind, opts.referenceId);
  const exclude = new Set((opts.excludeUserIds ?? []).filter(Boolean));
  const merged = [...new Set([...(opts.driverUserIds ?? []), ...cached])].filter(
    (id) => id && !exclude.has(id),
  );
  if (merged.length === 0) {
    try {
      await redis.client.del(alertCacheKey(opts.jobKind, opts.referenceId));
    } catch {
      /* ignore */
    }
    return;
  }
  const payload: DriverJobStopPayload = {
    jobKind: opts.jobKind,
    referenceId: opts.referenceId,
    reason: opts.reason,
    driverUserIds: merged,
  };
  await redis.publish(MOVA_EVENTS.DRIVER_JOB_STOP, payload);
  try {
    await redis.client.del(alertCacheKey(opts.jobKind, opts.referenceId));
  } catch {
    /* ignore */
  }
}
