import type { Account, Day, Entry } from './journal.interface.js';
import type { Money } from './money.interface.js';

export interface DailyAccrual {
  readonly day: Day;
  /** Closing ledger balance of this value day, as known at capitalization. */
  readonly closing: Money;
  /** Rounded to the account's precision. Zero on non-positive days. */
  readonly accrual: Money;
}

export interface CapitalizationResult {
  readonly accountId: string;
  readonly accruals: readonly DailyAccrual[];
  /** Always equal to the sum of the rounded accruals. */
  readonly total: Money;
  /** The INTEREST_CAPITALIZATION line, or undefined when the total is zero. */
  readonly entry: Entry | undefined;
}

export interface IInterestService {
  /** Compute every day's accrual for the window and book their sum as one credit. */
  capitalize(account: Account, bookedDay: Day, runId: string): CapitalizationResult;
}
