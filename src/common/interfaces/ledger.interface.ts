import type { ErrorCode } from '../errors.js';
import type { Account, Day } from './journal.interface.js';
import type { Money } from './money.interface.js';

/**
 * Validated commands: what the handler hands to the ledger service. Money is parsed, the
 * account is resolved and its currency matches. Services trust these.
 */
interface CommandBase {
  readonly eventId: string;
  readonly day: Day;
  readonly account: Account;
  readonly valueDay: Day;
}

export interface PostCommand extends CommandBase {
  readonly kind: 'CREDIT' | 'DEBIT';
  /** Unsigned; the service applies the sign. Already split when instalments > 1. */
  readonly parts: readonly Money[];
}

export interface AuthorizeCommand extends CommandBase {
  readonly authId: string;
  readonly hold: Money;
}

export interface SettleCommand extends CommandBase {
  readonly authId: string;
  readonly amount: Money;
}

export interface ReverseCommand extends CommandBase {
  readonly targetEventId: string;
}

export interface RejectCommand {
  readonly eventId: string;
  readonly day: Day;
  readonly accountId: string;
  readonly code: ErrorCode;
  readonly message: string;
}

export interface ILedgerService {
  post(cmd: PostCommand): void;
  authorize(cmd: AuthorizeCommand): void;
  settle(cmd: SettleCommand): void;
  reverse(cmd: ReverseCommand): void;
  /** Record an event the handler refused, so it appears in that day's errors. */
  reject(cmd: RejectCommand): void;
}

export interface IEventHandler {
  handle(event: unknown): void;
}
