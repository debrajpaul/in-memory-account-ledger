import { ErrorCode, LedgerError } from '../common/errors.js';
import type {
  IAuthorizationService,
  IAuthorizationStore,
} from '../common/interfaces/authorization.interface.js';
import type { IFeeService } from '../common/interfaces/fee.interface.js';
import type { IInterestService } from '../common/interfaces/interest.interface.js';
import type { Account, Day, Entry, IJournalStore } from '../common/interfaces/journal.interface.js';
import type {
  AuthorizeCommand,
  ILedgerRunner,
  ILedgerService,
  PostCommand,
  RejectCommand,
  ReverseCommand,
  SettleCommand,
} from '../common/interfaces/ledger.interface.js';
import type {
  AccountDayReport,
  CapitalizationReport,
  DayReport,
  Incident,
  Severity,
} from '../common/interfaces/report.interface.js';
import type { IReversalService } from '../common/interfaces/reversal.interface.js';
import { POLICY } from '../common/policy.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { money } from '../helpers/money.helper.js';

/**
 * The only orchestrator. Owns the processing clock (it only moves forward), sequences each
 * command, runs end of day and records incidents. Every business rule is delegated.
 *
 * Clock rules:
 *  - a command for a later day first closes every earlier day (end of day runs in order);
 *  - a command for an earlier day than the open one is LATE: booked on the open day, keeping
 *    its own value date, and raised as a WARNING (E10).
 */
export class LedgerService implements ILedgerService, ILedgerRunner {
  private openDay: Day = POLICY.window.firstDay;
  private lastClosedDay: Day = POLICY.window.firstDay - 1;
  private readonly recordedIncidents: Incident[] = [];
  private readonly dayReports: DayReport[] = [];
  private readonly entriesByEventId = new Map<string, readonly Entry[]>();

  constructor(
    private readonly accounts: readonly Account[],
    private readonly journal: IJournalStore,
    private readonly authorizationStore: IAuthorizationStore,
    private readonly authorizationService: IAuthorizationService,
    private readonly reversalService: IReversalService,
    private readonly feeService: IFeeService,
    private readonly interestService: IInterestService,
  ) {}

  post(command: PostCommand): void {
    const bookedDay = this.advanceClockFor(command.eventId, command.account.accountId, command.day);
    const isInstalmentPosting = command.parts.length > 1;
    const lines = command.parts.map((part, partIndex) =>
      this.journal.append({
        accountId: command.account.accountId,
        kind: command.kind,
        amount: command.kind === 'DEBIT' ? money(part.currency, -part.minor) : part,
        valueDay: command.valueDay,
        bookedDay,
        sourceId: command.eventId,
        ...(isInstalmentPosting
          ? { note: `instalment ${partIndex + 1}/${command.parts.length}` }
          : {}),
      }),
    );
    this.entriesByEventId.set(command.eventId, lines);
  }

  authorize(command: AuthorizeCommand): void {
    const processingDay = this.advanceClockFor(
      command.eventId,
      command.account.accountId,
      command.day,
    );
    const result = this.authorizationService.authorize({
      account: command.account,
      authId: command.authId,
      hold: command.hold,
      day: processingDay,
      sourceId: command.eventId,
    });
    if (!result.ok) {
      this.recordIncident(
        'ERROR',
        result.code,
        command.eventId,
        command.account.accountId,
        result.message,
      );
    }
  }

  settle(command: SettleCommand): void {
    const bookedDay = this.advanceClockFor(command.eventId, command.account.accountId, command.day);
    const result = this.authorizationService.settle({
      account: command.account,
      authId: command.authId,
      amount: command.amount,
      valueDay: command.valueDay,
      bookedDay,
      sourceId: command.eventId,
    });
    this.entriesByEventId.set(command.eventId, [result.entry]);
    if (result.exception) {
      this.recordIncident(
        'EXCEPTION',
        result.exception,
        command.eventId,
        command.account.accountId,
        `${command.authId}: debit booked (force-post), queued for exception handling`,
      );
    }
  }

