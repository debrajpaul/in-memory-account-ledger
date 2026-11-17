import { ErrorCode, LedgerError } from '../common/errors.js';
import type { Entry, IJournalStore, NewEntry } from '../common/interfaces/journal.interface.js';

/**
 * In-memory append-only journal.
 *  - The contract (IJournalStore) has no update or delete method.
 *  - `private` keeps the backing array out of reach for type-checked code.
 *  - At runtime, entries are frozen on write and readers always get a copy of the array,
 *    so a caller cannot edit a stored line or shorten history through anything it is handed.
 */
export class JournalStore implements IJournalStore {
  private readonly entryList: Entry[] = [];
  private readonly entriesById = new Map<string, Entry>();

  append(input: NewEntry): Entry {
    const sequenceNumber = this.entryList.length + 1;
    const entry: Entry = Object.freeze({
      ...input,
      amount: Object.freeze({ ...input.amount }),
      seq: sequenceNumber,
      entryId: `L${sequenceNumber}`,
    });
    this.entryList.push(entry);
    this.entriesById.set(entry.entryId, entry);
    return entry;
  }

  get(entryId: string): Entry {
    const entry = this.entriesById.get(entryId);
    if (!entry) throw new LedgerError(`No journal entry ${entryId}`, ErrorCode.UNKNOWN_ENTRY);
    return entry;
  }

  find(predicate: (entry: Entry) => boolean): Entry | undefined {
    return this.entryList.find(predicate);
  }

  entries(): readonly Entry[] {
    return [...this.entryList];
  }

  forAccount(accountId: string): readonly Entry[] {
    return this.entryList.filter((entry) => entry.accountId === accountId);
  }

  get size(): number {
    return this.entryList.length;
  }
}
