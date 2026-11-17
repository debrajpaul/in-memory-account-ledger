import { POLICY } from '../src/common/policy.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/fixtures/scenario.js';
import { ledgerBalance } from '../src/helpers/balance.helper.js';
import { renderDayReports, renderJournal, renderRestated } from '../src/helpers/report.helper.js';
import { run } from '../src/index.js';

const result = run(ACCOUNTS, EVENT_STREAM);

const restatedRows = [];
for (let valueDay = POLICY.window.firstDay; valueDay <= POLICY.window.lastDay; valueDay++) {
  restatedRows.push({
    day: valueDay,
    balances: ACCOUNTS.map((account) => ({
      accountId: account.accountId,
      closing: ledgerBalance(result.journal, account, { valueDay }),
    })),
  });
}

console.log('In-memory account ledger: replay of E1..E10 in the brief order');
console.log(renderDayReports(result.reports));
console.log(renderRestated(restatedRows));
console.log(renderJournal(result.journal.entries()));
