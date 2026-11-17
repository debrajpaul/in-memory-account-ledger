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
  const p = precisionOf(currency);
  const cleaned = text.replace(/,/g, '').trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new LedgerError(`Not a decimal amount: "${text}"`, ErrorCode.INVALID_AMOUNT);
  }
  const [, sign, whole = '0', frac = ''] = match;
  if (frac.length > p) {
    throw new LedgerError(
      `${currency} allows ${p} decimals, got "${text}"`,
      ErrorCode.INVALID_AMOUNT,
    );
  }
  const minor = BigInt(whole + frac.padEnd(p, '0'));
  return money(currency, sign ? -minor : minor);
}

export function formatMoney(m: Money): string {
  const p = precisionOf(m.currency);
  const neg = m.minor < 0n;
  const abs = (neg ? -m.minor : m.minor).toString().padStart(p + 1, '0');
  const whole = abs.slice(0, abs.length - p);
  const frac = abs.slice(abs.length - p);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${m.currency} ${neg ? '-' : ''}${grouped}.${frac}`;
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new LedgerError(
      `Currency mismatch: ${a.currency} vs ${b.currency}`,
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
  const neg = numerator < 0n;
  const n = neg ? -numerator : numerator;
  const q = n / denominator;
  const r = n % denominator;
  const twice = r * 2n;
  let result = q;
  if (twice > denominator || (twice === denominator && q % 2n === 1n)) result = q + 1n;
  return neg ? -result : result;
}

/** amount * rate, rounded half-even to the amount's own precision. */
export function applyRate(amount: Money, rate: Rate): Money {
  return money(amount.currency, divRoundHalfEven(amount.minor * rate.numerator, rate.denominator));
}
