import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors.js';
import type { Account } from '../common/interfaces/journal.interface.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { JournalStore } from '../stores/journal.store.js';
import { ReversalService } from './reversal.service.js';

const acc: Account = {
  accountId: 'ACC-001',
  currency: 'AED',
  opening: { currency: 'AED', minor: 0n },
};

/** E1 + E2 on Day 1, then E7 (-620.00) booked Day 5, value-dated Day 2. */
function setup() {
  const journal = new JournalStore();
  const base = { accountId: 'ACC-001' };
  journal.append({
    ...base,
    kind: 'CREDIT',
    amount: { currency: 'AED', minor: 120000n },
    valueDay: 1,
    bookedDay: 1,
    sourceId: 'E1',
  });
  journal.append({
    ...base,
    kind: 'DEBIT',
    amount: { currency: 'AED', minor: -95000n },
    valueDay: 1,
    bookedDay: 1,
    sourceId: 'E2',
  });
  const e7 = journal.append({
    ...base,
    kind: 'DEBIT',
    amount: { currency: 'AED', minor: -62000n },
    valueDay: 2,
    bookedDay: 5,
    sourceId: 'E7',
  });
  return { journal, e7, svc: new ReversalService(journal) };
}

describe('ReversalService', () => {
  it('E9 books +620.00, value Day 2, pointing at E7; Day 2 balance returns to 250.00', () => {
    const { journal, e7, svc } = setup();
    const r = svc.reverse({ target: e7, valueDay: 2, bookedDay: 6, sourceId: 'E9' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.amount.minor).toBe(62000n);
      expect(r.entry.compensates).toBe(e7.entryId);
      expect(r.entry.bookedDay).toBe(6);
    }
    expect(ledgerBalance(journal, acc, { valueDay: 2 }).minor).toBe(25000n);
  });

  it('keeps the original: E7 is still in the journal, unchanged', () => {
    const { journal, e7, svc } = setup();
    svc.reverse({ target: e7, valueDay: 2, bookedDay: 6, sourceId: 'E9' });
    expect(journal.get(e7.entryId).amount.minor).toBe(-62000n);
    expect(journal.size).toBe(4);
  });

  it('as known on Day 5 the balance is still -370.00: the reversal does not rewrite the past', () => {
    const { journal, e7, svc } = setup();
    svc.reverse({ target: e7, valueDay: 2, bookedDay: 6, sourceId: 'E9' });
    expect(ledgerBalance(journal, acc, { valueDay: 2, knownAt: 5 }).minor).toBe(-37000n);
  });

  it('refuses a second reversal of the same line', () => {
    const { e7, svc } = setup();
    svc.reverse({ target: e7, valueDay: 2, bookedDay: 6, sourceId: 'E9' });
    const again = svc.reverse({ target: e7, valueDay: 2, bookedDay: 6, sourceId: 'E9b' });
    expect(!again.ok && again.code).toBe(ErrorCode.ALREADY_REVERSED);
  });

  it('refuses a reversal with a different value date, and books nothing', () => {
    const { journal, e7, svc } = setup();
    const r = svc.reverse({ target: e7, valueDay: 3, bookedDay: 6, sourceId: 'E9' });
    expect(!r.ok && r.code).toBe(ErrorCode.REVERSAL_VALUE_DATE_MISMATCH);
    expect(journal.size).toBe(3);
  });

  it('refuses an unknown target', () => {
    const { svc } = setup();
    const r = svc.reverse({ target: undefined, valueDay: 2, bookedDay: 6, sourceId: 'E9' });
    expect(!r.ok && r.code).toBe(ErrorCode.UNKNOWN_ENTRY);
  });
});
