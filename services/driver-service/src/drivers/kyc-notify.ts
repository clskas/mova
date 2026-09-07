import {
  driverActivationPinNotifyCopy,
  kycDocumentLabel,
  kycPartnerKindLabel,
  kycRejectNotifyCopy,
  notifyAuthUser,
  type AuthUserNotifyResult,
} from '@mova/shared';

export async function notifyDriverActivationPin(userId: string, pin: string): Promise<AuthUserNotifyResult> {
  return notifyAuthUser(userId, { ...driverActivationPinNotifyCopy(pin), purpose: 'driver_activation' });
}

export async function notifyDriverKycReject(
  userId: string,
  opts: { documentType?: string; reason: string },
): Promise<AuthUserNotifyResult> {
  const copy = kycRejectNotifyCopy({
    partnerKindLabel: kycPartnerKindLabel('DRIVER'),
    documentLabel: opts.documentType ? kycDocumentLabel(opts.documentType) : undefined,
    reason: opts.reason,
  });
  return notifyAuthUser(userId, { ...copy, purpose: 'kyc_reject' });
}
