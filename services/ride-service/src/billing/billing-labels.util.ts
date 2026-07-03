export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  WALLET: 'Portefeuille MOVA',
  ORANGE_MONEY: 'Orange Money',
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  CASH: 'Espèces',
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  RIDE: 'Course taxi',
  DELIVERY: 'Livraison',
  ERRAND: 'Course commission',
  MOVING: 'Déménagement',
  RENTAL: 'Location véhicule',
  CARPOOL: 'Covoiturage',
  SCHEDULED: 'Course planifiée',
};

export function receiptNumberFrom(referenceType: string, referenceId: string) {
  const short = referenceId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `MOVA-${referenceType.slice(0, 3)}-${short}`;
}

export function formatCdfReceipt(amount: number) {
  return `${amount.toLocaleString('fr-CD')} FC`;
}
