import { ErrorCode } from '../common/errors.js';
import type { FeeRunError, FeeRunResult, IFeeService } from '../common/interfaces/fee.interface.js';
import type { Account, Day, Entry, IJournalStore } from '../common/interfaces/journal.interface.js';
import { POLICY } from '../common/policy.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { formatMoney, money } from '../helpers/money.helper.js';

const isFeeLineForDay = (valueDay: Day) => (entry: Entry) =>
  (entry.kind === 'OVERDRAFT_FEE' || entry.kind === 'OVERDRAFT_FEE_REFUND') &&
  entry.feeForDay === valueDay;

/**
 * Fees are derived from the value-dated journal, so they are reconciled, never patched.
 */
export class FeeService implements IFeeService {
  constructor(private readonly journal: IJournalStore) {}

  activeFee(accountId: string, day: Day): Entry | undefined {
    const accountEntries = this.journal.forAccount(accountId);
    const refundedFeeIds = new Set(
      accountEntries
        .filter((entry) => entry.kind === 'OVERDRAFT_FEE_REFUND')
        .map((refund) => refund.compensates),
    );
    return accountEntries.find(
      (entry) =>
        entry.kind === 'OVERDRAFT_FEE' &&
        entry.feeForDay === day &&
        !refundedFeeIds.has(entry.entryId),
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
    const feeAmount = POLICY.overdraftFee[account.currency];

    for (let valueDay = POLICY.window.firstDay; valueDay <= processingDay; valueDay++) {
      const preFeeBalance = ledgerBalance(this.journal, account, {
        valueDay,
        exclude: isFeeLineForDay(valueDay),
      });
      const existingFee = this.activeFee(account.accountId, valueDay);

      if (preFeeBalance.minor < 0n && !existingFee) {
        if (!feeAmount) {
          errors.push({
            code: ErrorCode.FEE_CURRENCY_UNSUPPORTED,
            message: `${account.accountId} negative on Day ${valueDay}; no overdraft fee defined in ${account.currency}`,
            day: valueDay,
          });
          continue;
        }
        booked.push(
          this.journal.append({
            accountId: account.accountId,
            kind: 'OVERDRAFT_FEE',
            amount: money(feeAmount.currency, -feeAmount.minor),
            valueDay,
            bookedDay: processingDay,
            sourceId: runId,
            feeForDay: valueDay,
            note: `Day ${valueDay} pre-fee closing ${formatMoney(preFeeBalance)}`,
          }),
        );
      } else if (preFeeBalance.minor >= 0n && existingFee) {
        booked.push(
          this.journal.append({
            accountId: account.accountId,
            kind: 'OVERDRAFT_FEE_REFUND',
            amount: money(existingFee.amount.currency, -existingFee.amount.minor),
            valueDay,
            bookedDay: processingDay,
            sourceId: runId,
            feeForDay: valueDay,
            compensates: existingFee.entryId,
            note: `Day ${valueDay} no longer negative`,
          }),
        );
      }
    }
    return { booked, errors };
  }
}
