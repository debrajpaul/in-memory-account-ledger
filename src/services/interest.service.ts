import type {
  CapitalizationResult,
  DailyAccrual,
  IInterestService,
} from '../common/interfaces/interest.interface.js';
import type { Account, Day, IJournalStore } from '../common/interfaces/journal.interface.js';
import { POLICY } from '../common/policy.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { applyRate, money } from '../helpers/money.helper.js';

/**
 * Accruals are memo values, not journal lines; only the capitalization is booked.
 *
 * Each day's accrual is computed from that day's closing balance as known at capitalization
 * time, so back-valued lines (E7, E9, the late E10) are reflected without accrual reversals.
 * The capitalized total is the sum of the rounded daily accruals by construction, so the rule
 * "rounded daily accruals must sum exactly to the capitalized total" cannot fail and there is
 * no remainder to discard.
 */
export class InterestService implements IInterestService {
  constructor(private readonly journal: IJournalStore) {}

  capitalize(account: Account, bookedDay: Day, runId: string): CapitalizationResult {
    const { firstDay, lastDay } = POLICY.window;
    const accruals: DailyAccrual[] = [];
    let totalMinor = 0n;

    for (let valueDay = firstDay; valueDay <= lastDay; valueDay++) {
      const closing = ledgerBalance(this.journal, account, { valueDay });
      const accrual =
        closing.minor > 0n
          ? applyRate(closing, POLICY.dailyInterestRate)
          : money(account.currency, 0n);
      accruals.push({ day: valueDay, closing, accrual });
      totalMinor += accrual.minor;
    }

    const entry =
      totalMinor === 0n
        ? undefined
        : this.journal.append({
            accountId: account.accountId,
            kind: 'INTEREST_CAPITALIZATION',
            amount: money(account.currency, totalMinor),
            valueDay: lastDay,
            bookedDay,
            sourceId: runId,
            note: `capitalize ${accruals.length} daily accruals`,
          });

    return {
      accountId: account.accountId,
      accruals,
      total: money(account.currency, totalMinor),
      entry,
    };
  }
}
