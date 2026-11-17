import { ErrorCode } from '../common/errors.js';
import type { FeeRunError, FeeRunResult, IFeeService } from '../common/interfaces/fee.interface.js';
import type { Account, Day, Entry, IJournalStore } from '../common/interfaces/journal.interface.js';
import { POLICY } from '../common/policy.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { formatMoney, money } from '../helpers/money.helper.js';

const isFeeLineFor = (d: Day) => (e: Entry) =>
  (e.kind === 'OVERDRAFT_FEE' || e.kind === 'OVERDRAFT_FEE_REFUND') && e.feeForDay === d;

/**
 * Fees are derived from the value-dated journal, so they are reconciled, never patched.
 */
export class FeeService implements IFeeService {
  constructor(private readonly journal: IJournalStore) {}

  activeFee(accountId: string, day: Day): Entry | undefined {
    const lines = this.journal.forAccount(accountId);
    const refunded = new Set(
      lines.filter((e) => e.kind === 'OVERDRAFT_FEE_REFUND').map((e) => e.compensates),
    );
    return lines.find(
      (e) => e.kind === 'OVERDRAFT_FEE' && e.feeForDay === day && !refunded.has(e.entryId),
    );
  }

  /**
   * End-of-day run for processing day P. Re-evaluates every value day 1..P in ascending order,
   * because a fee on day d changes the balance of every later day:
   *  - pre-fee closing(d) < 0 and no active fee for d  -> book OVERDRAFT_FEE, value_date d
   *  - pre-fee closing(d) >= 0 and an active fee for d -> book OVERDRAFT_FEE_REFUND (compensating)
   *
   * "Pre-fee" = every line with valueDay <= d except day d's own fee/refund lines. Earlier
   * days' fees are included: a fee can itself push a later day negative.
   * At most one active fee per (account, value day) is the idempotency key, so running the
   * same EOD twice books nothing new.
   */
  reconcile(account: Account, processingDay: Day, runId: string): FeeRunResult {
    const booked: Entry[] = [];
    const errors: FeeRunError[] = [];
    const fee = POLICY.overdraftFee[account.currency];

    for (let d = POLICY.window.firstDay; d <= processingDay; d++) {
      const preFee = ledgerBalance(this.journal, account, {
        valueDay: d,
        exclude: isFeeLineFor(d),
      });
      const existing = this.activeFee(account.accountId, d);

      if (preFee.minor < 0n && !existing) {
        if (!fee) {
          errors.push({
            code: ErrorCode.FEE_CURRENCY_UNSUPPORTED,
            message: `${account.accountId} negative on Day ${d}; no overdraft fee defined in ${account.currency}`,
            day: d,
          });
          continue;
        }
        booked.push(
          this.journal.append({
            accountId: account.accountId,
            kind: 'OVERDRAFT_FEE',
            amount: money(fee.currency, -fee.minor),
            valueDay: d,
            bookedDay: processingDay,
            sourceId: runId,
            feeForDay: d,
            note: `Day ${d} pre-fee closing ${formatMoney(preFee)}`,
          }),
        );
      } else if (preFee.minor >= 0n && existing) {
        booked.push(
          this.journal.append({
            accountId: account.accountId,
            kind: 'OVERDRAFT_FEE_REFUND',
            amount: money(existing.amount.currency, -existing.amount.minor),
            valueDay: d,
            bookedDay: processingDay,
            sourceId: runId,
            feeForDay: d,
            compensates: existing.entryId,
            note: `Day ${d} no longer negative`,
          }),
        );
      }
    }
    return { booked, errors };
  }
}
