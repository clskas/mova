import { KINSHASA_COMMUNES, MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { Delivery, DeliveryEvent, DeliveryStatus, DeliveryType } from '@prisma/client';

/** Bounding box approximatif de Kinshasa (RDC). */
export const KINSHASA_BOUNDS = {
  minLat: -4.55,
  maxLat: -4.0,
  minLng: 15.15,
  maxLng: 15.55,
};

const COMMUNE_NAMES = KINSHASA_COMMUNES.map((c) => c.name.toLowerCase());

export function assertKinshasaCoords(lat: number, lng: number): void {
  if (
    lat < KINSHASA_BOUNDS.minLat ||
    lat > KINSHASA_BOUNDS.maxLat ||
    lng < KINSHASA_BOUNDS.minLng ||
    lng > KINSHASA_BOUNDS.maxLng
  ) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Les coordonnées GPS doivent être situées à Kinshasa.',
    );
  }
}

export function detectCommune(lat: number, lng: number, address?: string): string | null {
  if (address) {
    const lower = address.toLowerCase();
    for (const name of COMMUNE_NAMES) {
      if (lower.includes(name)) return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  let best: (typeof KINSHASA_COMMUNES)[number] | null = null;
  let bestDist = Infinity;
  for (const commune of KINSHASA_COMMUNES) {
    const d = (commune.lat - lat) ** 2 + (commune.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = commune;
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
  { status: DeliveryStatus.PENDING, label: 'Commande passée au restaurant' },
  { status: DeliveryStatus.PICKED_UP, label: 'Repas récupéré' },
  { status: DeliveryStatus.IN_TRANSIT, label: 'Livreur en route' },
  { status: DeliveryStatus.DELIVERED, label: 'Repas livré' },
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

/** Position mock coursier Kinshasa (interpolation selon statut) */
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

export function formatParcelDelivery(
  delivery: Delivery & { events?: DeliveryEvent[]; restaurant?: { id: string; name: string; cuisine?: string | null } | null },
) {
  const priceCdf = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf;
  const paymentReady = delivery.status === DeliveryStatus.DELIVERED;
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
    city: 'Kinshasa',
    distanceKm: delivery.distanceKm,
    durationMin: delivery.durationMin,
    paymentReady,
    restaurant: delivery.restaurant ? { id: delivery.restaurant.id, name: delivery.restaurant.name, cuisine: delivery.restaurant.cuisine } : undefined,
    createdAt: delivery.createdAt.toISOString(),
    timeline: buildParcelTimeline(delivery, delivery.events),
    courierLocation: mockCourierLocation(delivery),
  };
}
