import type { Currency } from '../currency.js';

/**
 * Money is a signed bigint in the currency's minor unit (AED: 1/100, BHD: 1/1000).
 * No floating point anywhere in the money path.
 */
export interface Money {
  readonly currency: Currency;
  /** Signed amount in minor units. */
  readonly minor: bigint;
}

/** A rate expressed as an exact fraction, e.g. 0.04% = 4 / 10_000. */
export interface Rate {
  readonly numerator: bigint;
  readonly denominator: bigint;
}
