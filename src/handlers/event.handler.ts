import { CURRENCY_PRECISION, type Currency } from '../common/currency.js';
import { ErrorCode, LedgerError } from '../common/errors.js';
import type { RawEvent } from '../common/interfaces/event.interface.js';
import type { Account, Day } from '../common/interfaces/journal.interface.js';
import type {
  IEventHandler,
  ILedgerService,
  RejectCommand,
} from '../common/interfaces/ledger.interface.js';
import type { Money } from '../common/interfaces/money.interface.js';
import { POLICY } from '../common/policy.js';
import { parseMoney } from '../helpers/money.helper.js';
import { splitEvenly } from '../helpers/split.helper.js';

const SUPPORTED_EVENT_TYPES = new Set([
  'CREDIT',
  'DEBIT',
  'AUTHORIZATION',
  'SETTLEMENT',
  'REVERSAL',
]);

const UNKNOWN_FIELD = '?';

/**
 * The input boundary. Validates a raw event, turns it into a typed command and routes it to
 * the ledger service. Invalid input never throws out of here: it becomes a rejection that the
 * ledger service records as that day's ERROR, so one bad event cannot stop the replay.
 */
export class EventHandler implements IEventHandler {
  private readonly accountsById: ReadonlyMap<string, Account>;

  constructor(
    accounts: readonly Account[],
    private readonly ledgerService: ILedgerService,
  ) {
    this.accountsById = new Map(accounts.map((account) => [account.accountId, account]));
  }

  handle(input: unknown): void {
    const validation = this.validateShape(input);
    if (!validation.ok) {
      this.ledgerService.reject(validation.rejection);
      return;
    }
    const event = validation.event;
    try {
      this.routeToLedgerService(event, this.resolveAccount(event.accountId));
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      this.ledgerService.reject({
        eventId: event.eventId,
        day: event.day,
        accountId: event.accountId,
        code: error.code,
        message: error.message,
      });
    }
  }

  private routeToLedgerService(event: RawEvent, account: Account): void {
    const commandBase = {
      eventId: event.eventId,
      day: event.day,
      account,
      valueDay: event.valueDay,
    };
    switch (event.type) {
      case 'CREDIT':
      case 'DEBIT': {
        const amount = this.parseAmountForAccount(account, event.currency, event.amount);
        const instalmentCount = event.type === 'CREDIT' ? (event.instalments ?? 1) : 1;
        this.ledgerService.post({
          ...commandBase,
          kind: event.type,
          parts: splitEvenly(amount, instalmentCount),
        });
        return;
      }
      case 'AUTHORIZATION':
        this.ledgerService.authorize({
          ...commandBase,
          authId: this.requireNonEmptyId(event.authId, 'authId'),
          hold: this.parseAmountForAccount(account, event.currency, event.amount),
        });
        return;
      case 'SETTLEMENT':
        this.ledgerService.settle({
          ...commandBase,
          authId: this.requireNonEmptyId(event.authId, 'authId'),
          amount: this.parseAmountForAccount(account, event.currency, event.amount),
        });
        return;
      case 'REVERSAL':
        this.ledgerService.reverse({
          ...commandBase,
          targetEventId: this.requireNonEmptyId(event.targetEventId, 'targetEventId'),
        });
        return;
    }
  }

  /** Structural checks that must pass before any field of the event can be trusted. */
  private validateShape(
    input: unknown,
  ): { ok: true; event: RawEvent } | { ok: false; rejection: RejectCommand } {
    const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<
      string,
      unknown
    >;
    const eventId = typeof fields['eventId'] === 'string' ? fields['eventId'] : UNKNOWN_FIELD;
    const accountId = typeof fields['accountId'] === 'string' ? fields['accountId'] : UNKNOWN_FIELD;
    const reportedDay =
      typeof fields['day'] === 'number'
        ? this.clampToWindow(fields['day'])
        : POLICY.window.firstDay;
    const reject = (message: string) => ({
      ok: false as const,
      rejection: { eventId, day: reportedDay, accountId, code: ErrorCode.INVALID_EVENT, message },
    });

    const eventType = fields['type'];
    const isReversal = eventType === 'REVERSAL';
    const instalments = fields['instalments'];

    if (eventId === UNKNOWN_FIELD) return reject('missing eventId');
    if (typeof eventType !== 'string' || !SUPPORTED_EVENT_TYPES.has(eventType)) {
      return reject(`unknown type ${String(eventType)}`);
    }
    if (!this.isDayInWindow(fields['day'])) {
      return reject(
        `day ${String(fields['day'])} outside Day ${POLICY.window.firstDay}-${POLICY.window.lastDay}`,
      );
    }
    if (!this.isDayInWindow(fields['valueDay'])) {
      return reject(`valueDay ${String(fields['valueDay'])} outside the window`);
    }
    if (accountId === UNKNOWN_FIELD) return reject('missing accountId');
    if (!isReversal && !this.isSupportedCurrency(fields['currency'])) {
      return reject(`unsupported currency ${String(fields['currency'])}`);
    }
    if (!isReversal && typeof fields['amount'] !== 'string') {
      return reject('amount must be a decimal string');
    }
    if (instalments !== undefined && !(Number.isInteger(instalments) && Number(instalments) >= 1)) {
      return reject(`instalments ${String(instalments)} invalid`);
    }
    return { ok: true, event: input as RawEvent };
  }

  private resolveAccount(accountId: string): Account {
    const account = this.accountsById.get(accountId);
    if (!account) throw new LedgerError(`unknown account ${accountId}`, ErrorCode.UNKNOWN_ACCOUNT);
    return account;
  }

  /** Parse, refuse zero or negative, and check the currency matches the account. */
  private parseAmountForAccount(account: Account, currency: Currency, text: string): Money {
    const amount = parseMoney(currency, text);
    if (amount.currency !== account.currency) {
      throw new LedgerError(
        `${amount.currency} amount on ${account.currency} account ${account.accountId}`,
        ErrorCode.CURRENCY_MISMATCH,
      );
    }
    if (amount.minor <= 0n) {
      throw new LedgerError(`amount must be positive, got "${text}"`, ErrorCode.INVALID_AMOUNT);
    }
    return amount;
  }

  private requireNonEmptyId(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new LedgerError(`missing ${fieldName}`, ErrorCode.INVALID_EVENT);
    }
    return value;
  }

  private isSupportedCurrency(value: unknown): value is Currency {
    return typeof value === 'string' && value in CURRENCY_PRECISION;
  }

  private isDayInWindow(value: unknown): value is Day {
    return (
      Number.isInteger(value) &&
      Number(value) >= POLICY.window.firstDay &&
      Number(value) <= POLICY.window.lastDay
    );
  }

  private clampToWindow(day: number): Day {
    return Math.min(Math.max(Math.trunc(day), POLICY.window.firstDay), POLICY.window.lastDay);
  }
}
