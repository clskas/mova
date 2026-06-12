export interface PaymentInitResult {
  success: boolean;
  transactionId?: string;
  providerRef?: string;
  message?: string;
}
export interface PaymentProvider {
  readonly name: string;
  initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult>;
  verifyPayment(providerRef: string): Promise<boolean>;
}
