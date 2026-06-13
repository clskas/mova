import { KINSHASA_COMMUNES, MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { Delivery, DeliveryEvent, DeliveryStatus } from '@prisma/client';

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

const STATUS_ORDER: DeliveryStatus[] = [
  DeliveryStatus.PENDING,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.DELIVERED,
];

export function buildParcelTimeline(
  delivery: Pick<Delivery, 'status'>,
  events?: Pick<DeliveryEvent, 'event' | 'createdAt'>[],
): { label: string; done: boolean; at?: string }[] {
  if (delivery.status === DeliveryStatus.CANCELLED) {
    return [{ label: 'Livraison annulée', done: true }];
  }
  const currentIdx = STATUS_ORDER.indexOf(delivery.status);
  return PARCEL_TIMELINE.map((step, idx) => {
    const event = events?.find((e) => e.event === step.status);
    return {
      label: step.label,
      done: idx <= currentIdx,
      ...(event ? { at: event.createdAt.toISOString() } : {}),
    };
  });
}

export function formatParcelDelivery(
  delivery: Delivery & { events?: DeliveryEvent[] },
) {
  const priceCdf = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf;
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
    createdAt: delivery.createdAt.toISOString(),
    timeline: buildParcelTimeline(delivery, delivery.events),
  };
}
