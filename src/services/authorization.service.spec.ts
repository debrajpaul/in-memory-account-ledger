import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors.js';
import type { Account, NewEntry } from '../common/interfaces/journal.interface.js';
import { parseMoney } from '../helpers/money.helper.js';
import { AuthorizationStore } from '../stores/authorization.store.js';
import { JournalStore } from '../stores/journal.store.js';
import { AuthorizationService } from './authorization.service.js';

const aed = (s: string) => parseMoney('AED', s);
const acc: Account = { accountId: 'ACC-001', currency: 'AED', opening: aed('0') };

const line = (minor: bigint, valueDay: number, bookedDay: number, sourceId: string): NewEntry => ({
  accountId: 'ACC-001',
  kind: minor >= 0n ? 'CREDIT' : 'DEBIT',
  amount: { currency: 'AED', minor },
  valueDay,
  bookedDay,
  sourceId,
});

/** Ledger after E1 + E2: AED 250.00. */
function setup() {
  const journal = new JournalStore();
  journal.append(line(120000n, 1, 1, 'E1'));
  journal.append(line(-95000n, 1, 1, 'E2'));
  const auths = new AuthorizationStore();
  return { journal, auths, svc: new AuthorizationService(journal, auths) };
}

const authReq = (authId: string, hold: string, day: number, sourceId: string) => ({
  account: acc,
  authId,
  hold: aed(hold),
  day,
  sourceId,
});

const settleReq = (authId: string, amount: string, sourceId: string) => ({
  account: acc,
  authId,
  amount: aed(amount),
  valueDay: 4,
  bookedDay: 4,
  sourceId,
});

describe('AuthorizationService.authorize', () => {
  it('Auth-A: 250.00 - 200.00 = 50.00 >= 0 -> APPROVED; a hold moves available, not ledger', () => {
    const { journal, auths, svc } = setup();
    const r = svc.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    expect(r.ok && r.transition.state).toBe('APPROVED');
    expect(auths.activeHolds('ACC-001', 'AED').minor).toBe(20000n);
    expect(journal.size).toBe(2); // no ledger line for a hold (criterion 5)
  });

  it('approves when available lands exactly on zero', () => {
    const { svc } = setup();
    const r = svc.authorize(authReq('Auth-X', '250.00', 2, 'EX'));
    expect(r.ok && r.transition.state).toBe('APPROVED');
  });

  it('existing holds count against the next authorization', () => {
    const { svc } = setup();
    svc.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const r = svc.authorize(authReq('Auth-C', '60.00', 2, 'EC'));
    expect(r.ok && r.transition.state).toBe('DECLINED');
    expect(r.ok && r.transition.availableBefore?.minor).toBe(5000n);
  });

  it('Auth-B shape: back-valued debit already known -> ledger -335.00 -> DECLINED', () => {
    const { journal, svc } = setup();
    journal.append(line(40000n, 3, 3, 'E4'));
    journal.append(line(-36500n, 4, 4, 'E5+E6'));
    journal.append(line(-62000n, 2, 5, 'E7'));
    const r = svc.authorize(authReq('Auth-B', '90.00', 5, 'E8'));
    expect(r.ok && r.transition.state).toBe('DECLINED');
    expect(r.ok && r.transition.reason).toBe(ErrorCode.INSUFFICIENT_AVAILABLE_BALANCE);
    expect(r.ok && r.transition.availableBefore?.minor).toBe(-33500n);
  });

  it('refuses a duplicate authorization id', () => {
    const { svc } = setup();
    svc.authorize(authReq('Auth-A', '10.00', 2, 'E3'));
    const r = svc.authorize(authReq('Auth-A', '10.00', 2, 'E3b'));
    expect(!r.ok && r.code).toBe(ErrorCode.DUPLICATE_AUTHORIZATION);
  });
});

describe('AuthorizationService.settle', () => {
  it('Auth-A settles 185.00 against a 200.00 hold: accepted, 15.00 released (criterion 3)', () => {
    const { auths, svc } = setup();
    svc.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const r = svc.settle(settleReq('Auth-A', '185.00', 'E5'));
    expect(r.exception).toBeUndefined();
    expect(r.entry.amount.minor).toBe(-18500n);
    expect(r.transition?.releasedAmount?.minor).toBe(1500n);
    expect(auths.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('Auth-Z with no authorization: booked (funds leave) and flagged, not rejected (criterion 4)', () => {
    const { journal, svc } = setup();
    const r = svc.settle(settleReq('Auth-Z', '180.00', 'E6'));
    expect(r.exception).toBe(ErrorCode.SETTLEMENT_WITHOUT_AUTHORIZATION);
    expect(r.entry.amount.minor).toBe(-18000n);
    expect(r.transition).toBeUndefined();
    expect(journal.size).toBe(3);
  });

  it('settling above the hold is booked, releases nothing and is flagged', () => {
    const { svc } = setup();
    svc.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const r = svc.settle(settleReq('Auth-A', '201.00', 'E5'));
    expect(r.exception).toBe(ErrorCode.SETTLEMENT_EXCEEDS_HOLD);
    expect(r.transition?.releasedAmount?.minor).toBe(0n);
  });

  it('settling a declined or already-settled auth is force-posted and flagged', () => {
    const { svc } = setup();
    svc.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    svc.settle(settleReq('Auth-A', '185.00', 'E5'));
    const again = svc.settle(settleReq('Auth-A', '185.00', 'E5-dup'));
    expect(again.exception).toBe(ErrorCode.SETTLEMENT_ON_INACTIVE_AUTHORIZATION);
    expect(again.entry.note).toContain('force-post');
  });
});
