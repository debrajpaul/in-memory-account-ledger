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
    private readonly authorizationStore: IAuthorizationStore,
  ) {}

  /**
   * Approve only if ledger - activeHolds - hold >= 0, where ledger is every line value-dated
   * up to today, as known right now. The decision is final: it is not revisited if the ledger
   * it was based on is later corrected (see the annotated failing test).
   */
  authorize(request: AuthorizeRequest): AuthorizeResult {
    if (this.authorizationStore.current(request.authId)) {
      return {
        ok: false,
        code: ErrorCode.DUPLICATE_AUTHORIZATION,
        message: `${request.authId} already exists`,
      };
    }
    const { account } = request;
    const ledger = ledgerBalance(this.journal, account, { valueDay: request.day });
    const activeHolds = this.authorizationStore.activeHolds(account.accountId, account.currency);
    const availableBefore = money(account.currency, ledger.minor - activeHolds.minor);
    const approved = availableBefore.minor - request.hold.minor >= 0n;

    const transition = this.authorizationStore.record({
      authId: request.authId,
      accountId: account.accountId,
      day: request.day,
      sourceId: request.sourceId,
      holdAmount: request.hold,
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
  settle(request: SettleRequest): SettleResult {
    const auth = this.authorizationStore.current(request.authId);
    const liveAuth = auth?.state === 'APPROVED' ? auth : undefined;

    let exception: ErrorCode | undefined;
    if (!auth) exception = ErrorCode.SETTLEMENT_WITHOUT_AUTHORIZATION;
    else if (!liveAuth) exception = ErrorCode.SETTLEMENT_ON_INACTIVE_AUTHORIZATION;
    else if (request.amount.minor > liveAuth.holdAmount.minor)
      exception = ErrorCode.SETTLEMENT_EXCEEDS_HOLD;

    const entry = this.journal.append({
      accountId: request.account.accountId,
      kind: 'SETTLEMENT',
      amount: money(request.amount.currency, -request.amount.minor),
      valueDay: request.valueDay,
      bookedDay: request.bookedDay,
      sourceId: request.sourceId,
      note: `settles ${request.authId}${liveAuth ? '' : ' (force-post)'}`,
    });

    if (!liveAuth) return { entry, ...(exception ? { exception } : {}) };

    const releasedAmount = money(
      request.amount.currency,
      request.amount.minor > liveAuth.holdAmount.minor
        ? 0n
        : liveAuth.holdAmount.minor - request.amount.minor,
    );
    const transition = this.authorizationStore.record({
      authId: liveAuth.authId,
      accountId: liveAuth.accountId,
      holdAmount: liveAuth.holdAmount,
      state: 'SETTLED',
      day: request.bookedDay,
      sourceId: request.sourceId,
      settledAmount: request.amount,
      releasedAmount,
    });
    return { entry, transition, ...(exception ? { exception } : {}) };
  }
}
