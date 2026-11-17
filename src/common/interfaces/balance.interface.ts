import type { Day, Entry } from './journal.interface.js';

export interface BalanceQuery {
  /** Include entries whose valueDay <= this day. */
  readonly valueDay: Day;
  /**
   * Knowledge cut-off: include only entries booked on or before this processing day.
   * Omit to use everything the journal holds now.
   */
  readonly knownAt?: Day;
  /** Optional extra filter, e.g. "leave out this day's own fee lines". */
  readonly exclude?: (entry: Entry) => boolean;
}
