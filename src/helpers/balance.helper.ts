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
export function ledgerBalance(
  journal: IJournalStore,
  account: Account,
  query: BalanceQuery,
): Money {
  let totalMinor = account.opening.minor;
  for (const entry of journal.forAccount(account.accountId)) {
    const isAfterValueDay = entry.valueDay > query.valueDay;
    const isUnknownAtCutoff = query.knownAt !== undefined && entry.bookedDay > query.knownAt;
    const isExcluded = query.exclude?.(entry) ?? false;
    if (isAfterValueDay || isUnknownAtCutoff || isExcluded) continue;
    totalMinor += entry.amount.minor;
  }
  return money(account.currency, totalMinor);
}
