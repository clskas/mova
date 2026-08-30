import { RedisService } from './redis.module';

export const JWT_DENY_JTI_PREFIX = 'auth:jwt:deny:';
export const JWT_DENY_USER_PREFIX = 'auth:jwt:deny-user:';
/** Match default JWT_EXPIRES_IN=7d so a revoked token cannot outlive the list. */
export const JWT_DENY_TTL_SEC = 7 * 24 * 60 * 60;

export async function denyJwtJti(redis: RedisService, jti?: string | null): Promise<void> {
  const id = jti?.trim();
  if (!id) return;
  await redis.client.set(`${JWT_DENY_JTI_PREFIX}${id}`, '1', 'EX', JWT_DENY_TTL_SEC);
}

export async function denyJwtUser(redis: RedisService, userId?: string | null): Promise<void> {
  const id = userId?.trim();
  if (!id) return;
  await redis.client.set(`${JWT_DENY_USER_PREFIX}${id}`, '1', 'EX', JWT_DENY_TTL_SEC);
}

/**
 * Returns true if this token or user is revoked.
 * Redis down → false (fail-open). Callers that move money still revalidate the user.
 */
export async function isJwtDenied(
  redis: RedisService | undefined,
  payload: { jti?: string; sub?: string },
): Promise<boolean> {
  if (!redis?.client) return false;
  try {
    if (payload.jti) {
      const denied = await redis.client.get(`${JWT_DENY_JTI_PREFIX}${payload.jti}`);
      if (denied) return true;
    }
    if (payload.sub) {
      const denied = await redis.client.get(`${JWT_DENY_USER_PREFIX}${payload.sub}`);
      if (denied) return true;
    }
    return false;
  } catch {
    return false;
  }
}
