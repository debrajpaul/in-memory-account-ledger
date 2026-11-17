import { ErrorCode, LedgerError } from '../common/errors.js';
import type { Entry, IJournalStore, NewEntry } from '../common/interfaces/journal.interface.js';

/**
 * In-memory append-only journal. Entries are frozen on write and readers always get a copy of
 * the array, so neither a caller nor a bug elsewhere can edit or remove history.
 */
export class JournalStore implements IJournalStore {
  readonly #entries: Entry[] = [];
  readonly #byId = new Map<string, Entry>();

  append(input: NewEntry): Entry {
    const seq = this.#entries.length + 1;
    const entry: Entry = Object.freeze({
      ...input,
      amount: Object.freeze({ ...input.amount }),
      seq,
      entryId: `L${seq}`,
    });
    this.#entries.push(entry);
    this.#byId.set(entry.entryId, entry);
    return entry;
  }

  get(entryId: string): Entry {
    const e = this.#byId.get(entryId);
    if (!e) throw new LedgerError(`No journal entry ${entryId}`, ErrorCode.UNKNOWN_ENTRY);
    return e;
  }

  find(predicate: (e: Entry) => boolean): Entry | undefined {
    return this.#entries.find(predicate);
  }

  entries(): readonly Entry[] {
    return [...this.#entries];
  }

  forAccount(accountId: string): readonly Entry[] {
    return this.#entries.filter((e) => e.accountId === accountId);
  }

  get size(): number {
    return this.#entries.length;
  }
}
