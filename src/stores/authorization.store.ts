import type { Currency } from '../common/currency.js';
import type {
  AuthTransition,
  IAuthorizationStore,
} from '../common/interfaces/authorization.interface.js';
import type { Money } from '../common/interfaces/money.interface.js';

/** Append-only log of authorization transitions. The current state is the latest transition. */
export class AuthorizationStore implements IAuthorizationStore {
  readonly #log: AuthTransition[] = [];

  record(t: AuthTransition): AuthTransition {
    const frozen = Object.freeze({ ...t });
    this.#log.push(frozen);
    return frozen;
  }

  current(authId: string): AuthTransition | undefined {
    for (let i = this.#log.length - 1; i >= 0; i--) {
      const t = this.#log[i];
      if (t?.authId === authId) return t;
    }
    return undefined;
  }

  history(authId?: string): readonly AuthTransition[] {
    return this.#log.filter((t) => authId === undefined || t.authId === authId);
  }

  activeHolds(accountId: string, currency: Currency): Money {
    const latest = new Map<string, AuthTransition>();
    for (const t of this.#log) if (t.accountId === accountId) latest.set(t.authId, t);
    let total = 0n;
    for (const t of latest.values()) if (t.state === 'APPROVED') total += t.holdAmount.minor;
    return { currency, minor: total };
  }
}
