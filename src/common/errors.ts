/**
 * Stable error codes. Every rejection or exception the engine records uses one of these.
 * New codes are added alongside the rule that needs them.
 */
export const ErrorCode = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  UNKNOWN_ENTRY: 'UNKNOWN_ENTRY',
  ALREADY_REVERSED: 'ALREADY_REVERSED',
  REVERSAL_VALUE_DATE_MISMATCH: 'REVERSAL_VALUE_DATE_MISMATCH',
  DUPLICATE_AUTHORIZATION: 'DUPLICATE_AUTHORIZATION',
  INSUFFICIENT_AVAILABLE_BALANCE: 'INSUFFICIENT_AVAILABLE_BALANCE',
  SETTLEMENT_WITHOUT_AUTHORIZATION: 'SETTLEMENT_WITHOUT_AUTHORIZATION',
  SETTLEMENT_ON_INACTIVE_AUTHORIZATION: 'SETTLEMENT_ON_INACTIVE_AUTHORIZATION',
  SETTLEMENT_EXCEEDS_HOLD: 'SETTLEMENT_EXCEEDS_HOLD',
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
