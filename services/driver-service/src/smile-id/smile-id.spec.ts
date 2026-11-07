import {
  isFinalSmileIdStatus,
  smileIdBaseUrl,
  smileIdConfig,
  smileIdLinkIdTypes,
  smileIdSignature,
  smileIdWebhookIds,
  summarizeSmileIdResult,
  verifySmileIdSignature,
} from './smile-id';

describe('smile-id helpers', () => {
  it('is off until the partner ID and the API key are both set', () => {
    expect(smileIdConfig({})).toBeNull();
    expect(smileIdConfig({ SMILE_ID_PARTNER_ID: '9527' })).toBeNull();
    const cfg = smileIdConfig({ SMILE_ID_PARTNER_ID: '9527', SMILE_ID_API_KEY: 'k' });
    expect(cfg?.env).toBe('sandbox');
    expect(cfg?.callbackUrl).toBe('https://api.afri-soft.com/api/drivers/smile-id/webhook');
    expect(smileIdConfig({ SMILE_ID_PARTNER_ID: '1', SMILE_ID_API_KEY: 'k', SMILE_ID_ENV: 'Production' })?.env).toBe(
      'production',
    );
  });

  it('targets the sandbox or production host', () => {
    expect(smileIdBaseUrl('sandbox')).toBe('https://testapi.smileidentity.com');
    expect(smileIdBaseUrl('production')).toBe('https://api.smileidentity.com');
  });

  it('offers the three DRC documents with document verification', () => {
    expect(smileIdLinkIdTypes()).toEqual([
      { country: 'CD', id_type: 'VOTER_ID', verification_method: 'document_verification' },
      { country: 'CD', id_type: 'PASSPORT', verification_method: 'document_verification' },
      { country: 'CD', id_type: 'DRIVERS_LICENSE', verification_method: 'document_verification' },
    ]);
  });

  it('checks the webhook signature', () => {
    const cfg = { apiKey: 'secret', partnerId: '9527' };
    const ts = '2026-11-09T10:00:00.000Z';
    const sig = smileIdSignature('secret', ts, '9527');
    expect(verifySmileIdSignature(cfg, ts, sig)).toBe(true);
    expect(verifySmileIdSignature(cfg, ts, smileIdSignature('other', ts, '9527'))).toBe(false);
    expect(verifySmileIdSignature(cfg, undefined, sig)).toBe(false);
    expect(verifySmileIdSignature(cfg, ts, 'short')).toBe(false);
  });

  it('keeps only what the admin needs from a result', () => {
    const s = summarizeSmileIdResult({
      status: 'clear',
      message: 'Verification successful',
      reason: null,
      kyc_receipt: 'https://r/receipt.pdf',
      id_fields: { full_name: 'Jean Kabila', id_number: '33370090005', id_type: 'VOTER_ID' },
      antifraud: { summary: { fraud_detected: false, fraud_sources: [] }, smile_secure: { status: 'clear' } },
      device_signals: { network_connectivity: { ip: '1.2.3.4' } },
    });
    expect(s.status).toBe('clear');
    expect(s.idFields.idNumber).toBe('33370090005');
    expect(s.fraud.detected).toBe(false);
    expect(s.fraud.duplicateUsers).toBeNull();
    expect(JSON.stringify(s)).not.toContain('1.2.3.4');
  });

  it('finds the ids in headers first, then partner_params', () => {
    expect(
      smileIdWebhookIds(
        { 'user-id': 'user_a', 'smileid-job-id': 'job_b' },
        { partner_params: { user_id: 'x', job_id: 'y', senga_user_id: 'u1' } },
      ),
    ).toEqual({ smileUserId: 'user_a', jobId: 'job_b', sengaUserId: 'u1' });
    expect(smileIdWebhookIds({}, { partner_params: { user_id: 'x', job_id: 'y' } })).toEqual({
      smileUserId: 'x',
      jobId: 'y',
      sengaUserId: null,
    });
  });

  it('knows final statuses', () => {
    expect(isFinalSmileIdStatus('clear')).toBe(true);
    expect(isFinalSmileIdStatus('processing')).toBe(false);
    expect(isFinalSmileIdStatus('PENDING')).toBe(false);
  });
});
