/**
 * Incidents (Litiges) — who hears about what.
 *
 * - `userId` is the person who REPORTED the incident (passenger SOS, driver « espèces non
 *   reçues »…). They are told when it is received, taken in charge and closed.
 * - An anti-fraud alert (referenceType FRAUD_AUTO) is opened by the SENGA team about a
 *   suspect: the suspect is never told an investigation exists.
 */
export const FRAUD_INCIDENT_REFERENCE = 'FRAUD_AUTO';

export function incidentNotifiesReporter(incident: { type?: string | null; referenceType?: string | null }): boolean {
  return incident.referenceType !== FRAUD_INCIDENT_REFERENCE;
}

/** Outcome chosen by the team when closing an incident (shown in the timeline). */
export const INCIDENT_OUTCOMES = {
  RESOLVED: 'Résolu',
  CUSTOMER_PAID: 'Le client a payé — paiement confirmé',
  CUSTOMER_DID_NOT_PAY: 'Le client n’a pas payé — il devra régler avant sa prochaine course',
  REFUNDED: 'Remboursé / geste commercial',
  SANCTIONED: 'Sanction appliquée',
  NO_ACTION: 'Classé sans suite',
  FALSE_POSITIVE: 'Faux positif',
} as const;

export type IncidentOutcome = keyof typeof INCIDENT_OUTCOMES;

/** Status stored for a closed incident: an anti-fraud false positive is DISMISSED. */
export function incidentStatusForOutcome(outcome: string | null | undefined): 'RESOLVED' | 'DISMISSED' {
  return outcome === 'FALSE_POSITIVE' || outcome === 'NO_ACTION' ? 'DISMISSED' : 'RESOLVED';
}
