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

function missingConfigMessage(provider: string, vars: string[]): string {
  return `${provider} non configuré. Définissez : ${vars.join(', ')}. Consultez config/external-apis.env.example.`;
}

@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  constructor(private config: ConfigService) {}

  private isConfigured(): boolean {
    return Boolean(this.config.get('ORANGE_MONEY_API_KEY') && this.config.get('ORANGE_MONEY_MERCHANT_ID'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Orange Money', ['ORANGE_MONEY_API_KEY', 'ORANGE_MONEY_MERCHANT_ID']),
      };
    }
    // Intégration API Orange Money RDC — à brancher avec les clés marchand
    return {
      success: false,
      transactionId: '',
      message: 'Orange Money : connecteur prêt, implémentation API marchand requise.',
    };
  }
  async verifyPayment() { return false; }
}

@Injectable()
export class MpesaProvider implements PaymentProvider {
  readonly name = 'MPESA';
  constructor(private config: ConfigService) {}

  private isConfigured(): boolean {
    return Boolean(
      this.config.get('MPESA_CONSUMER_KEY') &&
        this.config.get('MPESA_CONSUMER_SECRET') &&
        this.config.get('MPESA_SHORTCODE'),
    );
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('M-Pesa', ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE']),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'M-Pesa : connecteur prêt, implémentation STK push requise.',
    };
  }
  async verifyPayment() { return false; }
}

@Injectable()
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'AIRTEL_MONEY';
  constructor(private config: ConfigService) {}

  private isConfigured(): boolean {
    return Boolean(this.config.get('AIRTEL_MONEY_CLIENT_ID') && this.config.get('AIRTEL_MONEY_CLIENT_SECRET'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Airtel Money', ['AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET']),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'Airtel Money : connecteur prêt, implémentation API requise.',
    };
  }
  async verifyPayment() { return false; }
}
