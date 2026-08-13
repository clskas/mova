import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingInitiateMobileMoney,
  cinetPayInitiateMobileMoney,
  isCinetPayConfigured,
  isSerdiPayPaymentConfigured,
  serdiPayInitiateMobileMoney,
  useAfricasTalkingMobileMoney,
  useCinetPayMobileMoney,
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

function mobileMoneyGateway(config: ConfigService): string {
  return (config.get<string>('MOBILE_MONEY_GATEWAY') ?? 'serdipay').trim().toLowerCase();
}

/**
 * Sticky MM gateway (same spirit as SMS_PROVIDER) — no silent failover.
 * MOBILE_MONEY_GATEWAY=serdipay|cinetpay|africastalking|legacy|mock
 */
async function initiateViaGateway(
  config: ConfigService,
  operator: 'ORANGE_MONEY' | 'MPESA' | 'AIRTEL_MONEY',
  amountCdf: number,
  phone: string,
  reference: string,
): Promise<PaymentInitResult | null> {
  const get = envGetter(config);
  const gateway = mobileMoneyGateway(config);

  if (gateway === 'mock') {
    return null;
  }

  if (gateway === 'cinetpay') {
    if (!isCinetPayConfigured(get)) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('CinetPay', [
          'CINETPAY_API_KEY',
          'CINETPAY_SITE_ID',
          'CINETPAY_NOTIFY_URL',
          'MOBILE_MONEY_GATEWAY=cinetpay',
        ]),
      };
    }
    return cinetPayInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }

  if (gateway === 'serdipay') {
    if (!isSerdiPayPaymentConfigured(get)) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('SerdiPay', [
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
    return serdiPayInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }

  if (gateway === 'africastalking') {
    if (!useAfricasTalkingMobileMoney(get)) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage("Africa's Talking MM", [
          'AFRICAS_TALKING_USERNAME',
          'AFRICAS_TALKING_API_KEY',
          'MOBILE_MONEY_GATEWAY=africastalking',
        ]),
      };
    }
    return africasTalkingInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }

  // legacy — fall through to direct operator connectors
  if (gateway === 'legacy') return null;

  // Unknown value: keep prior helpers if somehow still matching
  if (useSerdiPayMobileMoney(get)) {
    return serdiPayInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }
  if (useCinetPayMobileMoney(get)) {
    return cinetPayInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }
  if (useAfricasTalkingMobileMoney(get)) {
    return africasTalkingInitiateMobileMoney(get, { operator, amountCdf, phone, reference });
  }
  return null;
}

function verifyProviderRef(providerRef: string): boolean {
  return (
    providerRef.startsWith('sp_') ||
    providerRef.startsWith('cp_') ||
    providerRef.startsWith('at_')
  );
}

function gatewayHint(): string {
  return 'Préférez MOBILE_MONEY_GATEWAY=serdipay ou MOBILE_MONEY_GATEWAY=cinetpay.';
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
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Orange Money / passerelle MM', [
          'MOBILE_MONEY_GATEWAY=serdipay|cinetpay',
          '…credentials du fournisseur choisi',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: `Orange Money direct : connecteur legacy. ${gatewayHint()}`,
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
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('M-Pesa / passerelle MM', [
          'MOBILE_MONEY_GATEWAY=serdipay|cinetpay',
          '…credentials du fournisseur choisi',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: `M-Pesa direct : connecteur legacy. ${gatewayHint()}`,
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
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Airtel Money / passerelle MM', [
          'MOBILE_MONEY_GATEWAY=serdipay|cinetpay',
          '…credentials du fournisseur choisi',
        ]),
      };
    }
    return {
      success: false,
      transactionId: '',
      message: `Airtel Money direct : connecteur legacy. ${gatewayHint()}`,
    };
  }
  async verifyPayment(providerRef: string) { return verifyProviderRef(providerRef); }
}
