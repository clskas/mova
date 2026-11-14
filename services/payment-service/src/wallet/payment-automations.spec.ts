import { providerOfPendingTopup } from './payment-automations.service';

describe('payment automations', () => {
  it('operator read from the pending top-up label', () => {
    expect(providerOfPendingTopup('Recharge M-Pesa en attente')).toBe('MPESA');
    expect(providerOfPendingTopup('Recharge AIRTEL_MONEY en attente')).toBe('AIRTEL_MONEY');
    expect(providerOfPendingTopup('Recharge Orange Money en attente')).toBe('ORANGE_MONEY');
    expect(providerOfPendingTopup('autre')).toBeNull();
  });
});
