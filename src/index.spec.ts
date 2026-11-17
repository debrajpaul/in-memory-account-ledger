import { describe, expect, it } from 'vitest';
import { ErrorCode } from './common/errors.js';
import { ACCOUNTS, EVENT_STREAM } from './fixtures/scenario.js';
import { ledgerBalance } from './helpers/balance.helper.js';
import { createContainer } from './container.js';
import { run } from './index.js';

const [ACC_001, ACC_002] = ACCOUNTS;
if (!ACC_001 || !ACC_002) throw new Error('fixture accounts missing');

const replay = () => run(ACCOUNTS, EVENT_STREAM);

const closingOn = (day: number, accountId = 'ACC-001') =>
  replay()
    .reports.find((report) => report.day === day)
    ?.accounts.find((account) => account.accountId === accountId)?.closingLedger.minor;

/** Feed events up to and including `lastEventId`, without closing the open day. */
function replayUpTo(lastEventId: string) {
  const container = createContainer(ACCOUNTS);
  for (const rawEvent of EVENT_STREAM) {
    container.eventHandler.handle(rawEvent);
    if (rawEvent.eventId === lastEventId) break;
  }
  return container;
}

describe('per-day closing ledger balance, as known at that end of day', () => {
  it('ACC-001: 250.00, 250.00, 650.00, 285.00, -410.00, 285.79', () => {
    const { reports } = replay();
    expect(reports.map((report) => report.accounts[0]?.closingLedger.minor)).toEqual([
      25000n,
      25000n,
      65000n,
      28500n,
      -41000n,
      28579n,
    ]);
  });

  it('ACC-002: zero until E10 lands late on Day 6, then BHD 10.008 with interest', () => {
    expect(closingOn(5, 'ACC-002')).toBe(0n);
    expect(closingOn(6, 'ACC-002')).toBe(10008n);
  });
});

describe('acceptance criteria we ACCEPT', () => {
  it('C1: Day 2 closing at end of Day 5, before any fee, is AED -370.00', () => {
    const { journal } = replayUpTo('E8'); // Day 5 events in, Day 5 end of day not yet run
    expect(ledgerBalance(journal, ACC_001, { valueDay: 2 }).minor).toBe(-37000n);
    expect(journal.entries().some((entry) => entry.kind === 'OVERDRAFT_FEE')).toBe(false);
  });

  it('C3: Auth-A settlement accepted; AED 15.00 of the hold released', () => {
    const auth = replay().authorizationStore.current('Auth-A');
    expect(auth?.state).toBe('SETTLED');
    expect(auth?.settledAmount?.minor).toBe(18500n);
    expect(auth?.releasedAmount?.minor).toBe(1500n);
  });

  it('C5: an approved hold moves available, not ledger (Auth-A at end of Day 2)', () => {
    const day2 = replay().reports[1]?.accounts[0];
    expect(day2?.closingLedger.minor).toBe(25000n);
    expect(day2?.activeHolds.minor).toBe(20000n);
    expect(day2?.available.minor).toBe(5000n);
  });

  it('C5 context: Auth-B is DECLINED (available -335.00 when E8 arrives)', () => {
    const auth = replay().authorizationStore.current('Auth-B');
    expect(auth?.state).toBe('DECLINED');
    expect(auth?.availableBefore?.minor).toBe(-33500n);
  });
});

