import { FcmPushService } from './fcm-push.service';
import type { PushTokensService } from './push-tokens.service';

describe('FcmPushService language split', () => {
  const config = { get: () => undefined } as never;

  it('sends English texts to devices running the app in English, French to the others', async () => {
    const pushTokens = { englishTokens: jest.fn().mockResolvedValue(new Set(['en-token'])) } as unknown as PushTokensService;
    const svc = new FcmPushService(config, pushTokens);
    const spy = jest.spyOn(svc, 'sendToTokens');
    await svc.sendToTokens(['fr-token', 'en-token'], { title: 'Course créée', body: 'Recherche de chauffeur en cours dans votre zone SENGA' });

    const calls = spy.mock.calls.slice(1);
    const fr = calls.find((c) => c[0].includes('fr-token'));
    const en = calls.find((c) => c[0].includes('en-token'));
    expect(fr?.[0]).toEqual(['fr-token']);
    expect(fr?.[1].title).toBe('Course créée');
    expect(en?.[0]).toEqual(['en-token']);
    expect(en?.[1]).toMatchObject({ title: 'Ride created', body: 'Looking for a driver in your SENGA area' });
  });

  it('keeps a single French send when no device is in English', async () => {
    const pushTokens = { englishTokens: jest.fn().mockResolvedValue(new Set()) } as unknown as PushTokensService;
    const svc = new FcmPushService(config, pushTokens);
    const spy = jest.spyOn(svc, 'sendToTokens');
    await svc.sendToTokens(['a', 'b'], { title: 'Course créée', body: 'x' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
