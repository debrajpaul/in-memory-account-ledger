import type { BalanceQuery } from '../common/interfaces/balance.interface.js';
import type { Account, IJournalStore } from '../common/interfaces/journal.interface.js';
import type { Money } from '../common/interfaces/money.interface.js';
import { money } from './money.helper.js';

/**
 * Closing ledger balance for a value day: opening + every entry with valueDay <= day
 * (and bookedDay <= knownAt, when given).
 *
 * Pure: nothing is cached, so a back-valued entry shows up the moment it is appended.
 * Holds are not journal lines, so they never affect this number.
 */
export function ledgerBalance(journal: IJournalStore, account: Account, q: BalanceQuery): Money {
  let total = account.opening.minor;
  for (const e of journal.forAccount(account.accountId)) {
    if (e.valueDay > q.valueDay) continue;
    if (q.knownAt !== undefined && e.bookedDay > q.knownAt) continue;
    if (q.exclude?.(e)) continue;
    total += e.amount.minor;
  }
  return money(account.currency, total);
}
