import { precisionOf, type Currency } from '../common/currency.js';
import { ErrorCode, LedgerError } from '../common/errors.js';
import type { Money, Rate } from '../common/interfaces/money.interface.js';

export function money(currency: Currency, minor: bigint): Money {
  return { currency, minor };
}

/**
 * Parse a decimal string into minor units. Rejects anything with more decimals than the
 * currency allows: we never silently round an input amount.
 */
export function parseMoney(currency: Currency, text: string): Money {
  const precision = precisionOf(currency);
  const withoutSeparators = text.replace(/,/g, '').trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(withoutSeparators);
  if (!match) {
    throw new LedgerError(`Not a decimal amount: "${text}"`, ErrorCode.INVALID_AMOUNT);
  }
  const [, minusSign, wholePart = '0', fractionPart = ''] = match;
  if (fractionPart.length > precision) {
    throw new LedgerError(
      `${currency} allows ${precision} decimals, got "${text}"`,
      ErrorCode.INVALID_AMOUNT,
    );
  }
  const minorUnits = BigInt(wholePart + fractionPart.padEnd(precision, '0'));
  return money(currency, minusSign ? -minorUnits : minorUnits);
}

export function formatMoney(amount: Money): string {
  const precision = precisionOf(amount.currency);
  const isNegative = amount.minor < 0n;
  const absoluteDigits = (isNegative ? -amount.minor : amount.minor)
    .toString()
    .padStart(precision + 1, '0');
  const wholeDigits = absoluteDigits.slice(0, absoluteDigits.length - precision);
  const fractionDigits = absoluteDigits.slice(absoluteDigits.length - precision);
  const groupedWhole = wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount.currency} ${isNegative ? '-' : ''}${groupedWhole}.${fractionDigits}`;
}

export function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new LedgerError(
      `Currency mismatch: ${left.currency} vs ${right.currency}`,
      ErrorCode.CURRENCY_MISMATCH,
    );
  }
}

/**
 * Divide two bigints and round half-to-even (banker's rounding).
 * The single rounding function: every derived amount goes through it. Exact halves go to the
 * even neighbour, so repeated daily rounding has no systematic upward drift.
 */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');
  if (denominator < 0n) return divRoundHalfEven(-numerator, -denominator);
  const isNegative = numerator < 0n;
  const absoluteNumerator = isNegative ? -numerator : numerator;
  const quotient = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;
  const twiceRemainder = remainder * 2n;
  const isAboveHalf = twiceRemainder > denominator;
  const isExactHalfWithOddQuotient = twiceRemainder === denominator && quotient % 2n === 1n;
  const rounded = isAboveHalf || isExactHalfWithOddQuotient ? quotient + 1n : quotient;
  return isNegative ? -rounded : rounded;
}

/** amount * rate, rounded half-even to the amount's own precision. */
export function applyRate(amount: Money, rate: Rate): Money {
  return money(amount.currency, divRoundHalfEven(amount.minor * rate.numerator, rate.denominator));
}