describe('acceptance criteria we REFUSE (see REJECTED.md)', () => {
  it('C2: E7 causes three fees (Days 2, 4, 5), not one', () => {
    const day5 = replay().reports[4];
    const fees = day5?.feeLines.filter((line) => line.kind === 'OVERDRAFT_FEE') ?? [];
    expect(fees.map((fee) => fee.valueDay)).toEqual([2, 4, 5]);
  });

  it('C4: Auth-Z settlement is booked (funds leave) and raised as an exception', () => {
    const { journal, reports } = replay();
    const e6Line = journal.entries().find((entry) => entry.sourceId === 'E6');
    expect(e6Line?.amount.minor).toBe(-18000n);
    expect(reports[3]?.incidents.map((incident) => incident.code)).toContain(
      ErrorCode.SETTLEMENT_WITHOUT_AUTHORIZATION,
    );
  });

  it('C6: balances net back after E9, but history and the Auth-B decision do not', () => {
    const actual = replay();
    const neverHappened = run(
      ACCOUNTS,
      EVENT_STREAM.filter((rawEvent) => rawEvent.eventId !== 'E7' && rawEvent.eventId !== 'E9'),
    );
    expect(ledgerBalance(actual.journal, ACC_001, { valueDay: 6 }).minor).toBe(
      ledgerBalance(neverHappened.journal, ACC_001, { valueDay: 6 }).minor,
    );
    // E7, E9, 3 fees and 3 refunds stay in the journal for good: 8 extra lines
    expect(actual.journal.size).toBe(neverHappened.journal.size + 8);
    // without E7, Auth-B would have been approved; with E7 reversed, it stays declined
    expect(neverHappened.authorizationStore.current('Auth-B')?.state).toBe('APPROVED');
    expect(actual.authorizationStore.current('Auth-B')?.state).toBe('DECLINED');
  });

  it('C7: E10 posts 3.333 + 3.333 + 3.334 = 10.000, not 3 x 3.334', () => {
    const parts = replay()
      .journal.entries()
      .filter((entry) => entry.sourceId === 'E10');
    expect(parts.map((part) => part.amount.minor)).toEqual([3333n, 3333n, 3334n]);
  });

  it('C8: capitalized total == sum of rounded accruals, nothing discarded', () => {
    const capitalization = replay().reports[5]?.capitalization ?? [];
    for (const accountCapitalization of capitalization) {
      const sumOfAccruals = accountCapitalization.accruals.reduce(
        (sum, accrual) => sum + accrual.accrual.minor,
        0n,
      );
      expect(accountCapitalization.total.minor).toBe(sumOfAccruals);
    }
    expect(capitalization.map((entry) => entry.total.minor)).toEqual([79n, 8n]);
  });
});

describe('invariants', () => {
  it('append-only: lines booked by Day 5 are byte-identical at the end of the window', () => {
    const toText = (value: unknown) =>
      JSON.stringify(value, (_key, field: unknown) =>
        typeof field === 'bigint' ? field.toString() : field,
      );
    const early = replayUpTo('E8');
    early.ledgerService.closeThrough(5);
    const snapshot = early.journal.entries().map(toText);
    const finalLines = replay().journal.entries().slice(0, snapshot.length).map(toText);
    expect(finalLines).toEqual(snapshot);
  });

  it('every fee is refunded once E7 is reversed', () => {
    const lines = replay().journal.entries();
    const feeCount = lines.filter((entry) => entry.kind === 'OVERDRAFT_FEE').length;
    const refundCount = lines.filter((entry) => entry.kind === 'OVERDRAFT_FEE_REFUND').length;
    expect([feeCount, refundCount]).toEqual([3, 3]);
  });

  it('E10 is a late event: booked on Day 6 with value date Day 5, raised as a warning', () => {
    const { journal, reports } = replay();
    const e10Lines = journal.entries().filter((entry) => entry.sourceId === 'E10');
    expect(e10Lines.every((entry) => entry.bookedDay === 6 && entry.valueDay === 5)).toBe(true);
    expect(reports[5]?.incidents.map((incident) => incident.code)).toContain(ErrorCode.LATE_EVENT);
  });

  it('the ledger refuses events after the window has closed', () => {
    const container = createContainer(ACCOUNTS);
    container.ledgerService.finish();
    expect(() => container.eventHandler.handle(EVENT_STREAM[0])).toThrow(/window closed/);
  });

  it('nothing in the brief stream is rejected as invalid input', () => {
    const severities = replay().incidents.map((incident) => incident.severity);
    expect(severities).not.toContain('ERROR');
  });
});
