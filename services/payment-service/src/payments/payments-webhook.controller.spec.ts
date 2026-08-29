import { PaymentsWebhookController } from './payments-webhook.controller';

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

  it('finalizes hub payment from nested SerdiPay callback (raw transactionId)', async () => {
    const finalizeFromAggregator = jest.fn().mockResolvedValue({
      found: true,
      notified: true,
      payment_id: 'pay_099a9f28475d4dd3c0b04fc9',
      status: 'COMPLETED',
    });
    const hubOn = { isEnabled: () => true, finalizeFromAggregator } as never;
    const config = {
      get: (key: string) => (key === 'AFRISOFT_PAY_HUB_MODE' ? 'true' : undefined),
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
    await expect(ctl.serdiPay(body, {}, {})).resolves.toMatchObject({
      success: true,
      found: true,
      status: 'COMPLETED',
    });
    expect(finalizeFromAggregator).toHaveBeenCalledWith('SD260829CPHOG', 'COMPLETED', undefined);
  });
});
