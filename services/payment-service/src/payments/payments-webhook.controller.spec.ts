import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PaymentsWebhookController } from './payments-webhook.controller';

function signSerdiPay(secret: string, raw: string) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

describe('PaymentsWebhookController aggregator gate', () => {
  const payments = {} as never;
  const hub = { isEnabled: () => false } as never;

  it('rejects SerdiPay / CinetPay / AT on SENGA (non-hub)', async () => {
    const config = { get: (key: string) => (key === 'AFRISOFT_PAY_HUB_MODE' ? 'false' : undefined) } as never;
    const ctl = new PaymentsWebhookController(payments, config, hub);
    await expect(ctl.serdiPay({}, {}, {})).resolves.toMatchObject({
      success: false,
      message: 'Webhook agrégateur non accepté ici',
    });
    expect(ctl.cinetPayPing()).toMatchObject({ success: false });
    await expect(ctl.africasTalking({})).resolves.toMatchObject({ success: false });
    await expect(ctl.cinetPay({}, {})).resolves.toMatchObject({ success: false });
  });

  it('rejects SerdiPay webhook when secret is empty (401 fail-closed)', async () => {
    const config = {
      get: (key: string) => (key === 'AFRISOFT_PAY_HUB_MODE' ? 'true' : undefined),
    } as never;
    const ctl = new PaymentsWebhookController({} as never, config, hub);
    await expect(ctl.serdiPay({}, {}, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects SerdiPay webhook when signature is invalid (401 not 200)', async () => {
    const config = {
      get: (key: string) => {
        if (key === 'AFRISOFT_PAY_HUB_MODE') return 'true';
        if (key === 'SERDIPAY_WEBHOOK_SECRET') return 'whsec_test';
        return undefined;
      },
    } as never;
    const ctl = new PaymentsWebhookController({} as never, config, hub);
    await expect(
      ctl.serdiPay({ status: 'success' }, { 'x-serdipay-signature': 'deadbeef' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('finalizes hub payment from nested SerdiPay callback (raw transactionId)', async () => {
    const secret = 'whsec_test';
    const finalizeFromAggregator = jest.fn().mockResolvedValue({
      found: true,
      notified: true,
      payment_id: 'pay_099a9f28475d4dd3c0b04fc9',
      status: 'COMPLETED',
    });
    const hubOn = { isEnabled: () => true, finalizeFromAggregator } as never;
    const config = {
      get: (key: string) => {
        if (key === 'AFRISOFT_PAY_HUB_MODE') return 'true';
        if (key === 'SERDIPAY_WEBHOOK_SECRET') return secret;
        return undefined;
      },
    } as never;
    const ctl = new PaymentsWebhookController({} as never, config, hubOn);
    const body = {
      status: 200,
      payment: {
        status: 'success',
        sessionId: '17879852622884',
        sessionStatus: 3,
        transactionId: 'SD260829CPHOG',
      },
    };
    const raw = JSON.stringify(body);
    const headers = { 'x-serdipay-signature': signSerdiPay(secret, raw) };
    await expect(ctl.serdiPay(body, headers, { rawBody: Buffer.from(raw) })).resolves.toMatchObject({
      success: true,
      found: true,
      status: 'COMPLETED',
    });
    expect(finalizeFromAggregator).toHaveBeenCalledWith('SD260829CPHOG', 'COMPLETED', undefined);
  });
});
