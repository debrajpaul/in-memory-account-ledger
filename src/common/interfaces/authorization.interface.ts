import type { Currency } from '../currency.js';
import type { ErrorCode } from '../errors.js';
import type { Account, Day, Entry } from './journal.interface.js';
import type { Money } from './money.interface.js';

export type AuthState = 'APPROVED' | 'DECLINED' | 'SETTLED';

/**
 * One step in an authorization's life. Authorizations are not journal lines (a hold never
 * moves ledger balance), but their lifecycle is still append-only: each change is a new
 * transition and the current state is the latest one.
 */
export interface AuthTransition {
  readonly authId: string;
  readonly accountId: string;
  readonly state: AuthState;
  readonly day: Day;
  readonly sourceId: string;
  /** Requested hold amount. */
  readonly holdAmount: Money;
  /** APPROVED / DECLINED: available balance (ledger - active holds) before this hold. */
  readonly availableBefore?: Money;
  /** SETTLED: amount actually settled. */
  readonly settledAmount?: Money;
  /** SETTLED: part of the hold released without being charged. */
  readonly releasedAmount?: Money;
  /** DECLINED: why. */
  readonly reason?: ErrorCode;
}

export interface IAuthorizationStore {
  record(transition: AuthTransition): AuthTransition;
  current(authId: string): AuthTransition | undefined;
  history(authId?: string): readonly AuthTransition[];
  /** Sum of holds whose latest state is APPROVED. */
  activeHolds(accountId: string, currency: Currency): Money;
}

export interface AuthorizeRequest {
  readonly account: Account;
  readonly authId: string;
  readonly hold: Money;
  /** Processing day: the ledger is read as known now, value-dated up to this day. */
  readonly day: Day;
  readonly sourceId: string;
}

export type AuthorizeResult =
  | { readonly ok: true; readonly transition: AuthTransition }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

export interface SettleRequest {
  readonly account: Account;
  readonly authId: string;
  readonly amount: Money;
  readonly valueDay: Day;
  readonly bookedDay: Day;
  readonly sourceId: string;
}

export interface SettleResult {
  /** The SETTLEMENT journal line. Always booked (see REJECTED.md, criterion 4). */
  readonly entry: Entry;
  /** Present when the hold was consumed. */
  readonly transition?: AuthTransition;
  /** Raised to operations when the settlement did not match a live hold. */
  readonly exception?: ErrorCode;
}

export interface IAuthorizationService {
  authorize(req: AuthorizeRequest): AuthorizeResult;
  settle(req: SettleRequest): SettleResult;
}
