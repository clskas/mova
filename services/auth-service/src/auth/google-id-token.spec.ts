import { audienceAllowed, collectGoogleAudiences, verifyGoogleIdToken } from './google-id-token';

const WEB_AUD = 'web-client.apps.googleusercontent.com';
const ANDROID_AUD = 'android-client.apps.googleusercontent.com';
const BAD_AUD = 'evil-client.apps.googleusercontent.com';

function mockClient(payload: { sub?: string; email?: string; email_verified?: boolean; aud?: string }) {
  return {
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => payload,
    }),
  };
}

describe('google-id-token', () => {
  it('collects configured audiences and ignores blanks', () => {
    expect(
      collectGoogleAudiences({
        GOOGLE_CLIENT_ID: WEB_AUD,
        GOOGLE_ANDROID_CLIENT_ID: ANDROID_AUD,
        GOOGLE_IOS_CLIENT_ID: '  ',
        GOOGLE_OAUTH_CLIENT_ID: WEB_AUD,
      }),
    ).toEqual([WEB_AUD, ANDROID_AUD]);
  });

  it('rejects a token whose audience is not allow-listed', async () => {
    const client = mockClient({ sub: 'gid-1', email: 'a@b.com', aud: BAD_AUD });
    await expect(verifyGoogleIdToken('token', [WEB_AUD], client)).rejects.toThrow('GOOGLE_AUDIENCE_MISMATCH');
    expect(audienceAllowed(BAD_AUD, [WEB_AUD, ANDROID_AUD])).toBe(false);
  });

  it('accepts a token issued for the web or Android client id', async () => {
    const client = mockClient({
      sub: 'gid-42',
      email: 'marie@gmail.com',
      email_verified: true,
      aud: ANDROID_AUD,
    });
    const identity = await verifyGoogleIdToken('token', [WEB_AUD, ANDROID_AUD], client);
    expect(identity.googleId).toBe('gid-42');
    expect(identity.email).toBe('marie@gmail.com');
    expect(identity.emailVerified).toBe(true);
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'token',
      audience: [WEB_AUD, ANDROID_AUD],
    });
  });

  it('rejects when no audience is configured', async () => {
    await expect(verifyGoogleIdToken('token', [], mockClient({ sub: 'x', aud: WEB_AUD }))).rejects.toThrow(
      'GOOGLE_AUDIENCE_NOT_CONFIGURED',
    );
  });
});
