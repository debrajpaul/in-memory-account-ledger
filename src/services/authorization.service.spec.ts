import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors.js';
import type { Account, NewEntry } from '../common/interfaces/journal.interface.js';
import { parseMoney } from '../helpers/money.helper.js';
import { AuthorizationStore } from '../stores/authorization.store.js';
import { JournalStore } from '../stores/journal.store.js';
import { AuthorizationService } from './authorization.service.js';

const aed = (text: string) => parseMoney('AED', text);
const account: Account = { accountId: 'ACC-001', currency: 'AED', opening: aed('0') };

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
  return { journal, auths, service: new AuthorizationService(journal, auths) };
}

const authReq = (authId: string, hold: string, day: number, sourceId: string) => ({
  account: account,
  authId,
  hold: aed(hold),
  day,
  sourceId,
});

const settleReq = (authId: string, amount: string, sourceId: string) => ({
  account: account,
  authId,
  amount: aed(amount),
  valueDay: 4,
  bookedDay: 4,
  sourceId,
});

describe('AuthorizationService.authorize', () => {
  it('Auth-A: 250.00 - 200.00 = 50.00 >= 0 -> APPROVED; a hold moves available, not ledger', () => {
    const { journal, auths, service } = setup();
    const result = service.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    expect(result.ok && result.transition.state).toBe('APPROVED');
    expect(auths.activeHolds('ACC-001', 'AED').minor).toBe(20000n);
    expect(journal.size).toBe(2); // no ledger line for a hold (criterion 5)
  });

  it('approves when available lands exactly on zero', () => {
    const { service } = setup();
    const result = service.authorize(authReq('Auth-X', '250.00', 2, 'EX'));
    expect(result.ok && result.transition.state).toBe('APPROVED');
  });

  it('existing holds count against the next authorization', () => {
    const { service } = setup();
    service.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const result = service.authorize(authReq('Auth-C', '60.00', 2, 'EC'));
    expect(result.ok && result.transition.state).toBe('DECLINED');
    expect(result.ok && result.transition.availableBefore?.minor).toBe(5000n);
  });

  it('Auth-B shape: back-valued debit already known -> ledger -335.00 -> DECLINED', () => {
    const { journal, service } = setup();
    journal.append(line(40000n, 3, 3, 'E4'));
    journal.append(line(-36500n, 4, 4, 'E5+E6'));
    journal.append(line(-62000n, 2, 5, 'E7'));
    const result = service.authorize(authReq('Auth-B', '90.00', 5, 'E8'));
    expect(result.ok && result.transition.state).toBe('DECLINED');
    expect(result.ok && result.transition.reason).toBe(ErrorCode.INSUFFICIENT_AVAILABLE_BALANCE);
    expect(result.ok && result.transition.availableBefore?.minor).toBe(-33500n);
  });

  it('refuses a duplicate authorization id', () => {
    const { service } = setup();
    service.authorize(authReq('Auth-A', '10.00', 2, 'E3'));
    const result = service.authorize(authReq('Auth-A', '10.00', 2, 'E3b'));
    expect(!result.ok && result.code).toBe(ErrorCode.DUPLICATE_AUTHORIZATION);
  });
});

describe('AuthorizationService.settle', () => {
  it('Auth-A settles 185.00 against a 200.00 hold: accepted, 15.00 released (criterion 3)', () => {
    const { auths, service } = setup();
    service.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const result = service.settle(settleReq('Auth-A', '185.00', 'E5'));
    expect(result.exception).toBeUndefined();
    expect(result.entry.amount.minor).toBe(-18500n);
    expect(result.transition?.releasedAmount?.minor).toBe(1500n);
    expect(auths.activeHolds('ACC-001', 'AED').minor).toBe(0n);
  });

  it('Auth-Z with no authorization: booked (funds leave) and flagged, not rejected (criterion 4)', () => {
    const { journal, service } = setup();
    const result = service.settle(settleReq('Auth-Z', '180.00', 'E6'));
    expect(result.exception).toBe(ErrorCode.SETTLEMENT_WITHOUT_AUTHORIZATION);
    expect(result.entry.amount.minor).toBe(-18000n);
    expect(result.transition).toBeUndefined();
    expect(journal.size).toBe(3);
  });

  it('settling above the hold is booked, releases nothing and is flagged', () => {
    const { service } = setup();
    service.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    const result = service.settle(settleReq('Auth-A', '201.00', 'E5'));
    expect(result.exception).toBe(ErrorCode.SETTLEMENT_EXCEEDS_HOLD);
    expect(result.transition?.releasedAmount?.minor).toBe(0n);
  });

  it('settling a declined or already-settled auth is force-posted and flagged', () => {
    const { service } = setup();
    service.authorize(authReq('Auth-A', '200.00', 2, 'E3'));
    service.settle(settleReq('Auth-A', '185.00', 'E5'));
    const again = service.settle(settleReq('Auth-A', '185.00', 'E5-dup'));
    expect(again.exception).toBe(ErrorCode.SETTLEMENT_ON_INACTIVE_AUTHORIZATION);
    expect(again.entry.note).toContain('force-post');
  });
});
