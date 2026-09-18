import {
  DriverJobAlertPayload,
  DriverJobKind,
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

export async function publishDriverJobAlert(
  redis: RedisService,
  payload: DriverJobAlertPayload,
): Promise<void> {
  if (!payload.driverUserIds?.length) return;
  await redis.publish(MOVA_EVENTS.DRIVER_JOB_ALERT, payload);
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
