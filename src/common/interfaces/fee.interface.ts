import type { ErrorCode } from '../errors.js';
import type { Account, Day, Entry } from './journal.interface.js';

export interface FeeRunError {
  readonly code: ErrorCode;
  readonly message: string;
  /** The value day the error is about. */
  readonly day: Day;
}

export interface FeeRunResult {
  /** OVERDRAFT_FEE and OVERDRAFT_FEE_REFUND lines booked by this run. */
  readonly booked: readonly Entry[];
  readonly errors: readonly FeeRunError[];
}

export interface IFeeService {
  /** End-of-day fee reconciliation for processing day `processingDay`. Idempotent. */
  reconcile(account: Account, processingDay: Day, runId: string): FeeRunResult;
  /** The fee line for value day `day` that has not been refunded, if any. */
  activeFee(accountId: string, day: Day): Entry | undefined;
}
