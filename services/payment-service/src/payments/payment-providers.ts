import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentInitResult, PaymentProvider } from './payment-provider.interface';
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockPaymentProvider.name);
  constructor(private config: ConfigService) {}
  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    this.logger.log(`[MOCK] Payment ${amountCdf} CDF from ${phone} ref=${reference}`);
    return { success: true, transactionId: `MOCK-${Date.now()}`, providerRef: `mock_${reference}`, message: 'Paiement simulé avec succès' };
  }
  async verifyPayment(providerRef: string) { return providerRef.startsWith('mock_'); }
}
@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  async initiatePayment() { return { success: false, transactionId: '', message: 'Orange Money API non configurée' }; }
  async verifyPayment() { return false; }
}
@Injectable()
export class MpesaProvider implements PaymentProvider {
  readonly name = 'MPESA';
  async initiatePayment() { return { success: false, transactionId: '', message: 'M-Pesa API non configurée' }; }
  async verifyPayment() { return false; }
}
@Injectable()
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'AIRTEL_MONEY';
  async initiatePayment() { return { success: false, transactionId: '', message: 'Airtel Money API non configurée' }; }
  async verifyPayment() { return false; }
}
