import type { Currency } from '../common/currency.js';
import type {
  AuthTransition,
  IAuthorizationStore,
} from '../common/interfaces/authorization.interface.js';
import type { Money } from '../common/interfaces/money.interface.js';

/** Append-only log of authorization transitions. The current state is the latest transition. */
export class AuthorizationStore implements IAuthorizationStore {
  private readonly transitionLog: AuthTransition[] = [];

  record(transition: AuthTransition): AuthTransition {
    const frozenTransition = Object.freeze({ ...transition });
    this.transitionLog.push(frozenTransition);
    return frozenTransition;
  }

  current(authId: string): AuthTransition | undefined {
    for (let index = this.transitionLog.length - 1; index >= 0; index--) {
      const transition = this.transitionLog[index];
      if (transition?.authId === authId) return transition;
    }
    return undefined;
  }

  history(authId?: string): readonly AuthTransition[] {
    return this.transitionLog.filter(
      (transition) => authId === undefined || transition.authId === authId,
    );
  }

  activeHolds(accountId: string, currency: Currency): Money {
    const latestTransitionByAuthId = new Map<string, AuthTransition>();
    for (const transition of this.transitionLog) {
      if (transition.accountId === accountId) {
        latestTransitionByAuthId.set(transition.authId, transition);
      }
    }
    let totalHeldMinor = 0n;
    for (const transition of latestTransitionByAuthId.values()) {
      if (transition.state === 'APPROVED') totalHeldMinor += transition.holdAmount.minor;
    }
    return { currency, minor: totalHeldMinor };
  }
}
