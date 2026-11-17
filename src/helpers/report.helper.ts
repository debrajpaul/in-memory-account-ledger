import type { AuthTransition } from '../common/interfaces/authorization.interface.js';
import type { Entry } from '../common/interfaces/journal.interface.js';
import type { DayReport, Incident, RestatedRow } from '../common/interfaces/report.interface.js';
import { formatMoney } from './money.helper.js';

const NONE = '  none';

function padRight(text: string, width: number): string {
  return text.padEnd(width);
}

function describeFeeLine(entry: Entry): string {
  const label = entry.kind === 'OVERDRAFT_FEE' ? 'FEE   ' : 'REFUND';
  const compensation = entry.compensates ? ` compensates ${entry.compensates}` : '';
  return `${label} ${padRight(entry.accountId, 8)} ${padRight(formatMoney(entry.amount), 12)} value_date Day ${entry.valueDay}  (${entry.entryId}${compensation})`;
}

function describeAuthTransition(transition: AuthTransition): string {
  const details = [
    `${padRight(transition.authId, 7)} ${padRight(transition.state, 9)} hold ${formatMoney(transition.holdAmount)}`,
  ];
  if (transition.availableBefore) {
    details.push(`available before ${formatMoney(transition.availableBefore)}`);
  }
  if (transition.settledAmount) details.push(`settled ${formatMoney(transition.settledAmount)}`);
  if (transition.releasedAmount) details.push(`released ${formatMoney(transition.releasedAmount)}`);
  if (transition.reason) details.push(transition.reason);
  return `${details.join(', ')}  [${transition.sourceId}]`;
}

function describeIncident(incident: Incident): string {
  return `${padRight(incident.severity, 9)} ${padRight(incident.code, 33)} ${padRight(incident.sourceId, 6)} ${incident.message}`;
}

function listOrNone(lines: readonly string[]): string[] {
  return lines.length > 0 ? lines.map((line) => `  ${line}`) : [NONE];
}

/** One block per processing day: balances, fees, authorization changes, incidents. */
export function renderDayReports(reports: readonly DayReport[]): string {
  const output: string[] = [];
  for (const report of reports) {
    output.push(`\n=== DAY ${report.day} (end of day) ${'='.repeat(50)}`);
    output.push('Closing ledger balance (value_date <= this day, as known now):');
    for (const account of report.accounts) {
      output.push(
        `  ${padRight(account.accountId, 8)} ledger ${padRight(formatMoney(account.closingLedger), 14)} holds ${padRight(formatMoney(account.activeHolds), 12)} available ${formatMoney(account.available)}`,
      );
    }
    output.push('Fee assessments booked at this end of day:');
    output.push(...listOrNone(report.feeLines.map(describeFeeLine)));
    output.push('Authorization state changes:');
    output.push(...listOrNone(report.authTransitions.map(describeAuthTransition)));
    output.push('Errors and exceptions:');
    output.push(...listOrNone(report.incidents.map(describeIncident)));

    if (report.capitalization) {
      output.push('Interest capitalization (accruals on final value-dated balances):');
      for (const accountCapitalization of report.capitalization) {
        output.push(`  ${accountCapitalization.accountId}`);
        for (const accrual of accountCapitalization.accruals) {
          output.push(
            `    Day ${accrual.day}  closing ${padRight(formatMoney(accrual.closing), 14)} accrual ${formatMoney(accrual.accrual)}`,
          );
        }
        output.push(
          `    capitalized total ${formatMoney(accountCapitalization.total)} (value_date Day ${report.day})`,
        );
      }
    }
  }
  return output.join('\n');
}

/** Every value day's closing balance under final knowledge. */
export function renderRestated(rows: readonly RestatedRow[]): string {
  const output = ['\n=== RESTATED: closing ledger by value date, final knowledge ==='];
  for (const row of rows) {
    const columns = row.balances.map(
      (balance) =>
        `${padRight(balance.accountId, 8)} ${padRight(formatMoney(balance.closing), 14)}`,
    );
    output.push(`  Day ${row.day}  ${columns.join('  ')}`.trimEnd());
  }
  return output.join('\n');
}

/** Every journal line in booking order. */
export function renderJournal(entries: readonly Entry[]): string {
  const output = ['\n=== JOURNAL (append-only, in booking order) ==='];
  for (const entry of entries) {
    const note = entry.note ? `  ${entry.note}` : '';
    output.push(
      `  ${padRight(entry.entryId, 4)} booked Day ${entry.bookedDay} value Day ${entry.valueDay}  ${entry.accountId}  ${padRight(entry.kind, 24)} ${padRight(formatMoney(entry.amount), 14)} ${entry.sourceId}${note}`,
    );
  }
  return output.join('\n');
}
