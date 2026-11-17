import { describe, expect, it } from 'vitest';
import { parseMoney } from '../helpers/money.helper.js';
import { AuthorizationStore } from './authorization.store.js';

const base = {
  authId: 'Auth-A',
  accountId: 'ACC-001',
  day: 2,
  sourceId: 'E3',
  holdAmount: parseMoney('AED', '200.00'),
};

describe('AuthorizationStore', () => {
  it('an APPROVED hold counts as active until a later SETTLED transition', () => {
    const store = new AuthorizationStore();
    store.record({ ...base, state: 'APPROVED' });
    expect(store.activeHolds('ACC-001', 'AED').minor).toBe(20000n);
    store.record({ ...base, state: 'SETTLED', day: 4, sourceId: 'E5' });
    expect(store.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('keeps every transition (append-only) and current() is the latest', () => {
    const store = new AuthorizationStore();
    store.record({ ...base, state: 'APPROVED' });
    store.record({ ...base, state: 'SETTLED', day: 4 });
    expect(store.history('Auth-A').map((transition) => transition.state)).toEqual([
      'APPROVED',
      'SETTLED',
    ]);
    expect(store.current('Auth-A')?.state).toBe('SETTLED');
    expect(store.current('Auth-Z')).toBeUndefined();
  });

  it('declined holds never count', () => {
    const store = new AuthorizationStore();
    store.record({ ...base, state: 'DECLINED' });
    expect(store.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('transitions are frozen', () => {
    const t = new AuthorizationStore().record({ ...base, state: 'APPROVED' });
    expect(() => {
      (t as { state: string }).state = 'SETTLED';
    }).toThrow(TypeError);
  });
});
