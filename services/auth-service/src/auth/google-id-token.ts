import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';

export type GoogleIdentity = {
  googleId: string;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
  audience: string;
};

export type GoogleTicketClient = {
  verifyIdToken: (opts: { idToken: string; audience: string | string[] }) => Promise<{
    getPayload: () => TokenPayload | undefined;
  }>;
};

export function collectGoogleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const ids = [
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_ANDROID_CLIENT_ID,
    env.GOOGLE_IOS_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_ID,
  ];
  return [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
}

export function audienceAllowed(aud: string | string[] | undefined, allowed: string[]): boolean {
  if (!allowed.length) return false;
  const values = Array.isArray(aud) ? aud : aud ? [aud] : [];
  return values.some((value) => allowed.includes(value));
}

export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string[],
  client: GoogleTicketClient = new OAuth2Client(),
): Promise<GoogleIdentity> {
  const trimmed = String(idToken ?? '').trim();
  if (!trimmed) {
    throw new Error('GOOGLE_ID_TOKEN_MISSING');
  }
  if (!audiences.length) {
    throw new Error('GOOGLE_AUDIENCE_NOT_CONFIGURED');
  }
  const ticket = await client.verifyIdToken({
    idToken: trimmed,
    audience: audiences,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error('GOOGLE_ID_TOKEN_INVALID');
  }
  if (!audienceAllowed(payload.aud, audiences)) {
    throw new Error('GOOGLE_AUDIENCE_MISMATCH');
  }
  const email = payload.email?.trim().toLowerCase() || null;
  return {
    googleId: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    givenName: payload.given_name?.trim() || null,
    familyName: payload.family_name?.trim() || null,
    picture: payload.picture?.trim() || null,
    audience: Array.isArray(payload.aud) ? payload.aud[0] ?? '' : payload.aud ?? '',
  };
}

@Injectable()
export class GoogleTokenVerifier {
  constructor(private config: ConfigService) {}

  allowedAudiences(): string[] {
    return collectGoogleAudiences({
      GOOGLE_CLIENT_ID: this.config.get<string>('GOOGLE_CLIENT_ID'),
      GOOGLE_ANDROID_CLIENT_ID: this.config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      GOOGLE_IOS_CLIENT_ID: this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      GOOGLE_OAUTH_CLIENT_ID: this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID'),
    });
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const audiences = this.allowedAudiences();
    try {
      return await verifyGoogleIdToken(idToken, audiences);
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'GOOGLE_AUDIENCE_NOT_CONFIGURED') {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_INVALID_GOOGLE,
          HttpStatus.SERVICE_UNAVAILABLE,
          'Connexion Google non configurée. Contactez le support SENGA.',
        );
      }
      throw new MovaHttpException(
        MovaErrorCode.AUTH_INVALID_GOOGLE,
        HttpStatus.UNAUTHORIZED,
        'Jeton Google invalide ou destiné à une autre application.',
      );
    }
  }
}
