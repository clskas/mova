import { UserStatus } from './enums';

export type MovaJwtPayload = {
  sub: string;
  phone?: string;
  email?: string;
  role: string;
  status?: UserStatus | string;
  /** Present on tokens issued after logout/denylist support. Old 7d tokens omit it. */
  jti?: string;
  /** Account without a local PIN (seed demo phones omit this). True for Google-only too. */
  needsPinSetup?: boolean;
  /** CITY_ADMIN only: service-area city name (e.g. "Kinshasa"). */
  managedCity?: string;
  /** Optional AdminPermission overrides (empty/omit = role defaults). */
  permissions?: string[];
};

/** Refuse l'accès aux comptes suspendus (JWT ou login). */
export function assertActiveUserStatus(status?: string): void {
  if (status === UserStatus.SUSPENDED) {
    throw new Error('USER_SUSPENDED');
  }
}
