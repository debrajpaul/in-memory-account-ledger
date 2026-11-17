import { ErrorCode } from '../common/errors.js';
import type { IJournalStore } from '../common/interfaces/journal.interface.js';
import type {
  IReversalService,
  ReverseRequest,
  ReverseResult,
} from '../common/interfaces/reversal.interface.js';
import { money } from '../helpers/money.helper.js';

/**
 * A reversal is a new compensating line of opposite sign, never a deletion. The original
 * stays in the journal; balances net to zero from the original value date onwards.
 */
export class ReversalService implements IReversalService {
  constructor(private readonly journal: IJournalStore) {}

  /**
   * Refuses (without booking) when:
   *  - the target does not exist;
   *  - the target is already reversed (a second reversal would double-credit);
   *  - the value date differs from the target's: the days in between would be misstated,
   *    so we refuse rather than guess which date was meant.
   */
  reverse(req: ReverseRequest): ReverseResult {
    const { target } = req;
    if (!target) {
      return { ok: false, code: ErrorCode.UNKNOWN_ENTRY, message: 'reversal target not found' };
    }
    const already = this.journal.find(
      (e) => e.kind === 'REVERSAL' && e.compensates === target.entryId,
    );
    if (already) {
      return {
        ok: false,
        code: ErrorCode.ALREADY_REVERSED,
        message: `${target.sourceId} already reversed by ${already.sourceId}`,
      };
    }
    if (req.valueDay !== target.valueDay) {
      return {
        ok: false,
        code: ErrorCode.REVERSAL_VALUE_DATE_MISMATCH,
        message: `reversal value_date Day ${req.valueDay} != original Day ${target.valueDay}`,
      };
    }
    const entry = this.journal.append({
      accountId: target.accountId,
      kind: 'REVERSAL',
      amount: money(target.amount.currency, -target.amount.minor),
      valueDay: req.valueDay,
      bookedDay: req.bookedDay,
      sourceId: req.sourceId,
      compensates: target.entryId,
      note: `reverses ${target.sourceId}`,
    });
    return { ok: true, entry };
  }
}
