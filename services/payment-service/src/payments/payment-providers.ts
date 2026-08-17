import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingInitiateMobileMoney,
  afrisoftHubReference,
  afrisoftPayHubInitiatePayment,
  cinetPayInitiateMobileMoney,
  isAfrisoftPayHubClientConfigured,
  isAfrisoftPayHubMode,
  isAfrisoftHubAsyncRef,
  isCinetPayConfigured,
  isSerdiPayPaymentConfigured,
  serdiPayInitiateMobileMoney,
  useAfricasTalkingMobileMoney,
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

export function isAsyncMobileMoneyRef(providerRef?: string | null): boolean {
  return isAfrisoftHubAsyncRef(providerRef);
}

/**
 * Sticky MM gateway.
 * Render / SENGA apps: call AfriSoft hub (pay.afri-soft.com) — never SerdiPay direct.
 * VPS hub (AFRISOFT_PAY_HUB_MODE=true): talk to SerdiPay / CinetPay.
 */
export async function initiateViaGateway(
  config: ConfigService,
  operator: 'ORANGE_MONEY' | 'MPESA' | 'AIRTEL_MONEY',
  amountCdf: number,
  phone: string,
  reference: string,
  purpose = 'pay',
): Promise<PaymentInitResult | null> {
  const get = envGetter(config);
  const gateway = mobileMoneyGateway(config);

  if (gateway === 'mock') {
    return null;
  }

  const hubProcess = isAfrisoftPayHubMode(get);
  const hubClient = isAfrisoftPayHubClientConfigured(get);

  if (!hubProcess && hubClient) {
    const merchantRef = reference.startsWith('senga_') ? reference : afrisoftHubReference('senga', purpose);
    const result = await afrisoftPayHubInitiatePayment(get, {
      operator,
      amountCdf,
      phone,
      reference: merchantRef,
      purpose,
      metadata: { original_reference: reference },
      idempotencyKey: `senga:${purpose}:${reference}`,
    });
    return {
      success: result.success,
      pending: result.pending,
      transactionId: result.transactionId,
      providerRef: result.providerRef,
      paymentUrl: result.paymentUrl,
      message: result.message,
    };
  }

  if (!hubProcess) {
    return {
      success: false,
      transactionId: '',
      message: missingConfigMessage('Hub paiements AfriSoft', [
        'AFRISOFT_PAY_HUB_URL=https://pay.afri-soft.com',
        'AFRISOFT_PAY_HUB_APP_ID=senga',
        'AFRISOFT_PAY_HUB_API_KEY',
      ]),
    };
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

  if (gateway === 'legacy') return null;

  return {
    success: false,
    transactionId: '',
    message: missingConfigMessage('Passerelle MM hub', ['MOBILE_MONEY_GATEWAY=serdipay|cinetpay']),
  };
}

function verifyProviderRef(providerRef: string): boolean {
  return isAfrisoftHubAsyncRef(providerRef);
}

function gatewayHint(): string {
  return 'Préférez AFRISOFT_PAY_HUB_URL (SENGA) ou MOBILE_MONEY_GATEWAY=serdipay sur le VPS hub.';
}

@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly name = 'ORANGE_MONEY';
  constructor(private config: ConfigService) {}

  private isLegacyConfigured(): boolean {
    return Boolean(this.config.get('ORANGE_MONEY_API_KEY') && this.config.get('ORANGE_MONEY_MERCHANT_ID'));
  }

  async initiatePayment(amountCdf: number, phone: string, reference: string): Promise<PaymentInitResult> {
    const viaGateway = await initiateViaGateway(this.config, 'ORANGE_MONEY', amountCdf, phone, reference, 'pay');
    if (viaGateway) return viaGateway;
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Orange Money / passerelle MM', [
          'AFRISOFT_PAY_HUB_URL',
          'AFRISOFT_PAY_HUB_APP_ID=senga',
          'AFRISOFT_PAY_HUB_API_KEY',
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
    const viaGateway = await initiateViaGateway(this.config, 'MPESA', amountCdf, phone, reference, 'pay');
    if (viaGateway) return viaGateway;
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('M-Pesa / passerelle MM', [
          'AFRISOFT_PAY_HUB_URL',
          'AFRISOFT_PAY_HUB_APP_ID=senga',
          'AFRISOFT_PAY_HUB_API_KEY',
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
    const viaGateway = await initiateViaGateway(this.config, 'AIRTEL_MONEY', amountCdf, phone, reference, 'pay');
    if (viaGateway) return viaGateway;
    if (mobileMoneyGateway(this.config) !== 'legacy' || !this.isLegacyConfigured()) {
      return {
        success: false,
        transactionId: '',
        message: missingConfigMessage('Airtel Money / passerelle MM', [
          'AFRISOFT_PAY_HUB_URL',
          'AFRISOFT_PAY_HUB_APP_ID=senga',
          'AFRISOFT_PAY_HUB_API_KEY',
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
