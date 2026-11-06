import { cleanScannedMenu, receiptVerdict } from './ai-vision.util';

describe('receiptVerdict', () => {
  const ok = { isReceipt: true, readable: true, totalCdf: 25000 };

  it('accepts a receipt close to the declared amount and within budget', () => {
    expect(receiptVerdict(ok, 25500, 30000).verdict).toBe('OK');
  });

  it('flags a gap with the declared amount or a total over budget', () => {
    expect(receiptVerdict(ok, 20000, 30000).verdict).toBe('ECART');
    expect(receiptVerdict(ok, 25000, 20000).verdict).toBe('ECART');
  });

  it('asks to check an unreadable receipt or a total not in CDF', () => {
    expect(receiptVerdict(null, 1000, 2000).verdict).toBe('A_VERIFIER');
    expect(receiptVerdict({ isReceipt: true, readable: true, totalCdf: null }, 1000, 2000).verdict).toBe('A_VERIFIER');
  });
});

describe('cleanScannedMenu', () => {
  it('keeps named items, rounds prices and drops duplicates or junk', () => {
    const items = cleanScannedMenu({
      items: [
        { name: '  Poulet   mayo ', priceCdf: 15000.4, priceUsd: null, category: 'Plats', description: '' },
        { name: 'poulet mayo', priceCdf: 1, priceUsd: null, category: null, description: null },
        { name: 'x', priceCdf: 100, priceUsd: null, category: null, description: null },
        { name: 'Fanta', priceCdf: null, priceUsd: 1.5, category: 'Boissons', description: null },
        'junk',
      ],
    });
    expect(items).toEqual([
      { name: 'Poulet mayo', unitPriceCdf: 15000, priceUsd: null, category: 'Plats', description: null },
      { name: 'Fanta', unitPriceCdf: null, priceUsd: 1.5, category: 'Boissons', description: null },
    ]);
    expect(cleanScannedMenu(null)).toEqual([]);
  });
});
