import { describe, expect, it } from 'vitest';
import type { NewEntry } from '../common/interfaces/journal.interface.js';
import { JournalStore } from './journal.store.js';

const line: NewEntry = {
  accountId: 'ACC-001',
  kind: 'CREDIT',
  amount: { currency: 'AED', minor: 100n },
  valueDay: 1,
  bookedDay: 1,
  sourceId: 'E1',
};

describe('JournalStore', () => {
  it('assigns monotonic sequence numbers and ids', () => {
    const j = new JournalStore();
    expect(j.append(line).entryId).toBe('L1');
    expect(j.append(line).seq).toBe(2);
    expect(j.get('L2').seq).toBe(2);
  });

  it('entries are frozen, including the amount: mutation throws', () => {
    const e = new JournalStore().append(line);
    expect(() => {
      (e as { valueDay: number }).valueDay = 9;
    }).toThrow(TypeError);
    expect(() => {
      (e.amount as { minor: bigint }).minor = 0n;
    }).toThrow(TypeError);
  });

  it('a caller mutating its input object cannot change the stored line', () => {
    const input = { ...line, amount: { ...line.amount } };
    const j = new JournalStore();
    j.append(input);
    input.amount.minor = 999n;
    expect(j.get('L1').amount.minor).toBe(100n);
  });

  it('entries() returns a copy, so callers cannot delete history', () => {
    const j = new JournalStore();
    j.append(line);
    (j.entries() as unknown[]).length = 0;
    expect(j.size).toBe(1);
  });

  it('has no update or delete API', () => {
    const j = new JournalStore() as unknown as Record<string, unknown>;
    for (const m of ['update', 'delete', 'remove', 'set', 'clear']) expect(j[m]).toBeUndefined();
  });

  it('forAccount filters by account; get throws on an unknown id', () => {
    const j = new JournalStore();
    j.append(line);
    j.append({ ...line, accountId: 'ACC-002', amount: { currency: 'BHD', minor: 1n } });
    expect(j.forAccount('ACC-002')).toHaveLength(1);
    expect(() => j.get('L99')).toThrow(/No journal entry/);
  });
});
