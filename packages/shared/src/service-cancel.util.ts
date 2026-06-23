export type CancelEligibility = {
  canCancel: boolean;
  cancelBlockReason?: string;
};

function blocked(reason: string): CancelEligibility {
  return { canCancel: false, cancelBlockReason: reason };
}

function allowed(): CancelEligibility {
  return { canCancel: true };
}

export function canCancelRentalBooking(params: {
  status: string;
  startDate: Date | string;
}): CancelEligibility {
  const terminal = new Set(['CLOSED', 'RETURNED', 'IN_PROGRESS']);
  if (terminal.has(params.status)) {
    return blocked('Cette location ne peut plus être annulée à ce stade.');
  }
  const start = new Date(params.startDate);
  if (!Number.isNaN(start.getTime()) && Date.now() >= start.getTime()) {
    return blocked('La date de prise en charge est atteinte — annulation impossible.');
  }
  return allowed();
}

export function canCancelScheduledRide(params: {
  status: string;
  scheduledAt: Date | string;
}): CancelEligibility {
  if (params.status === 'CANCELLED' || params.status === 'COMPLETED') {
    return blocked('Cette réservation est déjà terminée ou annulée.');
  }
  if (params.status === 'IN_PROGRESS') {
    return blocked('La course planifiée est en cours — annulation impossible.');
  }
  const at = new Date(params.scheduledAt);
  if (!Number.isNaN(at.getTime()) && at.getTime() <= Date.now()) {
    return blocked('L\'heure de réservation est passée — annulation impossible.');
  }
  return allowed();
}

export function canCancelMoving(params: { status: string }): CancelEligibility {
  if (params.status === 'COMPLETED' || params.status === 'CANCELLED') {
    return blocked('Cette demande est déjà terminée ou annulée.');
  }
  if (params.status === 'IN_PROGRESS') {
    return blocked('Le déménagement est en cours — annulation impossible.');
  }
  return allowed();
}

export function canCancelCarpoolTrip(params: {
  status: string;
  departureAt: Date | string;
}): CancelEligibility {
  if (params.status === 'COMPLETED' || params.status === 'CANCELLED') {
    return blocked('Ce trajet est déjà terminé ou annulé.');
  }
  const departure = new Date(params.departureAt);
  if (!Number.isNaN(departure.getTime()) && departure.getTime() <= Date.now()) {
    return blocked('Le départ est passé — annulation impossible.');
  }
  return allowed();
}

export function canCancelDelivery(params: { status: string; type?: string }): CancelEligibility {
  if (params.status === 'CANCELLED' || params.status === 'DELIVERED') {
    return blocked('Cette commande est déjà terminée ou annulée.');
  }
  if (params.status === 'IN_TRANSIT') {
    return blocked('La livraison est en cours — annulation impossible.');
  }
  if (params.type === 'FOOD' && params.status === 'PICKED_UP') {
    return blocked('Le livreur a pris en charge la commande.');
  }
  if (params.type !== 'FOOD' && (params.status === 'PICKED_UP' || params.status === 'IN_TRANSIT')) {
    return blocked('Le coursier a pris en charge le colis.');
  }
  return allowed();
}

export function canCancelErrand(params: { status: string }): CancelEligibility {
  if (params.status === 'COMPLETED' || params.status === 'CANCELLED') {
    return blocked('Cette course est déjà terminée ou annulée.');
  }
  if (params.status === 'IN_PROGRESS') {
    return blocked('Le livreur effectue vos courses — annulation impossible.');
  }
  return allowed();
}

export function canCancelRide(params: { status: string }): CancelEligibility {
  const cancellable = new Set([
    'REQUESTED',
    'SEARCHING',
    'MATCHING',
    'ACCEPTED',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVED',
    'ARRIVING',
  ]);
  if (cancellable.has(params.status)) return allowed();
  if (params.status === 'CANCELLED') {
    return blocked('Cette course est déjà annulée.');
  }
  if (params.status === 'COMPLETED') {
    return blocked('Cette course est terminée.');
  }
  return blocked('La course est en cours — annulation impossible.');
}

export function withCancelEligibility<T extends Record<string, unknown>>(
  payload: T,
  eligibility: CancelEligibility,
): T & CancelEligibility {
  return { ...payload, ...eligibility };
}
