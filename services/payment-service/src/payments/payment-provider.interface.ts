export interface PaymentInitResult {
  success: boolean;
  /** True when the gateway accepted the request but settlement is async (webhook). */
  pending?: boolean;
  transactionId?: string;
  providerRef?: string;
  /** CinetPay hosted checkout URL (open in WebView / browser). */
  paymentUrl?: string;
  message?: string;
}
export interface PaymentProvider {
  readonly name: string;
  initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult>;
  verifyPayment(providerRef: string): Promise<boolean>;
}
