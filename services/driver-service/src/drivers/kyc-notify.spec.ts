import { notifyDriverActivationPin, notifyDriverKycReject } from './kyc-notify';

describe('driver KYC notify', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ smsSent: false, emailSent: true, hasPhone: false, hasEmail: true }),
    })) as jest.Mock;
  });

  it('envoie le PIN d\'activation par e-mail si le compte n\'a pas de +243', async () => {
    const result = await notifyDriverActivationPin('u1', '111657');
    expect(result.emailSent).toBe(true);
    expect(result.hasEmail).toBe(true);
    expect(result.hasPhone).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/users/u1/notify'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.purpose).toBe('driver_activation');
    expect(body.emailText).toContain('111657');
    expect(body.smsText).toContain('111657');
  });

  it('envoie le motif de refus par SMS ou e-mail', async () => {
    const motif = 'Photo floue, recommencer';
    const result = await notifyDriverKycReject('u1', { documentType: 'DRIVERS_LICENSE', reason: motif });
    expect(result.emailSent).toBe(true);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.purpose).toBe('kyc_reject');
    expect(body.smsText).toContain(motif);
    expect(body.emailText).toContain(motif);
    expect(body.smsText).toMatch(/Permis|justificatif/i);
  });
});
