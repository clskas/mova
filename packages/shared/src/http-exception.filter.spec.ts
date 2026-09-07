import { HttpStatus } from '@nestjs/common';
import { PIN_SIX_DIGITS_FR, toPublicHttpMessage } from './http-exception.filter';
import { MOVA_ERROR_MESSAGES, MovaErrorCode } from './mova-error-codes';
import { SERDIPAY_B2C_CHANNEL_DISABLED_FR, SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR } from './serdipay';

describe('toPublicHttpMessage', () => {
  it('maps class-validator PIN regex/length English to French', () => {
    const raw =
      'pin must match /^\\d{6}$/ regular expression. pin must be longer than or equal to 6 characters';
    expect(toPublicHttpMessage(raw, HttpStatus.BAD_REQUEST)).toBe(PIN_SIX_DIGITS_FR);
  });

  it('maps confirmPin class-validator English to the same French copy', () => {
    expect(
      toPublicHttpMessage(
        'confirmPin must match /^\\d{6}$/ regular expression',
        HttpStatus.BAD_REQUEST,
      ),
    ).toBe(PIN_SIX_DIGITS_FR);
  });

  it('hides other class-validator English as a generic validation error', () => {
    expect(
      toPublicHttpMessage('phone must match /^\\+243/ regular expression', HttpStatus.BAD_REQUEST),
    ).toBe(MOVA_ERROR_MESSAGES[MovaErrorCode.VALIDATION_ERROR]);
  });

  it('keeps an already-friendly French PIN message', () => {
    expect(toPublicHttpMessage(PIN_SIX_DIGITS_FR, HttpStatus.BAD_REQUEST)).toBe(PIN_SIX_DIGITS_FR);
  });

  it('maps SerdiPay/AfriMomo channel0 English to French (never leaks channel0)', () => {
    expect(
      toPublicHttpMessage(
        'Payment Failed, Merchant is not allowed to use this channel0',
        HttpStatus.BAD_REQUEST,
      ),
    ).toBe(SERDIPAY_B2C_CHANNEL_DISABLED_FR);
    expect(
      toPublicHttpMessage(
        'Payment Failed, Merchant is not allowed to use this channel0',
        HttpStatus.BAD_REQUEST,
      ),
    ).not.toMatch(/channel0|Payment Failed/i);
  });

  it('maps SerdiPay merchant-float English to French (never leaks Balance is low)', () => {
    expect(toPublicHttpMessage('Your Balance is low', HttpStatus.BAD_REQUEST)).toBe(
      SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR,
    );
    expect(toPublicHttpMessage('Your Balance is low', HttpStatus.BAD_REQUEST)).not.toMatch(
      /Your Balance is low|Balance is low/i,
    );
  });

  it('hides Prisma / field-name / geo JSON internals', () => {
    expect(toPublicHttpMessage('Unique constraint failed on the fields: (`phone`) P2002', 409)).toBe(
      MOVA_ERROR_MESSAGES[MovaErrorCode.VALIDATION_ERROR],
    );
    expect(toPublicHttpMessage('escrowReady must be a boolean', HttpStatus.BAD_REQUEST)).toBe(
      MOVA_ERROR_MESSAGES[MovaErrorCode.VALIDATION_ERROR],
    );
    expect(
      toPublicHttpMessage('{"message":"Not Authorized - Invalid Token","features":[]}', HttpStatus.BAD_GATEWAY),
    ).toBe('Service temporairement indisponible. Réessayez dans quelques minutes.');
    expect(toPublicHttpMessage('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)).toBe(
      MOVA_ERROR_MESSAGES[MovaErrorCode.INTERNAL_ERROR],
    );
    expect(toPublicHttpMessage('MOVA_DEL_004', HttpStatus.CONFLICT)).toBe(
      MOVA_ERROR_MESSAGES[MovaErrorCode.VALIDATION_ERROR],
    );
  });
});
