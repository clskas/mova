import { HubAppsRegistry } from './hub-apps.registry';
import { ConfigService } from '@nestjs/config';

describe('HubAppsRegistry', () => {
  it('parses AFRISOFT_HUB_APPS and per-app webhook env', () => {
    const values: Record<string, string> = {
      AFRISOFT_HUB_APPS: 'senga:key-senga,educongo:key-edu',
      AFRISOFT_HUB_WEBHOOK_URL_SENGA: 'https://api.afri-soft.com/api/payments/webhooks/afrisoft-hub',
      AFRISOFT_HUB_WEBHOOK_SECRET_SENGA: 'whsec',
    };
    const config = { get: (k: string) => values[k] } as unknown as ConfigService;
    const registry = new HubAppsRegistry(config);
    registry.onModuleInit();
    expect(registry.listAppIds()).toEqual(['senga', 'educongo']);
    expect(registry.getApiKey('senga')).toBe('key-senga');
    expect(registry.get('senga')?.webhookUrl).toContain('/webhooks/afrisoft-hub');
    expect(registry.get('senga')?.webhookSecret).toBe('whsec');
    expect(registry.get('educongo')?.webhookUrl).toBeUndefined();
  });
});
