import {
  findServiceAreaByCoords,
  formatCdf,
  getCommunesForArea,
  getServiceArea,
  isInServiceArea,
  KINSHASA_BOUNDS,
  KINSHASA_COMMUNES,
  MovaErrorCode,
  MovaHttpException,
  resolveCityFromCoords,
  serviceAreaOutOfBoundsMessage,
} from '@mova/shared';
import { Delivery, DeliveryEvent, DeliveryStatus, DeliveryType } from '@prisma/client';
import { computeDriverEta } from '../matching/eta.util';

export { KINSHASA_BOUNDS };

export function assertServiceAreaCoords(lat: number, lng: number, areaId?: string): void {
  if (!isInServiceArea(lat, lng, areaId)) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      serviceAreaOutOfBoundsMessage(),
    );
  }
}

/** @deprecated Alias — utiliser assertServiceAreaCoords */
export function assertKinshasaCoords(lat: number, lng: number): void {
  assertServiceAreaCoords(lat, lng);
}

export function detectCommune(lat: number, lng: number, address?: string, areaId?: string): string | null {
  const area = areaId ? getServiceArea(areaId) : findServiceAreaByCoords(lat, lng);
  if (!area) return null;

  const districts = area.id === 'kinshasa' ? KINSHASA_COMMUNES : (area.districts ?? getCommunesForArea(area.id));
  const districtNames = districts.map((d) => d.name.toLowerCase());

  if (address) {
    const lower = address.toLowerCase();
    for (const name of districtNames) {
      if (lower.includes(name)) return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  let best: { name: string; lat: number; lng: number } | null = null;
  let bestDist = Infinity;
  for (const district of districts) {
    const d = (district.lat - lat) ** 2 + (district.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = district;
    }
  }
  return best?.name ?? null;
}

const PARCEL_TIMELINE: { status: DeliveryStatus; label: string }[] = [
  { status: DeliveryStatus.PENDING, label: 'Commande enregistrée' },
  { status: DeliveryStatus.PICKED_UP, label: 'Colis récupéré' },
  { status: DeliveryStatus.IN_TRANSIT, label: 'En transit vers le destinataire' },
  { status: DeliveryStatus.DELIVERED, label: 'Colis livré' },
];

const FOOD_TIMELINE: { status: DeliveryStatus; label: string }[] = [
  { status: DeliveryStatus.PENDING, label: 'Confirmé' },
  { status: DeliveryStatus.PICKED_UP, label: 'Préparation' },
  { status: DeliveryStatus.IN_TRANSIT, label: 'En route' },
  { status: DeliveryStatus.DELIVERED, label: 'Livré' },
];

const EXPRESS_TIMELINE: { status: DeliveryStatus; label: string }[] = [
  { status: DeliveryStatus.PENDING, label: 'Express enregistré' },
  { status: DeliveryStatus.PICKED_UP, label: 'Colis express récupéré' },
  { status: DeliveryStatus.IN_TRANSIT, label: 'Livraison prioritaire en cours' },
  { status: DeliveryStatus.DELIVERED, label: 'Express livré' },
];

const STATUS_ORDER: DeliveryStatus[] = [
  DeliveryStatus.PENDING,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.DELIVERED,
];

export function buildParcelTimeline(
  delivery: Pick<Delivery, 'status' | 'type'>,
  events?: Pick<DeliveryEvent, 'event' | 'createdAt'>[],
): { label: string; done: boolean; at?: string }[] {
  if (delivery.status === DeliveryStatus.CANCELLED) {
    return [{ label: 'Livraison annulée', done: true }];
  }
  const steps =
    delivery.type === DeliveryType.FOOD
      ? FOOD_TIMELINE
      : delivery.type === DeliveryType.EXPRESS
        ? EXPRESS_TIMELINE
        : PARCEL_TIMELINE;
  const currentIdx = STATUS_ORDER.indexOf(delivery.status);
  return steps.map((step, idx) => {
    const event = events?.find((e) => e.event === step.status);
    return {
      label: step.label,
      done: idx <= currentIdx,
      ...(event ? { at: event.createdAt.toISOString() } : {}),
    };
  });
}

/** Timeline courses/commissions */
export function buildErrandTimeline(status: string, completedAt?: Date | null): { label: string; done: boolean; at?: string }[] {
  const steps = [
    { key: 'PENDING', label: 'Commande enregistrée' },
    { key: 'ASSIGNED', label: 'Coursier assigné' },
    { key: 'IN_PROGRESS', label: 'Courses en cours' },
    { key: 'COMPLETED', label: 'Courses livrées' },
  ];
  const order = steps.map((s) => s.key);
  const currentIdx = order.indexOf(status);
  if (status === 'CANCELLED') return [{ label: 'Commande annulée', done: true }];
  return steps.map((step, idx) => ({
    label: step.label,
    done: idx <= currentIdx,
    ...(step.key === 'COMPLETED' && completedAt ? { at: completedAt.toISOString() } : {}),
  }));
}

/** Timeline déménagement */
export function buildMovingTimeline(status: string, completedAt?: Date | null): { label: string; done: boolean; at?: string }[] {
  const steps = [
    { key: 'PENDING', label: 'Demande enregistrée' },
    { key: 'ASSIGNED', label: 'Équipe assignée' },
    { key: 'IN_PROGRESS', label: 'Déménagement en cours' },
    { key: 'COMPLETED', label: 'Déménagement terminé' },
  ];
  const order = steps.map((s) => s.key);
  const currentIdx = order.indexOf(status);
  if (status === 'CANCELLED') return [{ label: 'Demande annulée', done: true }];
  return steps.map((step, idx) => ({
    label: step.label,
    done: idx <= currentIdx,
    ...(step.key === 'COMPLETED' && completedAt ? { at: completedAt.toISOString() } : {}),
  }));
}

/** Code PIN 4 chiffres pour confirmation de livraison (Glovo-style). */
export function generateDeliveryPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function computeDeliveryEtaMinutes(
  courierLat: number,
  courierLng: number,
  dropoffLat: number,
  dropoffLng: number,
): number {
  return computeDriverEta(courierLat, courierLng, dropoffLat, dropoffLng).etaMinutes;
}

export type CourierProfile = {
  userId: string;
  name?: string;
  rating?: number;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
};

/** Position mock coursier (interpolation selon statut) — uniquement sans livreur assigné */
export function mockCourierLocation(
  delivery: Pick<Delivery, 'status' | 'pickupLat' | 'pickupLng' | 'dropoffLat' | 'dropoffLng'>,
): { lat: number; lng: number; ts: number } | null {
  if (!delivery.pickupLat || !delivery.pickupLng || !delivery.dropoffLat || !delivery.dropoffLng) return null;
  if (delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.CANCELLED) return null;
  const progress =
    delivery.status === DeliveryStatus.PENDING
      ? 0.1
      : delivery.status === DeliveryStatus.PICKED_UP
        ? 0.35
        : delivery.status === DeliveryStatus.IN_TRANSIT
          ? 0.7
          : 0.5;
  return {
    lat: delivery.pickupLat + (delivery.dropoffLat - delivery.pickupLat) * progress,
    lng: delivery.pickupLng + (delivery.dropoffLng - delivery.pickupLng) * progress,
    ts: Date.now(),
  };
}

export function resolveCourierLocation(
  delivery: Pick<Delivery, 'status' | 'driverId' | 'pickupLat' | 'pickupLng' | 'dropoffLat' | 'dropoffLng'>,
  courier?: CourierProfile | null,
): { lat: number; lng: number; ts: number } | null {
  if (courier?.lat != null && courier?.lng != null) {
    return { lat: courier.lat, lng: courier.lng, ts: Date.now() };
  }
  if (delivery.driverId) {
    if (delivery.pickupLat != null && delivery.pickupLng != null) {
      return { lat: delivery.pickupLat, lng: delivery.pickupLng, ts: Date.now() };
    }
    return null;
  }
  return mockCourierLocation(delivery);
}

export function formatParcelDelivery(
  delivery: Delivery & { events?: DeliveryEvent[]; restaurant?: { id: string; name: string; cuisine?: string | null } | null },
  courier?: CourierProfile | null,
) {
  const priceCdf = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf;
  const paymentReady = delivery.status === DeliveryStatus.DELIVERED;
  const city = resolveCityFromCoords(delivery.pickupLat ?? 0, delivery.pickupLng ?? 0);
  const dropLat = delivery.dropoffLat ?? delivery.deliveryLat;
  const dropLng = delivery.dropoffLng ?? delivery.deliveryLng;
  const courierLoc = resolveCourierLocation(delivery, courier);
  let etaMinutes: number | null = null;
  if (
    courierLoc &&
    dropLat != null &&
    dropLng != null &&
    delivery.status !== DeliveryStatus.DELIVERED &&
    delivery.status !== DeliveryStatus.CANCELLED
  ) {
    etaMinutes = computeDeliveryEtaMinutes(courierLoc.lat, courierLoc.lng, dropLat, dropLng);
  } else if (delivery.durationMin != null && delivery.status === DeliveryStatus.PENDING) {
    etaMinutes = Math.max(15, Math.ceil(delivery.durationMin + 10));
  }
  return {
    id: delivery.id,
    type: delivery.type,
    status: delivery.status,
    pickupLat: delivery.pickupLat,
    pickupLng: delivery.pickupLng,
    pickupAddress: delivery.pickupAddress,
    pickupCommune: detectCommune(delivery.pickupLat ?? 0, delivery.pickupLng ?? 0, delivery.pickupAddress ?? undefined),
    dropoffLat: delivery.dropoffLat,
    dropoffLng: delivery.dropoffLng,
    dropoffAddress: delivery.dropoffAddress,
    dropoffCommune: detectCommune(delivery.dropoffLat ?? 0, delivery.dropoffLng ?? 0, delivery.dropoffAddress ?? undefined),
    photoUrl: delivery.photoUrl,
    weightCategory: delivery.weightCategory,
    estimatedPriceCdf: delivery.estimatedPriceCdf,
    finalPriceCdf: delivery.finalPriceCdf,
    priceCdf,
    formattedPrice: formatCdf(priceCdf),
    currency: 'CDF',
    city,
    distanceKm: delivery.distanceKm,
    durationMin: delivery.durationMin,
    paymentReady,
    restaurant: delivery.restaurant ? { id: delivery.restaurant.id, name: delivery.restaurant.name, cuisine: delivery.restaurant.cuisine } : undefined,
    createdAt: delivery.createdAt.toISOString(),
    deliveryPin: delivery.deliveryPin ?? null,
    etaMinutes,
    timeline: buildParcelTimeline(delivery, delivery.events),
    courierLocation: courierLoc,
    courier: courier
      ? {
          userId: courier.userId,
          name: courier.name ?? `Livreur ${courier.userId.slice(0, 6)}`,
          rating: courier.rating ?? 4.5,
          phone: courier.phone ?? '',
        }
      : null,
  };
}
