import type { Currency } from './currency.js';
import type { Money } from './interfaces/money.interface.js';

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
} as const;
