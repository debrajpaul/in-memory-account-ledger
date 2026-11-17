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
    const journal = new JournalStore();
    expect(journal.append(line).entryId).toBe('L1');
    expect(journal.append(line).seq).toBe(2);
    expect(journal.get('L2').seq).toBe(2);
  });

  it('entries are frozen, including the amount: mutation throws', () => {
    const entry = new JournalStore().append(line);
    expect(() => {
      (entry as { valueDay: number }).valueDay = 9;
    }).toThrow(TypeError);
    expect(() => {
      (entry.amount as { minor: bigint }).minor = 0n;
    }).toThrow(TypeError);
  });

  it('a caller mutating its input object cannot change the stored line', () => {
    const input = { ...line, amount: { ...line.amount } };
    const journal = new JournalStore();
    journal.append(input);
    input.amount.minor = 999n;
    expect(journal.get('L1').amount.minor).toBe(100n);
  });

  it('entries() returns a copy, so callers cannot delete history', () => {
    const journal = new JournalStore();
    journal.append(line);
    (journal.entries() as unknown[]).length = 0;
    expect(journal.size).toBe(1);
  });

  it('has no update or delete API', () => {
    const journal = new JournalStore() as unknown as Record<string, unknown>;
    for (const methodName of ['update', 'delete', 'remove', 'set', 'clear'])
      expect(journal[methodName]).toBeUndefined();
  });

  it('forAccount filters by account; get throws on an unknown id', () => {
    const journal = new JournalStore();
    journal.append(line);
    journal.append({ ...line, accountId: 'ACC-002', amount: { currency: 'BHD', minor: 1n } });
    expect(journal.forAccount('ACC-002')).toHaveLength(1);
    expect(() => journal.get('L99')).toThrow(/No journal entry/);
  });
});
