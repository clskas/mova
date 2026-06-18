import { formatCdf, MARKET_RDC } from './market-rdc.config';

export type MobileRideStatus =
  | 'REQUESTED'
  | 'MATCHING'
  | 'DRIVER_ASSIGNED'
  | 'ARRIVING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type MobileVehicleType = 'MOTO' | 'STANDARD' | 'CONFORT' | 'VIP';

export type VehicleTypeValue = 'MOTO_TAXI' | 'STANDARD' | 'COMFORT' | 'VIP';
export type RideStatusValue =
  | 'REQUESTED'
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const VEHICLE_ALIASES: Record<string, VehicleTypeValue> = {
  MOTO: 'MOTO_TAXI',
  MOTO_TAXI: 'MOTO_TAXI',
  STANDARD: 'STANDARD',
  CONFORT: 'COMFORT',
  COMFORT: 'COMFORT',
  VIP: 'VIP',
};

export function normalizeVehicleType(input: string): VehicleTypeValue {
  const mapped = VEHICLE_ALIASES[input?.toUpperCase?.() ?? ''];
  if (!mapped) throw new Error(`Invalid vehicle type: ${input}`);
  return mapped;
}

export function toMobileVehicleType(type: VehicleTypeValue): MobileVehicleType {
  switch (type) {
    case 'MOTO_TAXI':
      return 'MOTO';
    case 'COMFORT':
      return 'CONFORT';
    case 'VIP':
      return 'VIP';
    default:
      return 'STANDARD';
  }
}

/** Types de courses qu'un chauffeur peut accepter selon ses véhicules actifs. */
export function rideTypesDriverCanServe(driverVehicleTypes: VehicleTypeValue[]): VehicleTypeValue[] {
  const types = new Set<VehicleTypeValue>();
  for (const vt of driverVehicleTypes) {
    switch (vt) {
      case 'MOTO_TAXI':
        types.add('MOTO_TAXI');
        break;
      case 'STANDARD':
        types.add('STANDARD');
        break;
      case 'COMFORT':
        types.add('STANDARD');
        types.add('COMFORT');
        break;
      case 'VIP':
        types.add('STANDARD');
        types.add('COMFORT');
        types.add('VIP');
        break;
    }
  }
  return [...types];
}

/** Véhicules chauffeur éligibles pour une course d'un type donné (matching inverse). */
export function driverVehicleTypesForRide(rideType: VehicleTypeValue): VehicleTypeValue[] {
  switch (rideType) {
    case 'MOTO_TAXI':
      return ['MOTO_TAXI'];
    case 'STANDARD':
      return ['STANDARD', 'COMFORT', 'VIP'];
    case 'COMFORT':
      return ['COMFORT', 'VIP'];
    case 'VIP':
      return ['VIP'];
  }
}

const STATUS_TO_MOBILE: Record<RideStatusValue, MobileRideStatus> = {
  REQUESTED: 'REQUESTED',
  SEARCHING: 'MATCHING',
  ACCEPTED: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVED: 'ARRIVING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const MOBILE_TO_STATUS: Record<MobileRideStatus, RideStatusValue> = {
  REQUESTED: 'REQUESTED',
  MATCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'ACCEPTED',
  ARRIVING: 'DRIVER_ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export function toMobileRideStatus(status: RideStatusValue): MobileRideStatus {
  return STATUS_TO_MOBILE[status];
}

export function fromMobileRideStatus(status: string): RideStatusValue {
  const mobile = status as MobileRideStatus;
  if (MOBILE_TO_STATUS[mobile]) return MOBILE_TO_STATUS[mobile];
  if ((Object.keys(STATUS_TO_MOBILE) as RideStatusValue[]).includes(status as RideStatusValue)) {
    return status as RideStatusValue;
  }
  throw new Error(`Invalid ride status: ${status}`);
}

export interface FareBreakdown {
  vehicleType: MobileVehicleType;
  distanceKm: number;
  etaMinutes: number;
  /** Alias mobile — même valeur que etaMinutes */
  durationMin: number;
  baseFareCdf: number;
  distanceFareCdf: number;
  durationFareCdf: number;
  surchargeCdf: number;
  totalCdf: number;
  totalFormatted: string;
  formatted: string;
  estimatedFareCdf: number;
  estimatedPriceCdf: number;
  currency: string;
  surchargeMultiplier: number;
}

export function buildFareBreakdown(
  vehicleType: VehicleTypeValue,
  distanceKm: number,
  etaMinutes: number,
  baseFareCdf: number,
  distanceFareCdf: number,
  durationFareCdf: number,
  surchargeMultiplier: number,
  minFareCdf: number,
): FareBreakdown {
  const subtotal = baseFareCdf + distanceFareCdf + durationFareCdf;
  const withSurcharge = Math.ceil(subtotal * surchargeMultiplier);
  const totalCdf = Math.max(withSurcharge, minFareCdf);
  const surchargeCdf = Math.max(0, totalCdf - subtotal);
  const totalFormatted = formatCdf(totalCdf);
  return {
    vehicleType: toMobileVehicleType(vehicleType),
    distanceKm: Math.round(distanceKm * 100) / 100,
    etaMinutes: Math.ceil(etaMinutes),
    durationMin: Math.ceil(etaMinutes),
    baseFareCdf,
    distanceFareCdf,
    durationFareCdf,
    surchargeCdf,
    totalCdf,
    totalFormatted,
    formatted: totalFormatted,
    estimatedFareCdf: totalCdf,
    estimatedPriceCdf: totalCdf,
    currency: MARKET_RDC.currency,
    surchargeMultiplier,
  };
}

export interface RideSummary {
  id: string;
  status: MobileRideStatus;
  vehicleType: MobileVehicleType;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  priceCdf: number;
  totalCdf: number;
  distanceKm: number | null;
  createdAt: Date;
}

export function toRideSummary(ride: {
  id: string;
  status: RideStatusValue;
  vehicleType: VehicleTypeValue;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  estimatedFareCdf: number | null;
  finalFareCdf: number | null;
  distanceKm: number | null;
  createdAt: Date;
}): RideSummary {
  const priceCdf = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
  return {
    id: ride.id,
    status: toMobileRideStatus(ride.status),
    vehicleType: toMobileVehicleType(ride.vehicleType),
    pickupAddress: ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    priceCdf,
    totalCdf: priceCdf,
    distanceKm: ride.distanceKm,
    createdAt: ride.createdAt,
  };
}
