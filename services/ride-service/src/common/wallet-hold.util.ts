import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';

async function walletRequest(path: string, method: string, body?: object) {
  const res = await fetch(serviceUrl('payment', path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': INTERNAL_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    if (err.code === MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE || res.status === 400) {
      throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
    }
    throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, err.message);
  }
  return res.json();
}

export async function holdWalletFunds(
  userId: string,
  amountCdf: number,
  referenceType: string,
  referenceId: string,
  description?: string,
) {
  return walletRequest(`/internal/wallets/${userId}/hold`, 'POST', {
    amountCdf,
    referenceType,
    referenceId,
    description,
  });
}

export async function releaseWalletHold(referenceType: string, referenceId: string) {
  return walletRequest(`/internal/wallets/holds/${referenceType}/${referenceId}/release`, 'POST', {});
}

export async function captureWalletHold(referenceType: string, referenceId: string, captureAmountCdf?: number) {
  return walletRequest(`/internal/wallets/holds/${referenceType}/${referenceId}/capture`, 'POST', {
    captureAmountCdf,
  });
}

export async function debitWallet(
  userId: string,
  amountCdf: number,
  description: string,
  referenceType: string,
  referenceId: string,
) {
  return walletRequest(`/internal/wallets/${userId}/debit`, 'POST', {
    amountCdf,
    description,
    reference: `${referenceType}:${referenceId}`,
  });
}
