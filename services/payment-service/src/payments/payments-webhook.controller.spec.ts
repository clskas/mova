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
});
