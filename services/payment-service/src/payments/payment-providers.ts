import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { africasTalkingInitiateMobileMoney, useAfricasTalkingMobileMoney } from '@mova/shared';
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

function atGetter(config: ConfigService) {
  return (key: string) => config.get<string>(key);
}

@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(this.config.get('ORANGE_MONEY_API_KEY') && this.config.get('ORANGE_MONEY_MERCHANT_ID'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (useAfricasTalkingMobileMoney(atGetter(this.config))) {
      return africasTalkingInitiateMobileMoney(atGetter(this.config), {
        operator: 'ORANGE_MONEY',
        amountCdf,
        phone,
        reference,
      });
    }
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Orange Money / Africa\'s Talking', [
          'AFRICAS_TALKING_USERNAME',
          'AFRICAS_TALKING_API_KEY',
          'AFRICAS_TALKING_PRODUCT_NAME',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'Orange Money direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=africastalking.',
    };
  }
  async verifyPayment(providerRef: string) { return providerRef.startsWith('at_'); }
}

@Injectable()
export class MpesaProvider implements PaymentProvider {
  readonly name = 'MPESA';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(
      this.config.get('MPESA_CONSUMER_KEY') &&
        this.config.get('MPESA_CONSUMER_SECRET') &&
        this.config.get('MPESA_SHORTCODE'),
    );
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (useAfricasTalkingMobileMoney(atGetter(this.config))) {
      return africasTalkingInitiateMobileMoney(atGetter(this.config), {
        operator: 'MPESA',
        amountCdf,
        phone,
        reference,
      });
    }
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('M-Pesa / Africa\'s Talking', [
          'AFRICAS_TALKING_USERNAME',
          'AFRICAS_TALKING_API_KEY',
          'AFRICAS_TALKING_PRODUCT_NAME',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'M-Pesa direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=africastalking.',
    };
  }
  async verifyPayment(providerRef: string) { return providerRef.startsWith('at_'); }
}

@Injectable()
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'AIRTEL_MONEY';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(this.config.get('AIRTEL_MONEY_CLIENT_ID') && this.config.get('AIRTEL_MONEY_CLIENT_SECRET'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    if (useAfricasTalkingMobileMoney(atGetter(this.config))) {
      return africasTalkingInitiateMobileMoney(atGetter(this.config), {
        operator: 'AIRTEL_MONEY',
        amountCdf,
        phone,
        reference,
      });
    }
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Airtel Money / Africa\'s Talking', [
          'AFRICAS_TALKING_USERNAME',
          'AFRICAS_TALKING_API_KEY',
          'AFRICAS_TALKING_PRODUCT_NAME',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'Airtel Money direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=africastalking.',
    };
  }
  async verifyPayment(providerRef: string) { return providerRef.startsWith('at_'); }
}
