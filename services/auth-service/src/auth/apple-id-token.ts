import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';

export type AppleIdentity = {
  appleId: string;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
  audience: string;
};

/** Native iOS bundle IDs — identity token `aud` for Sign in with Apple. */
export const PRODUCTION_APPLE_CLIENT_IDS = [
  'cd.mova.mova',
  'cd.mova.mova.driver',
] as const;

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function splitClientIds(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

export function collectAppleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const ids = [
    ...PRODUCTION_APPLE_CLIENT_IDS,
    ...splitClientIds(env.APPLE_CLIENT_ID),
    ...splitClientIds(env.APPLE_BUNDLE_IDS),
    ...splitClientIds(env.APPLE_SIGN_IN_CLIENT_IDS),
  ];
  return [...new Set(ids)];
}

export function appleAudienceAllowed(
  aud: string | string[] | undefined,
  allowed: string[],
): boolean {
  if (!allowed.length) return false;
  const values = Array.isArray(aud) ? aud : aud ? [aud] : [];
  return values.some((value) => allowed.includes(value));
}

export type AppleNameHint = {
  givenName?: string | null;
  familyName?: string | null;
};

/**
 * Verify Apple identity token (ES256) against Apple JWKS.
 * Email is only present on the first authorization for a given Apple ID.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  audiences: string[],
  nameHint?: AppleNameHint,
): Promise<AppleIdentity> {
  const trimmed = String(identityToken ?? '').trim();
  if (!trimmed) {
    throw new Error('APPLE_ID_TOKEN_MISSING');
  }
  if (!audiences.length) {
    throw new Error('APPLE_AUDIENCE_NOT_CONFIGURED');
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(trimmed, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new Error('APPLE_ID_TOKEN_INVALID');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    throw new Error('APPLE_ID_TOKEN_INVALID');
  }
  if (!appleAudienceAllowed(payload.aud as string | string[] | undefined, audiences)) {
    throw new Error('APPLE_AUDIENCE_MISMATCH');
  }

  const emailRaw = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const email = emailRaw.includes('@') ? emailRaw : null;
  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true' ||
    (email?.endsWith('@privaterelay.appleid.com') ?? false);

  return {
    appleId: sub,
    email,
    emailVerified: email ? emailVerified : false,
    givenName: nameHint?.givenName?.trim() || null,
    familyName: nameHint?.familyName?.trim() || null,
    audience: Array.isArray(payload.aud)
      ? String(payload.aud[0] ?? '')
      : String(payload.aud ?? ''),
  };
}

@Injectable()
export class AppleTokenVerifier {
  constructor(private config: ConfigService) {}

  allowedAudiences(): string[] {
    return collectAppleAudiences({
      APPLE_CLIENT_ID: this.config.get<string>('APPLE_CLIENT_ID'),
      APPLE_BUNDLE_IDS: this.config.get<string>('APPLE_BUNDLE_IDS'),
      APPLE_SIGN_IN_CLIENT_IDS: this.config.get<string>('APPLE_SIGN_IN_CLIENT_IDS'),
    });
  }

  async verify(identityToken: string, nameHint?: AppleNameHint): Promise<AppleIdentity> {
    const audiences = this.allowedAudiences();
    try {
      return await verifyAppleIdentityToken(identityToken, audiences, nameHint);
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'APPLE_AUDIENCE_NOT_CONFIGURED') {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_INVALID_APPLE,
          HttpStatus.SERVICE_UNAVAILABLE,
          'Connexion Apple non configurée. Contactez le support SENGA.',
        );
      }
      throw new MovaHttpException(
        MovaErrorCode.AUTH_INVALID_APPLE,
        HttpStatus.UNAUTHORIZED,
        'Jeton Apple invalide ou destiné à une autre application.',
      );
    }
  }
}
