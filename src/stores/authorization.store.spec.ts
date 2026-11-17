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
    const s = new AuthorizationStore();
    s.record({ ...base, state: 'APPROVED' });
    expect(s.activeHolds('ACC-001', 'AED').minor).toBe(20000n);
    s.record({ ...base, state: 'SETTLED', day: 4, sourceId: 'E5' });
    expect(s.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('keeps every transition (append-only) and current() is the latest', () => {
    const s = new AuthorizationStore();
    s.record({ ...base, state: 'APPROVED' });
    s.record({ ...base, state: 'SETTLED', day: 4 });
    expect(s.history('Auth-A').map((t) => t.state)).toEqual(['APPROVED', 'SETTLED']);
    expect(s.current('Auth-A')?.state).toBe('SETTLED');
    expect(s.current('Auth-Z')).toBeUndefined();
  });

  it('declined holds never count', () => {
    const s = new AuthorizationStore();
    s.record({ ...base, state: 'DECLINED' });
    expect(s.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('transitions are frozen', () => {
    const t = new AuthorizationStore().record({ ...base, state: 'APPROVED' });
    expect(() => {
      (t as { state: string }).state = 'SETTLED';
    }).toThrow(TypeError);
  });
});
