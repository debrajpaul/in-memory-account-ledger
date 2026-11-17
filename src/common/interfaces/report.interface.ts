import type { ErrorCode } from '../errors.js';
import type { AuthTransition, IAuthorizationStore } from './authorization.interface.js';
import type { DailyAccrual } from './interest.interface.js';
import type { Day, Entry, IJournalStore } from './journal.interface.js';
import type { Money } from './money.interface.js';

/**
 * ERROR: refused, nothing booked. EXCEPTION: booked, needs operations.
 * WARNING: processed with a caveat.
 */
export type Severity = 'ERROR' | 'EXCEPTION' | 'WARNING';

/** A business rejection, exception or warning. Recorded, never thrown. */
export interface Incident {
  readonly day: Day;
  readonly severity: Severity;
  readonly code: ErrorCode;
  readonly sourceId: string;
  readonly accountId: string;
  readonly message: string;
}

export interface AccountDayReport {
  readonly accountId: string;
  /** Closing ledger balance of this value day, as known at this day's end of day. */
  readonly closingLedger: Money;
  readonly activeHolds: Money;
  readonly available: Money;
}

export interface CapitalizationReport {
  readonly accountId: string;
  readonly accruals: readonly DailyAccrual[];
  readonly total: Money;
}

export interface DayReport {
  readonly day: Day;
  readonly accounts: readonly AccountDayReport[];
  /** Fee and fee-refund lines booked at this end of day (may be value-dated earlier). */
  readonly feeLines: readonly Entry[];
  readonly authTransitions: readonly AuthTransition[];
  readonly incidents: readonly Incident[];
  /** Present on the last day of the window only. */
  readonly capitalization?: readonly CapitalizationReport[];
}

/** Everything a replay produces: per-day reports, all incidents, and the final stores. */
export interface ReplayResult {
  readonly reports: readonly DayReport[];
  readonly incidents: readonly Incident[];
  readonly journal: IJournalStore;
  readonly authorizationStore: IAuthorizationStore;
}

/** One row of the restated view: each account's closing balance for a value day. */
export interface RestatedRow {
  readonly day: Day;
  readonly balances: readonly { readonly accountId: string; readonly closing: Money }[];
}