  reverse(command: ReverseCommand): void {
    const bookedDay = this.advanceClockFor(command.eventId, command.account.accountId, command.day);
    const targetLines = this.entriesByEventId.get(command.targetEventId);
    if (targetLines && targetLines.length !== 1) {
      this.recordIncident(
        'ERROR',
        ErrorCode.UNKNOWN_ENTRY,
        command.eventId,
        command.account.accountId,
        `reversal of multi-line event ${command.targetEventId} is not supported`,
      );
      return;
    }
    const result = this.reversalService.reverse({
      target: targetLines?.[0],
      valueDay: command.valueDay,
      bookedDay,
      sourceId: command.eventId,
    });
    if (!result.ok) {
      this.recordIncident(
        'ERROR',
        result.code,
        command.eventId,
        command.account.accountId,
        result.message,
      );
      return;
    }
    this.entriesByEventId.set(command.eventId, [result.entry]);
  }

  reject(command: RejectCommand): void {
    this.recordIncident('ERROR', command.code, command.eventId, command.accountId, command.message);
  }

  closeThrough(day: Day): void {
    const lastDayToClose = Math.min(day, POLICY.window.lastDay);
    while (this.lastClosedDay < lastDayToClose) {
      this.runEndOfDay(this.lastClosedDay + 1);
    }
  }

  finish(): readonly DayReport[] {
    this.closeThrough(POLICY.window.lastDay);
    return this.reports();
  }

  reports(): readonly DayReport[] {
    return [...this.dayReports];
  }

  incidents(): readonly Incident[] {
    return [...this.recordedIncidents];
  }

  /**
   * Move the clock to the command's day (closing earlier days first) and return the day the
   * command is booked on. A command dated earlier than the open day is late.
   */
  private advanceClockFor(eventId: string, accountId: string, commandDay: Day): Day {
    if (this.lastClosedDay >= POLICY.window.lastDay) {
      throw new LedgerError(`window closed; cannot apply ${eventId}`, ErrorCode.WINDOW_CLOSED);
    }
    if (commandDay > this.openDay) {
      this.closeThrough(commandDay - 1);
      this.openDay = commandDay;
    }
    if (commandDay < this.openDay) {
      this.recordIncident(
        'WARNING',
        ErrorCode.LATE_EVENT,
        eventId,
        accountId,
        `presented as Day ${commandDay} after Day ${this.openDay} opened; booked on Day ${this.openDay}`,
      );
    }
    return this.openDay;
  }

  /** Fees for every account, then (last day only) interest, then the day's report. */
  private runEndOfDay(day: Day): void {
    this.openDay = Math.max(this.openDay, day);
    const runId = `EOD-${day}`;

    const feeLines: Entry[] = [];
    for (const account of this.accounts) {
      const feeRun = this.feeService.reconcile(account, day, runId);
      feeLines.push(...feeRun.booked);
      for (const feeError of feeRun.errors) {
        this.recordIncident('ERROR', feeError.code, runId, account.accountId, feeError.message);
      }
    }

    const isLastDay = day === POLICY.window.lastDay;
    const capitalization: CapitalizationReport[] = [];
    if (isLastDay) {
      for (const account of this.accounts) {
        const result = this.interestService.capitalize(account, day, `CAP-${day}`);
        capitalization.push({
          accountId: result.accountId,
          accruals: result.accruals,
          total: result.total,
        });
      }
    }

    this.dayReports.push({
      day,
      accounts: this.accounts.map((account) => this.accountDayReport(account, day)),
      feeLines,
      authTransitions: this.authorizationStore
        .history()
        .filter((transition) => transition.day === day),
      incidents: this.recordedIncidents.filter((incident) => incident.day === day),
      ...(isLastDay ? { capitalization } : {}),
    });
    this.lastClosedDay = day;
  }

  private accountDayReport(account: Account, day: Day): AccountDayReport {
    const closingLedger = ledgerBalance(this.journal, account, { valueDay: day });
    const activeHolds = this.authorizationStore.activeHolds(account.accountId, account.currency);
    return {
      accountId: account.accountId,
      closingLedger,
      activeHolds,
      available: money(account.currency, closingLedger.minor - activeHolds.minor),
    };
  }

  private recordIncident(
    severity: Severity,
    code: ErrorCode,
    sourceId: string,
    accountId: string,
    message: string,
  ): void {
    this.recordedIncidents.push({
      day: this.openDay,
      severity,
      code,
      sourceId,
      accountId,
      message,
    });
  }
}
