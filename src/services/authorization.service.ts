import { ErrorCode } from '../common/errors.js';
import type {
  AuthorizeRequest,
  AuthorizeResult,
  IAuthorizationService,
  IAuthorizationStore,
  SettleRequest,
  SettleResult,
} from '../common/interfaces/authorization.interface.js';
import type { IJournalStore } from '../common/interfaces/journal.interface.js';
import { ledgerBalance } from '../helpers/balance.helper.js';
import { money } from '../helpers/money.helper.js';

/**
 * Owns the authorization lifecycle: approve / decline a hold, and match a settlement to it.
 */
export class AuthorizationService implements IAuthorizationService {
  constructor(
    private readonly journal: IJournalStore,
    private readonly auths: IAuthorizationStore,
  ) {}

  /**
   * Approve only if ledger - activeHolds - hold >= 0, where ledger is every line value-dated
   * up to today, as known right now. The decision is final: it is not revisited if the ledger
   * it was based on is later corrected (see the annotated failing test).
   */
  authorize(req: AuthorizeRequest): AuthorizeResult {
    if (this.auths.current(req.authId)) {
      return {
        ok: false,
        code: ErrorCode.DUPLICATE_AUTHORIZATION,
        message: `${req.authId} already exists`,
      };
    }
    const { account } = req;
    const ledger = ledgerBalance(this.journal, account, { valueDay: req.day });
    const holds = this.auths.activeHolds(account.accountId, account.currency);
    const availableBefore = money(account.currency, ledger.minor - holds.minor);
    const approved = availableBefore.minor - req.hold.minor >= 0n;

    const transition = this.auths.record({
      authId: req.authId,
      accountId: account.accountId,
      day: req.day,
      sourceId: req.sourceId,
      holdAmount: req.hold,
      availableBefore,
      ...(approved
        ? { state: 'APPROVED' as const }
        : { state: 'DECLINED' as const, reason: ErrorCode.INSUFFICIENT_AVAILABLE_BALANCE }),
    });
    return { ok: true, transition };
  }

  /**
   * A presented settlement is ALWAYS booked: the scheme has already paid the merchant, so
   * refusing to post it would break reconciliation, not protect the customer.
   *  - APPROVED hold, amount <= hold: settle, release the unused part of the hold.
   *  - APPROVED hold, amount > hold:  settle, release nothing, flag SETTLEMENT_EXCEEDS_HOLD.
   *  - unknown / declined / already settled: force-post and flag for exception handling.
   */
  settle(req: SettleRequest): SettleResult {
    const auth = this.auths.current(req.authId);
    const live = auth?.state === 'APPROVED' ? auth : undefined;

    let exception: ErrorCode | undefined;
    if (!auth) exception = ErrorCode.SETTLEMENT_WITHOUT_AUTHORIZATION;
    else if (!live) exception = ErrorCode.SETTLEMENT_ON_INACTIVE_AUTHORIZATION;
    else if (req.amount.minor > live.holdAmount.minor)
      exception = ErrorCode.SETTLEMENT_EXCEEDS_HOLD;

    const entry = this.journal.append({
      accountId: req.account.accountId,
      kind: 'SETTLEMENT',
      amount: money(req.amount.currency, -req.amount.minor),
      valueDay: req.valueDay,
      bookedDay: req.bookedDay,
      sourceId: req.sourceId,
      note: `settles ${req.authId}${live ? '' : ' (force-post)'}`,
    });

    if (!live) return { entry, ...(exception ? { exception } : {}) };

    const released = money(
      req.amount.currency,
      req.amount.minor > live.holdAmount.minor ? 0n : live.holdAmount.minor - req.amount.minor,
    );
    const transition = this.auths.record({
      authId: live.authId,
      accountId: live.accountId,
      holdAmount: live.holdAmount,
      state: 'SETTLED',
      day: req.bookedDay,
      sourceId: req.sourceId,
      settledAmount: req.amount,
      releasedAmount: released,
    });
    return { entry, transition, ...(exception ? { exception } : {}) };
  }
}
