import type { Currency } from '../currency.js';
import type { Money } from './money.interface.js';

/** A processing or value day inside the window (Day 1 = 1). */
export type Day = number;

export type EntryKind =
  | 'CREDIT'
  | 'DEBIT'
  | 'SETTLEMENT'
  | 'REVERSAL'
  | 'OVERDRAFT_FEE'
  | 'OVERDRAFT_FEE_REFUND'
  | 'INTEREST_CAPITALIZATION';

/**
 * One immutable journal line. `amount.minor` is signed: credits positive, debits negative.
 *
 * Two dates, deliberately:
 *  - bookedDay: the processing day the ledger learned about it (knowledge time)
 *  - valueDay:  the day it counts for balances, fees and interest (economic time)
 */
export interface Entry {
  readonly seq: number;
  readonly entryId: string;
  readonly accountId: string;
  readonly kind: EntryKind;
  readonly amount: Money;
  readonly valueDay: Day;
  readonly bookedDay: Day;
  /** Event that caused this line (E1..E10), or the end-of-day run that derived it (EOD-5). */
  readonly sourceId: string;
  /** REVERSAL and OVERDRAFT_FEE_REFUND: the entry being compensated. */
  readonly compensates?: string;
  /** OVERDRAFT_FEE and OVERDRAFT_FEE_REFUND: the value day the fee belongs to. */
  readonly feeForDay?: Day;
  readonly note?: string;
}

/** What a caller supplies; the store assigns `seq` and `entryId`. */
export type NewEntry = Omit<Entry, 'seq' | 'entryId'>;

export interface Account {
  readonly accountId: string;
  readonly currency: Currency;
  readonly opening: Money;
}

/**
 * Append-only journal contract. There is deliberately no update or delete:
 * a correction is always a new compensating line.
 */
export interface IJournalStore {
  append(input: NewEntry): Entry;
  get(entryId: string): Entry;
  find(predicate: (entry: Entry) => boolean): Entry | undefined;
  entries(): readonly Entry[];
  forAccount(accountId: string): readonly Entry[];
  readonly size: number;
}
