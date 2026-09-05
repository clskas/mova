import { HttpStatus } from '@nestjs/common';
import { PIN_SIX_DIGITS_FR, toPublicHttpMessage } from './http-exception.filter';
import { MOVA_ERROR_MESSAGES, MovaErrorCode } from './mova-error-codes';

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
});
