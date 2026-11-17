import type { Currency } from '../currency.js';
import type { Day } from './journal.interface.js';

/**
 * Raw events exactly as they arrive: amounts are strings, nothing is validated yet.
 * Only the handler reads these.
 */
interface RawEventBase {
  readonly eventId: string;
  /** Processing day the event is presented on. */
  readonly day: Day;
  readonly accountId: string;
  readonly valueDay: Day;
}

export interface RawCreditEvent extends RawEventBase {
  readonly type: 'CREDIT';
  readonly currency: Currency;
  readonly amount: string;
  /** Post as N equal instalments (E10). Default 1. */
  readonly instalments?: number;
}

export interface RawDebitEvent extends RawEventBase {
  readonly type: 'DEBIT';
  readonly currency: Currency;
  readonly amount: string;
}

export interface RawAuthorizationEvent extends RawEventBase {
  readonly type: 'AUTHORIZATION';
  readonly authId: string;
  readonly currency: Currency;
  readonly amount: string;
}

export interface RawSettlementEvent extends RawEventBase {
  readonly type: 'SETTLEMENT';
  readonly authId: string;
  readonly currency: Currency;
  readonly amount: string;
}

export interface RawReversalEvent extends RawEventBase {
  readonly type: 'REVERSAL';
  readonly targetEventId: string;
}

export type RawEvent =
  RawCreditEvent | RawDebitEvent | RawAuthorizationEvent | RawSettlementEvent | RawReversalEvent;
