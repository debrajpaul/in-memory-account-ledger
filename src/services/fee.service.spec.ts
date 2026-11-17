import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors.js';
import type { Account, NewEntry } from '../common/interfaces/journal.interface.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { JournalStore } from '../stores/journal.store.js';
import { FeeService } from './fee.service.js';

const acc: Account = {
  accountId: 'ACC-001',
  currency: 'AED',
  opening: { currency: 'AED', minor: 0n },
};
const bhd: Account = {
  accountId: 'ACC-002',
  currency: 'BHD',
  opening: { currency: 'BHD', minor: 0n },
};

const line = (minor: bigint, valueDay: number, bookedDay: number, sourceId: string): NewEntry => ({
  accountId: 'ACC-001',
  kind: minor >= 0n ? 'CREDIT' : 'DEBIT',
  amount: { currency: 'AED', minor },
  valueDay,
  bookedDay,
  sourceId,
});

/** E1, E2, E4, E5, E6 as booked by end of Day 4. */
function throughDay4() {
  const journal = new JournalStore();
  journal.append(line(120000n, 1, 1, 'E1'));
  journal.append(line(-95000n, 1, 1, 'E2'));
  journal.append(line(40000n, 3, 3, 'E4'));
  journal.append(line(-18500n, 4, 4, 'E5'));
  journal.append(line(-18000n, 4, 4, 'E6'));
  return { journal, svc: new FeeService(journal) };
}

describe('FeeService.reconcile', () => {
  it('no fees on Days 1-4: every closing balance is >= 0', () => {
    const { svc } = throughDay4();
    for (let p = 1; p <= 4; p++) expect(svc.reconcile(acc, p, `EOD-${p}`).booked).toHaveLength(0);
  });

  it('after back-valued E7, EOD-5 books fees for Days 2, 4 and 5, not just Day 2 (criterion 2)', () => {
    const { journal, svc } = throughDay4();
    journal.append(line(-62000n, 2, 5, 'E7'));
    const r = svc.reconcile(acc, 5, 'EOD-5');
    expect(r.booked.map((e) => [e.kind, e.valueDay, e.amount.minor])).toEqual([
      ['OVERDRAFT_FEE', 2, -2500n],
      ['OVERDRAFT_FEE', 4, -2500n],
      ['OVERDRAFT_FEE', 5, -2500n],
    ]);
    // Day 3 survives by AED 5.00 only because of the order: -370 - 25 (Day 2 fee) + 400
    expect(ledgerBalance(journal, acc, { valueDay: 3 }).minor).toBe(500n);
    expect(ledgerBalance(journal, acc, { valueDay: 5 }).minor).toBe(-41000n);
  });

  it('is idempotent: running EOD-5 again books nothing', () => {
    const { journal, svc } = throughDay4();
    journal.append(line(-62000n, 2, 5, 'E7'));
    svc.reconcile(acc, 5, 'EOD-5');
    expect(svc.reconcile(acc, 5, 'EOD-5-rerun').booked).toHaveLength(0);
  });

  it('after E9 reverses E7, EOD-6 refunds all three fees with compensating lines', () => {
    const { journal, svc } = throughDay4();
    const e7 = journal.append(line(-62000n, 2, 5, 'E7'));
    svc.reconcile(acc, 5, 'EOD-5');
    journal.append({ ...line(62000n, 2, 6, 'E9'), kind: 'REVERSAL', compensates: e7.entryId });
    const r = svc.reconcile(acc, 6, 'EOD-6');
    expect(r.booked.map((e) => [e.kind, e.valueDay])).toEqual([
      ['OVERDRAFT_FEE_REFUND', 2],
      ['OVERDRAFT_FEE_REFUND', 4],
      ['OVERDRAFT_FEE_REFUND', 5],
    ]);
    for (const d of [2, 4, 5]) expect(svc.activeFee('ACC-001', d)).toBeUndefined();
    expect(ledgerBalance(journal, acc, { valueDay: 6 }).minor).toBe(28500n);
    // nothing deleted: 5 + E7 + 3 fees + E9 + 3 refunds
    expect(journal.size).toBe(13);
  });

  it('a refunded day that goes negative again is charged again with a new fee line', () => {
    const journal = new JournalStore();
    const svc = new FeeService(journal);
    const d1 = journal.append(line(-1000n, 1, 1, 'X'));
    svc.reconcile(acc, 1, 'EOD-1');
    journal.append({ ...line(1000n, 1, 2, 'REV'), kind: 'REVERSAL', compensates: d1.entryId });
    svc.reconcile(acc, 2, 'EOD-2');
    journal.append(line(-1n, 1, 3, 'Y'));
    const r = svc.reconcile(acc, 3, 'EOD-3');
    // Day 1 is -0.01 again, and Days 2-3 carry it forward: one fresh fee per negative day
    expect(r.booked.map((e) => [e.kind, e.feeForDay])).toEqual([
      ['OVERDRAFT_FEE', 1],
      ['OVERDRAFT_FEE', 2],
      ['OVERDRAFT_FEE', 3],
    ]);
    // the refunded Day 1 fee stays refunded; the new one is a different line
    expect(svc.activeFee('ACC-001', 1)?.entryId).not.toBe('L2');
  });

  it('zero is not negative: no fee on an exactly empty account', () => {
    const journal = new JournalStore();
    journal.append(line(100n, 1, 1, 'A'));
    journal.append(line(-100n, 1, 1, 'B'));
    expect(new FeeService(journal).reconcile(acc, 1, 'EOD-1').booked).toHaveLength(0);
  });

  it('a negative BHD account raises FEE_CURRENCY_UNSUPPORTED instead of inventing FX', () => {
    const journal = new JournalStore();
    journal.append({
      ...line(-1n, 1, 1, 'X'),
      accountId: 'ACC-002',
      amount: { currency: 'BHD', minor: -1n },
    });
    const r = new FeeService(journal).reconcile(bhd, 1, 'EOD-1');
    expect(r.booked).toHaveLength(0);
    expect(r.errors[0]?.code).toBe(ErrorCode.FEE_CURRENCY_UNSUPPORTED);
  });
});
