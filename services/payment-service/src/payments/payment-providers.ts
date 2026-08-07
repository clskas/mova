import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingInitiateMobileMoney,
  serdiPayInitiateMobileMoney,
  useAfricasTalkingMobileMoney,
  useSerdiPayMobileMoney,
} from '@mova/shared';
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

function envGetter(config: ConfigService) {
  return (key: string) => config.get<string>(key);
}

async function initiateViaGateway(
  config: ConfigService,
  operator: 'ORANGE_MONEY' | 'MPESA' | 'AIRTEL_MONEY',
  amountCdf: number,
  phone: string,
  reference: string,
): Promise<PaymentInitResult | null> {
  const get = envGetter(config);
  if (useSerdiPayMobileMoney(get)) {
    return serdiPayInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }
  if (useAfricasTalkingMobileMoney(get)) {
    return africasTalkingInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }
  return null;
}

function verifyProviderRef(providerRef: string): boolean {
  return providerRef.startsWith('sp_') || providerRef.startsWith('at_');
}

@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(this.config.get('ORANGE_MONEY_API_KEY') && this.config.get('ORANGE_MONEY_MERCHANT_ID'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    const viaGateway = await initiateViaGateway(this.config, 'ORANGE_MONEY', amountCdf, phone, reference);
    if (viaGateway) return viaGateway;
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Orange Money / SerdiPay', [
          'SERDIPAY_EMAIL',
          'SERDIPAY_PASSWORD',
          'SERDIPAY_API_ID',
          'SERDIPAY_API_PASSWORD',
          'SERDIPAY_MERCHANT_CODE',
          'SERDIPAY_MERCHANT_PIN',
          'MOBILE_MONEY_GATEWAY=serdipay',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'Orange Money direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=serdipay.',
    };
  }
  async verifyPayment(providerRef: string) { return verifyProviderRef(providerRef); }
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
    const viaGateway = await initiateViaGateway(this.config, 'MPESA', amountCdf, phone, reference);
    if (viaGateway) return viaGateway;
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('M-Pesa / SerdiPay', [
          'SERDIPAY_EMAIL',
          'SERDIPAY_PASSWORD',
          'SERDIPAY_API_ID',
          'SERDIPAY_API_PASSWORD',
          'SERDIPAY_MERCHANT_CODE',
          'SERDIPAY_MERCHANT_PIN',
          'MOBILE_MONEY_GATEWAY=serdipay',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'M-Pesa direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=serdipay.',
    };
  }
  async verifyPayment(providerRef: string) { return verifyProviderRef(providerRef); }
}

@Injectable()
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'AIRTEL_MONEY';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(this.config.get('AIRTEL_MONEY_CLIENT_ID') && this.config.get('AIRTEL_MONEY_CLIENT_SECRET'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    const viaGateway = await initiateViaGateway(this.config, 'AIRTEL_MONEY', amountCdf, phone, reference);
    if (viaGateway) return viaGateway;
    if (!this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Airtel Money / SerdiPay', [
          'SERDIPAY_EMAIL',
          'SERDIPAY_PASSWORD',
          'SERDIPAY_API_ID',
          'SERDIPAY_API_PASSWORD',
          'SERDIPAY_MERCHANT_CODE',
          'SERDIPAY_MERCHANT_PIN',
          'MOBILE_MONEY_GATEWAY=serdipay',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: 'Airtel Money direct : connecteur legacy. Préférez MOBILE_MONEY_GATEWAY=serdipay.',
    };
  }
  async verifyPayment(providerRef: string) { return verifyProviderRef(providerRef); }
}
