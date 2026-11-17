# in-memory-account-ledger

An in-memory, append-only, value-dated account ledger core in TypeScript. No web layer, no
persistence, no UI, no database. A replay script runs the brief's event stream (E1–E10) and
prints, per day, the closing ledger balance, fee assessments, authorization states and errors.

## Run it

Requires Node 22+ and pnpm 10 (`corepack enable` provides pnpm).

```bash
pnpm install --frozen-lockfile
pnpm replay          # replay E1..E10 and print the per-day report
pnpm test            # the green suite
pnpm test:failing    # the ONE deliberately failing test, annotated inline
pnpm check           # typecheck + lint + format check + tests
```

## Reading the output

`pnpm replay` prints one block per processing day, then two summary views.

| Section                             | Meaning                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closing ledger balance**          | Opening balance + every entry with `value_date <= this day`, **as known at this day's end of day**. `holds` = approved, unsettled authorizations. `available` = ledger − holds.                                  |
| **Fee assessments**                 | `FEE` and `REFUND` lines booked at this end of day. A line can be value-dated to an earlier day: on Day 5 the back-valued E7 triggers fees for Days 2, 4 and 5. `compensates Lx` names the fee a refund offsets. |
| **Authorization state changes**     | `APPROVED` / `DECLINED` with the available balance the decision used; `SETTLED` with settled and released amounts.                                                                                               |
| **Errors and exceptions**           | `ERROR`: refused, nothing booked. `EXCEPTION`: booked, needs operations (Auth-Z force-post). `WARNING`: processed with a caveat (E10 late).                                                                      |
| **Interest capitalization** (Day 6) | Each day's closing balance under final knowledge, its rounded accrual, and the capitalized total.                                                                                                                |
| **RESTATED**                        | Every value day's closing balance under final knowledge. Compare it with the per-day blocks to see what back-valued entries changed.                                                                             |
| **JOURNAL**                         | Every line in booking order, with booked day, value day and source. Nothing is ever edited or removed.                                                                                                           |

### Headline numbers

| Day | ACC-001 closing (as known that day) | What happened                                                                                 |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | AED 250.00                          | E1 + E2                                                                                       |
| 2   | AED 250.00                          | Auth-A approved: hold 200.00, available 50.00                                                 |
| 3   | AED 650.00                          | E4                                                                                            |
| 4   | AED 285.00                          | Auth-A settles 185.00 (15.00 released); Auth-Z 180.00 force-posted and raised as an exception |
| 5   | AED −410.00                         | E7 back-valued to Day 2; Auth-B declined at available −335.00; fees for Days 2, 4, 5          |
| 6   | AED 285.79                          | E9 reverses E7; all three fees refunded; interest AED 0.79 capitalized                        |

ACC-002 ends at BHD 10.008: 3.333 + 3.333 + 3.334, plus 0.004 interest on each of Day 5 and
Day 6.

## How it is built

Layered, interface-first. Full rules in [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md).

```
scripts/replay.ts            root: runs the stream, prints the report
src/
  index.ts                   run(accounts, events)
  container.ts               the one wiring point
  handlers/event.handler.ts  input boundary: validate, parse money, build commands
  services/
    ledger.service.ts        clock, end of day, incidents (the only orchestrator)
    authorization.service.ts approve/decline, settlement matching, force-post
    fee.service.ts           end-of-day fee assess + refund
    interest.service.ts      daily accruals + Day 6 capitalization
    reversal.service.ts      compensating reversal lines
  stores/
    journal.store.ts         append-only journal (booked day + value day on every line)
    authorization.store.ts   append-only authorization transitions
  helpers/                   money, split, balance query, report rendering (pure)
  common/                    interfaces, errors, currency precision, policy constants
  fixtures/scenario.ts       accounts + E1..E10 in the brief's order
```

Flow: `replay.ts` → `run()` → `EventHandler` → `LedgerService` → specific services → stores.

## Documents

- [NUMBERS.md](NUMBERS.md) — every constant, and why that value and not half of it
- [AMBIGUITIES.md](AMBIGUITIES.md) — every ambiguity found, and how it was resolved
- [REJECTED.md](REJECTED.md) — acceptance criteria refused, and approaches abandoned
- [WORKLOG.md](WORKLOG.md) — timestamped log
- [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) — how this repo is built

## AI use

AI tools were used, as the brief permits. Every number and decision in this repository is one
I can derive and defend by hand.
