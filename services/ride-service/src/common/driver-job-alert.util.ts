import { VehicleType } from '@prisma/client';
import { DriverJobAlertPayload, DriverJobKind, MOVA_EVENTS } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { MatchingService } from '../matching/matching.service';

export async function publishDriverJobAlert(
  redis: RedisService,
  payload: DriverJobAlertPayload,
): Promise<void> {
  if (!payload.driverUserIds?.length) return;
  await redis.publish(MOVA_EVENTS.DRIVER_JOB_ALERT, payload);
}

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
  for (const vehicleType of types) {
    const drivers = await matching.findDrivers(opts.pickupLat, opts.pickupLng, vehicleType, 0);
    for (const d of drivers) seen.add(d.userId);
  }
  const driverUserIds = [...seen];
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
