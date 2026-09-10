import {
  assertEscrowAllowsDispatch,
  assertPinMatches,
  driverEligibleForFoodOffer,
  FOOD_ACCEPT_TIMEOUT_MS,
  FOOD_PAYMENT_TIMEOUT_MS,
  isDeliveryEscrowCollectible,
  isFoodAcceptTimeoutDue,
  isFoodPaymentTimeoutDue,
  isPinTimeoutDue,
  PIN_TIMEOUT_MS,
  resolveCourierSource,
  settleGuaranteedCancel,
  settleMealCancelAfterPickup,
  shouldReturnToSender,
} from './delivery-guarantee.util';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';

describe('delivery-guarantee.util', () => {
  it('interdit le dispatch tant que le séquestre n\'est pas SUCCESS', () => {
    expect(() =>
      assertEscrowAllowsDispatch({ guaranteed: true, escrowReady: false, estimatedPriceCdf: 8000 }),
    ).toThrow(MovaHttpException);
    try {
      assertEscrowAllowsDispatch({ guaranteed: true, escrowReady: false, estimatedPriceCdf: 8000 });
    } catch (e) {
      expect((e as MovaHttpException).code).toBe(MovaErrorCode.DELIVERY_ESCROW_REQUIRED);
      const body = (e as MovaHttpException).getResponse() as { message?: string };
      expect(body.message).toMatch(/payer/i);
      expect(body.message).not.toMatch(/SUCCESS|escrowReady|Dispatch/i);
    }
  });

  it('autorise le dispatch si séquestre prêt', () => {
    expect(() =>
      assertEscrowAllowsDispatch({ guaranteed: true, escrowReady: true, escrowAmountCdf: 8000 }),
    ).not.toThrow();
  });

  it('laisse passer le COD non garanti sans séquestre', () => {
    expect(() =>
      assertEscrowAllowsDispatch({ guaranteed: false, escrowReady: false, estimatedPriceCdf: 8000 }),
    ).not.toThrow();
  });

  it('repas : séquestre collectible seulement après acceptation restaurant', () => {
    expect(
      isDeliveryEscrowCollectible({
        type: 'FOOD',
        status: 'PENDING',
        guaranteed: true,
        escrowReady: false,
      }),
    ).toBe(false);
    expect(
      isDeliveryEscrowCollectible({
        type: 'FOOD',
        status: 'RESTAURANT_CONFIRMED',
        guaranteed: true,
        escrowReady: false,
      }),
    ).toBe(true);
    expect(
      isDeliveryEscrowCollectible({
        type: 'FOOD',
        status: 'RESTAURANT_CONFIRMED',
        guaranteed: true,
        escrowReady: true,
      }),
    ).toBe(false);
  });

  it('colis : séquestre collectible dès la création', () => {
    expect(
      isDeliveryEscrowCollectible({
        type: 'PARCEL',
        status: 'PENDING',
        guaranteed: true,
        escrowReady: false,
      }),
    ).toBe(true);
  });

  it('timeouts repas acceptation 30 min / paiement 15 min', () => {
    expect(FOOD_ACCEPT_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(FOOD_PAYMENT_TIMEOUT_MS).toBe(15 * 60 * 1000);
    const created = new Date('2026-09-10T10:00:00Z');
    expect(isFoodAcceptTimeoutDue({ createdAt: created, now: new Date('2026-09-10T10:29:00Z') })).toBe(false);
    expect(isFoodAcceptTimeoutDue({ createdAt: created, now: new Date('2026-09-10T10:30:00Z') })).toBe(true);
    const accepted = new Date('2026-09-10T10:00:00Z');
    expect(isFoodPaymentTimeoutDue({ acceptedAt: accepted, now: new Date('2026-09-10T10:14:00Z') })).toBe(false);
    expect(isFoodPaymentTimeoutDue({ acceptedAt: accepted, now: new Date('2026-09-10T10:15:00Z') })).toBe(true);
  });

  it('rembourse tout avant enlèvement', () => {
    expect(settleGuaranteedCancel({ phase: 'BEFORE_PICKUP', escrowAmountCdf: 15000, deliveryFeeCdf: 4000 })).toEqual(
      expect.objectContaining({ action: 'REFUND', refundCdf: 15000, courierFeeCdf: 0 }),
    );
  });

  it('après enlèvement : frais livreur + reliquat client', () => {
    expect(settleGuaranteedCancel({ phase: 'AFTER_PICKUP', escrowAmountCdf: 15000, deliveryFeeCdf: 4000 })).toEqual(
      expect.objectContaining({ action: 'PARTIAL', courierFeeCdf: 4000, refundCdf: 11000 }),
    );
  });

  it('timeout PIN : gel, pas de versement', () => {
    expect(settleGuaranteedCancel({ phase: 'PIN_TIMEOUT', escrowAmountCdf: 15000, deliveryFeeCdf: 4000 }).action).toBe(
      'FREEZE',
    );
  });

  it('PIN : correspondance stricte, idempotente si déjà bon', () => {
    expect(assertPinMatches('4821', '4821')).toBe(true);
    expect(assertPinMatches('4821', '0000')).toBe(false);
    expect(assertPinMatches('', '4821')).toBe(false);
  });

  it('timeout PIN repas 2h / colis 24h', () => {
    expect(PIN_TIMEOUT_MS.FOOD).toBe(2 * 60 * 60 * 1000);
    expect(PIN_TIMEOUT_MS.PARCEL).toBe(24 * 60 * 60 * 1000);
    const started = new Date('2026-09-05T10:00:00Z');
    expect(
      isPinTimeoutDue({
        type: 'FOOD',
        status: 'IN_TRANSIT',
        inTransitSince: started,
        now: new Date('2026-09-05T12:00:00Z'),
      }),
    ).toBe(true);
    expect(
      isPinTimeoutDue({
        type: 'PARCEL',
        status: 'IN_TRANSIT',
        inTransitSince: started,
        now: new Date('2026-09-05T12:00:00Z'),
      }),
    ).toBe(false);
  });

  it('après enlèvement repas : resto déjà payé, last-mile ne bloque pas sa part', () => {
    expect(
      settleGuaranteedCancel({
        phase: 'AFTER_PICKUP',
        escrowAmountCdf: 15000,
        deliveryFeeCdf: 4000,
        restaurantAlreadyCreditedCdf: 11000,
      }),
    ).toEqual(expect.objectContaining({ action: 'PARTIAL', courierFeeCdf: 4000, refundCdf: 0 }));
  });

  it('flotte OWN : seul un livreur interne voit l\'offre ; PLATFORM accepte les externes', () => {
    expect(driverEligibleForFoodOffer({ courierMode: 'OWN', driverIsRestaurantFleet: false })).toBe(false);
    expect(driverEligibleForFoodOffer({ courierMode: 'OWN', driverIsRestaurantFleet: true })).toBe(true);
    expect(driverEligibleForFoodOffer({ courierMode: 'PLATFORM', driverIsRestaurantFleet: false })).toBe(true);
    expect(driverEligibleForFoodOffer({ courierMode: 'HYBRID', driverIsRestaurantFleet: false })).toBe(true);
    expect(resolveCourierSource({ driverIsRestaurantFleet: true })).toBe('RESTAURANT');
    expect(resolveCourierSource({ restaurantCourierMode: 'PLATFORM', driverIsRestaurantFleet: false })).toBe('PLATFORM');
  });

  it('annulation repas après enlèvement : resto conserve sa part, reliquat client', () => {
    expect(
      settleMealCancelAfterPickup({
        escrowAmountCdf: 15000,
        restaurantAlreadyCreditedCdf: 10000,
        deliveryFeeCdf: 4000,
      }),
    ).toEqual(expect.objectContaining({ action: 'PARTIAL', courierFeeCdf: 4000, refundCdf: 1000 }));
    expect(
      settleGuaranteedCancel({
        phase: 'AFTER_PICKUP',
        escrowAmountCdf: 15000,
        deliveryFeeCdf: 4000,
        restaurantAlreadyCreditedCdf: 14000,
      }),
    ).toEqual(expect.objectContaining({ action: 'PARTIAL', courierFeeCdf: 1000, refundCdf: 0 }));
  });

  it('retour expéditeur après 3 tentatives + 30 min', () => {
    const first = new Date('2026-09-05T10:00:00Z');
    expect(shouldReturnToSender({ unreachableAttempts: 2, firstUnreachableAt: first })).toBe(false);
    expect(
      shouldReturnToSender({
        unreachableAttempts: 3,
        firstUnreachableAt: first,
        now: new Date('2026-09-05T10:29:00Z'),
      }),
    ).toBe(false);
    expect(
      shouldReturnToSender({
        unreachableAttempts: 3,
        firstUnreachableAt: first,
        now: new Date('2026-09-05T10:31:00Z'),
      }),
    ).toBe(true);
  });
});
