import { UserStatus } from './enums';

export type MovaJwtPayload = {
  sub: string;
  phone?: string;
  role: string;
  status?: UserStatus | string;
  /** Present on tokens issued after logout/denylist support. Old 7d tokens omit it. */
  jti?: string;
  /** Phone account without a local PIN (seed demo phones omit this). */
  needsPinSetup?: boolean;
};

/** Refuse l'accès aux comptes suspendus (JWT ou login). */
export function assertActiveUserStatus(status?: string): void {
  if (status === UserStatus.SUSPENDED) {
    throw new Error('USER_SUSPENDED');
  }
}
