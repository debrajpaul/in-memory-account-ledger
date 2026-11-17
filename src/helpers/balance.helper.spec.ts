import { describe, expect, it } from 'vitest';
import type { Account, IJournalStore, NewEntry } from '../common/interfaces/journal.interface.js';
import { JournalStore } from '../stores/journal.store.js';
import { ledgerBalance } from './balance.helper.js';

const acc: Account = {
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
  const j = new JournalStore();
  j.append(line(120000n, 1, 1, 'E1'));
  j.append(line(-95000n, 1, 1, 'E2'));
  j.append(line(-62000n, 2, 5, 'E7'));
  return j;
}

describe('ledgerBalance', () => {
  it('Day 2 closing balance with Day 5 knowledge is AED -370.00 (criterion 1)', () => {
    expect(ledgerBalance(seed(), acc, { valueDay: 2, knownAt: 5 }).minor).toBe(-37000n);
  });

  it('the same Day 2 balance as known on Day 2 was AED 250.00', () => {
    expect(ledgerBalance(seed(), acc, { valueDay: 2, knownAt: 2 }).minor).toBe(25000n);
  });

  it('without knownAt it uses everything the journal holds', () => {
    expect(ledgerBalance(seed(), acc, { valueDay: 2 }).minor).toBe(-37000n);
  });

  it('ignores entries value-dated after the queried day', () => {
    expect(ledgerBalance(seed(), acc, { valueDay: 1 }).minor).toBe(25000n);
  });

  it('starts from the opening balance and ignores other accounts', () => {
    const j = seed();
    j.append({
      ...line(5n, 1, 1, 'X'),
      accountId: 'ACC-002',
      amount: { currency: 'BHD', minor: 5n },
    });
    const opened: Account = { ...acc, opening: { currency: 'AED', minor: 1000n } };
    expect(ledgerBalance(j, opened, { valueDay: 1 }).minor).toBe(26000n);
  });

  it('exclude drops matching lines from the sum', () => {
    expect(
      ledgerBalance(seed(), acc, { valueDay: 2, exclude: (e) => e.sourceId === 'E7' }).minor,
    ).toBe(25000n);
  });
});
