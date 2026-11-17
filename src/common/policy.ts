import type { Currency } from './currency.js';
import type { Money, Rate } from './interfaces/money.interface.js';

/**
 * Every business constant lives here and is explained in NUMBERS.md.
 * Nothing else in src/ may hard-code a fee, a rate or a window bound.
 */
export const POLICY = {
  /** The window is Day 1..Day 6 inclusive. */
  window: { firstDay: 1, lastDay: 6 },

  /**
   * Overdraft fee per account per value day whose closing balance is negative.
   * Defined in AED only: an account in another currency that goes negative raises
   * FEE_CURRENCY_UNSUPPORTED instead of an invented FX conversion.
   */
  overdraftFee: { AED: { currency: 'AED', minor: 2500n } } as Partial<Record<Currency, Money>>,

  /** 0.04% per day = 4 / 10,000, as an exact fraction. Positive closing balances only. */
  dailyInterestRate: { numerator: 4n, denominator: 10_000n } satisfies Rate,
} as const;
