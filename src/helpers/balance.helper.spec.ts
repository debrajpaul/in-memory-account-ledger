import { describe, expect, it } from 'vitest';
import type { Account, IJournalStore, NewEntry } from '../common/interfaces/journal.interface.js';
import { JournalStore } from '../stores/journal.store.js';
import { ledgerBalance } from './balance.helper.js';

const account: Account = {
  accountId: 'ACC-001',
  currency: 'AED',
  opening: { currency: 'AED', minor: 0n },
};

const line = (minor: bigint, valueDay: number, bookedDay: number, sourceId: string): NewEntry => ({
  accountId: 'ACC-001',
  kind: minor >= 0n ? 'CREDIT' : 'DEBIT',
  amount: { currency: 'AED', minor },
  valueDay,
  bookedDay,
  sourceId,
});

/** E1, E2, then E7: learned on Day 5, counts on Day 2. */
function seed(): IJournalStore {
  const journal = new JournalStore();
  journal.append(line(120000n, 1, 1, 'E1'));
  journal.append(line(-95000n, 1, 1, 'E2'));
  journal.append(line(-62000n, 2, 5, 'E7'));
  return journal;
}

describe('ledgerBalance', () => {
  it('Day 2 closing balance with Day 5 knowledge is AED -370.00 (criterion 1)', () => {
    expect(ledgerBalance(seed(), account, { valueDay: 2, knownAt: 5 }).minor).toBe(-37000n);
  });

  it('the same Day 2 balance as known on Day 2 was AED 250.00', () => {
    expect(ledgerBalance(seed(), account, { valueDay: 2, knownAt: 2 }).minor).toBe(25000n);
  });

  it('without knownAt it uses everything the journal holds', () => {
    expect(ledgerBalance(seed(), account, { valueDay: 2 }).minor).toBe(-37000n);
  });

  it('ignores entries value-dated after the queried day', () => {
    expect(ledgerBalance(seed(), account, { valueDay: 1 }).minor).toBe(25000n);
  });

  it('starts from the opening balance and ignores other accounts', () => {
    const journal = seed();
    journal.append({
      ...line(5n, 1, 1, 'X'),
      accountId: 'ACC-002',
      amount: { currency: 'BHD', minor: 5n },
    });
    const opened: Account = { ...account, opening: { currency: 'AED', minor: 1000n } };
    expect(ledgerBalance(journal, opened, { valueDay: 1 }).minor).toBe(26000n);
  });

  it('exclude drops matching lines from the sum', () => {
    expect(
      ledgerBalance(seed(), account, { valueDay: 2, exclude: (entry) => entry.sourceId === 'E7' })
        .minor,
    ).toBe(25000n);
  });
});
