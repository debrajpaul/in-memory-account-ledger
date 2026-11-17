import { describe, expect, it } from 'vitest';
import { ACCOUNTS, EVENT_STREAM } from '../fixtures/scenario.js';
import { run } from '../index.js';
import { renderDayReports, renderJournal, renderRestated } from './report.helper.js';

describe('report helper', () => {
  const result = run(ACCOUNTS, EVENT_STREAM);
  const dayText = renderDayReports(result.reports);

  it('prints one block per day with the four sections the brief asks for', () => {
    for (let day = 1; day <= 6; day++) expect(dayText).toContain(`=== DAY ${day} (end of day)`);
    expect(dayText.match(/Closing ledger balance/g)).toHaveLength(6);
    expect(dayText.match(/Fee assessments booked/g)).toHaveLength(6);
    expect(dayText.match(/Authorization state changes/g)).toHaveLength(6);
    expect(dayText.match(/Errors and exceptions/g)).toHaveLength(6);
  });

  it('shows the headline lines', () => {
    expect(dayText).toContain('ledger AED -410.00');
    expect(dayText).toContain('ledger AED 285.79');
    expect(dayText).toContain('ledger BHD 10.008');
    expect(dayText).toContain('Auth-B  DECLINED');
    expect(dayText).toContain('SETTLEMENT_WITHOUT_AUTHORIZATION');
    expect(dayText).toContain('capitalized total AED 0.79');
  });

  it('is deterministic: same input, same text', () => {
    expect(renderDayReports(run(ACCOUNTS, EVENT_STREAM).reports)).toBe(dayText);
  });

  it('renders the restated view and the journal', () => {
    const restated = renderRestated([
      { day: 2, balances: [{ accountId: 'ACC-001', closing: { currency: 'AED', minor: 25000n } }] },
    ]);
    expect(restated).toContain('Day 2  ACC-001  AED 250.00');
    expect(renderJournal(result.journal.entries())).toContain('L6   booked Day 5 value Day 2');
  });
});
