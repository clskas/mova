import { AsyncLocalStorage } from 'async_hooks';

type Store = { entityId?: string };

export const partnerEntityAls = new AsyncLocalStorage<Store>();

export function getPartnerEntityId(): string | undefined {
  return partnerEntityAls.getStore()?.entityId?.trim() || undefined;
}

export function runWithPartnerEntity<T>(entityId: string | undefined, fn: () => T): T {
  return partnerEntityAls.run({ entityId }, fn);
}
