/** ISO 4217 minor-unit precision per supported currency. */
export const CURRENCY_PRECISION = {
  AED: 2,
  BHD: 3,
} as const;

export type Currency = keyof typeof CURRENCY_PRECISION;

export function precisionOf(currency: Currency): number {
  return CURRENCY_PRECISION[currency];
}
