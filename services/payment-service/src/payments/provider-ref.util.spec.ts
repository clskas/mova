import {
  expandProviderRefKeys,
  extractAggregatorOutcome,
  extractAggregatorProviderRef,
} from './provider-ref.util';

describe('expandProviderRefKeys', () => {
  it('matches raw SerdiPay transactionId to stored sp_ prefix', () => {
    const keys = expandProviderRefKeys('SD260829CPHOG');
    expect(keys).toContain('SD260829CPHOG');
    expect(keys).toContain('sp_SD260829CPHOG');
  });

  it('strips stored sp_ prefix for the reverse lookup', () => {
    const keys = expandProviderRefKeys('sp_SD260829CPHOG');
    expect(keys).toEqual(expect.arrayContaining(['sp_SD260829CPHOG', 'SD260829CPHOG']));
    expect(keys).not.toContain('sp_sp_SD260829CPHOG');
  });
});

describe('extractAggregatorProviderRef / outcome', () => {
  const techPayload = {
    status: 200,
    payment: {
      status: 'success',
      sessionId: '17879852622884',
      sessionStatus: 3,
      transactionId: 'SD260829CPHOG',
    },
  };

  it('reads transactionId from nested payment (PDF / tech callback)', () => {
    expect(extractAggregatorProviderRef(techPayload)).toBe('SD260829CPHOG');
    expect(extractAggregatorOutcome(techPayload)).toBe('COMPLETED');
  });

  it('reads flat top-level fields', () => {
    const flat = {
      status: 'success',
      sessionId: '17879852622884',
      sessionStatus: 3,
      transactionId: 'SD260829CPHOG',
    };
    expect(extractAggregatorProviderRef(flat)).toBe('SD260829CPHOG');
    expect(extractAggregatorOutcome(flat)).toBe('COMPLETED');
  });

  it('prefers transactionId over sessionId', () => {
    expect(
      extractAggregatorProviderRef({
        sessionId: '17879852622884',
        transactionId: 'SD260829CPHOG',
      }),
    ).toBe('SD260829CPHOG');
  });

  it('treats sessionStatus 3 as success when status text is missing', () => {
    expect(
      extractAggregatorOutcome({
        payment: { sessionStatus: 3, transactionId: 'SD260829CPHOG' },
      }),
    ).toBe('COMPLETED');
  });
});
