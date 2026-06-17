import { UserStatus } from './enums';

export type MovaJwtPayload = {
  sub: string;
  phone?: string;
  role: string;
  status?: UserStatus | string;
};

/** Refuse l'accès aux comptes suspendus (JWT ou login). */
export function assertActiveUserStatus(status?: string): void {
  if (status === UserStatus.SUSPENDED) {
    throw new Error('USER_SUSPENDED');
  }
}
