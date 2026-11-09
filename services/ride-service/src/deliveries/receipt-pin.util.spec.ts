import { MAX_RECEIPT_PIN_ATTEMPTS, receiptPinLocked, withoutReceiptPin } from './delivery-guarantee.util';

describe('receipt PIN guards', () => {
  it('locks the courier out after too many wrong codes', () => {
    expect(receiptPinLocked(0)).toBe(false);
    expect(receiptPinLocked(null)).toBe(false);
    expect(receiptPinLocked(MAX_RECEIPT_PIN_ATTEMPTS - 1)).toBe(false);
    expect(receiptPinLocked(MAX_RECEIPT_PIN_ATTEMPTS)).toBe(true);
  });

  it('removes the customer code from what the courier sees', () => {
    const out = withoutReceiptPin({ id: 'd1', deliveryPin: '1234', price: 5 });
    expect(out).toEqual({ id: 'd1', deliveryPin: null, price: 5 });
    expect(withoutReceiptPin({ id: 'e1', completionPin: '9876' }).completionPin).toBeNull();
    expect(withoutReceiptPin({ id: 'x' })).toEqual({ id: 'x' });
  });
});
