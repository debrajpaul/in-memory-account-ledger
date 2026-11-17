import { describe, expect, it } from 'vitest';
import type { Account, NewEntry } from '../common/interfaces/journal.interface.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { JournalStore } from '../stores/journal.store.js';
import { InterestService } from './interest.service.js';

const aedAcc: Account = {
  accountId: 'ACC-001',
  currency: 'AED',
  opening: { currency: 'AED', minor: 0n },
};
const bhdAcc: Account = {
  accountId: 'ACC-002',
  currency: 'BHD',
  opening: { currency: 'BHD', minor: 0n },
};

const aed = (minor: bigint, valueDay: number, bookedDay: number, sourceId: string): NewEntry => ({
  accountId: 'ACC-001',
  kind: minor >= 0n ? 'CREDIT' : 'DEBIT',
  amount: { currency: 'AED', minor },
  valueDay,
  bookedDay,
  sourceId,
});

describe('InterestService.capitalize', () => {
  it('ACC-001 final shape: 250, 250, 650, 285, 285, 285 -> 0.10+0.10+0.26+0.11x3 = AED 0.79', () => {
    const journal = new JournalStore();
    journal.append(aed(120000n, 1, 1, 'E1'));
    journal.append(aed(-95000n, 1, 1, 'E2'));
    journal.append(aed(40000n, 3, 3, 'E4'));
    journal.append(aed(-36500n, 4, 4, 'E5+E6'));
    const r = new InterestService(journal).capitalize(aedAcc, 6, 'CAP-6');
    expect(r.accruals.map((a) => a.accrual.minor)).toEqual([10n, 10n, 26n, 11n, 11n, 11n]);
    expect(r.total.minor).toBe(79n);
    expect(r.entry?.valueDay).toBe(6);
    expect(ledgerBalance(journal, aedAcc, { valueDay: 6 }).minor).toBe(28579n);
  });

  it('the capitalized total always equals the sum of rounded accruals (criterion 8)', () => {
    const journal = new JournalStore();
    journal.append(aed(28500n, 1, 1, 'X')); // 0.114 per day: each rounds down
    const r = new InterestService(journal).capitalize(aedAcc, 6, 'CAP-6');
    const sum = r.accruals.reduce((s, a) => s + a.accrual.minor, 0n);
    expect(r.total.minor).toBe(sum);
    expect(sum).toBe(66n); // 6 x 0.11; unrounded would be 0.684
  });

  it('negative and zero days accrue nothing (positive balances only)', () => {
    const journal = new JournalStore();
    journal.append(aed(-10000n, 1, 1, 'X'));
    journal.append(aed(10000n, 4, 4, 'Y'));
    const r = new InterestService(journal).capitalize(aedAcc, 6, 'CAP-6');
    expect(r.accruals.map((a) => a.accrual.minor)).toEqual([0n, 0n, 0n, 0n, 0n, 0n]);
    expect(r.entry).toBeUndefined();
  });

  it('uses final knowledge: a late, back-valued credit still earns interest for its value days', () => {
    // E10 shape: BHD 10.000 value Day 5, booked late on Day 6
    const journal = new JournalStore();
    journal.append({
      accountId: 'ACC-002',
      kind: 'CREDIT',
      amount: { currency: 'BHD', minor: 10000n },
      valueDay: 5,
      bookedDay: 6,
      sourceId: 'E10',
    });
    const r = new InterestService(journal).capitalize(bhdAcc, 6, 'CAP-6');
    expect(r.accruals.map((a) => a.accrual.minor)).toEqual([0n, 0n, 0n, 0n, 4n, 4n]);
    expect(r.total.minor).toBe(8n); // BHD 0.008, rounded to 3 dp
  });
});
