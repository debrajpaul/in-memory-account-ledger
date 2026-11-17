/**
 * Stable error codes. Every rejection or exception the engine records uses one of these.
 * New codes are added alongside the rule that needs them.
 */
export const ErrorCode = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  UNKNOWN_ENTRY: 'UNKNOWN_ENTRY',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Thrown for programmer errors and invariant violations (never for business rejections). */
export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}
