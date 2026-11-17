# Development Guidelines

How we build in-memory-account-ledger. If code and this file disagree, fix one of them in the
same commit.

## 1. Ledger rules (never break these)

- **Append-only.** The journal store (`IJournalStore`) has `append` and read methods only. No update, no delete. Entries
  and authorization transitions are `Object.freeze`d. A correction is always a new
  compensating line (`REVERSAL`, `OVERDRAFT_FEE_REFUND`) that points at the line it offsets.
- **No floats in the money path.** Amounts are signed `bigint` minor units (AED 1/100,
  BHD 1/1000). Parse from strings, never from `number`. An input with more decimals than the
  currency allows is refused, not rounded.
- **One rounding function.** Every derived amount goes through `divRoundHalfEven` in `helpers/money.helper.ts`. No
  `Math.round`, no `toFixed`.
- **Two dates on every line.** `bookedDay` (when we learned it) and `valueDay` (when it
  counts). Balances, fees and interest use `valueDay`. Authorization decisions use what is known
  at the moment of the decision.
- **Derived lines are reconciled, not patched.** Fees are recomputed from the value-dated
  journal at every end of day. Interest accruals are recomputed at capitalization. At most one
  active fee per (account, value day).
- **A presented settlement is always booked.** A settlement that does not match a live hold is
  force-posted and raised as an `EXCEPTION`, never silently dropped.
- **Scope.** No web layer, no persistence, no UI, no database. Do not add them.

## 2. Architecture

### Folder layout

```
scripts/replay.ts        root: loads the event stream, calls run(), prints the report
src/
  index.ts               run(): builds the container, feeds events to the handler
  container.ts           the ONE wiring point
  handlers/              input boundary: validate raw events, parse money, route to services
  services/              business logic, one rule area per service
  stores/                state: append-only journal and authorization transitions
  helpers/               pure functions: money, splitting, balance queries, report rendering
  common/                shared by every layer
    interfaces/          I* contracts and shared types (Entry, Account, LedgerEvent, Money, ...)
    errors.ts            ErrorCode + LedgerError
    currency.ts          ISO 4217 precision per currency
    policy.ts            every business constant (explained in NUMBERS.md)
  fixtures/              the brief's accounts and E1..E10 stream, in the brief's order
```

### Request flow

`scripts/replay.ts` → `src/index.ts` → `handlers/event.handler.ts` → `services/ledger.service.ts`
→ `authorization` / `fee` / `interest` / `reversal` services → `stores/`.

### Layer rules

| Layer       | May import                                                | Must not                              |
| ----------- | --------------------------------------------------------- | ------------------------------------- |
| `scripts/`  | `src/index.ts`, `helpers/`                                | hold any rule                         |
| `handlers/` | `services/` (via `I*`), `helpers/`, `common/`             | touch a store, decide a business rule |
| `services/` | other services and stores via `I*`, `helpers/`, `common/` | print, parse raw input                |
| `stores/`   | `common/`                                                 | call a service, compute a rule        |
| `helpers/`  | other helpers, `common/`                                  | hold state, do I/O                    |
| `common/`   | `common/` only                                            | import from any other layer           |

- **Dependencies point down only.** A lower layer never imports a higher one.
- **All interfaces and shared types live in `common/interfaces/`**, one file per area
  (`journal.interface.ts`, `balance.interface.ts`, ...). No `interface` or exported `type`
  declarations in handlers, services, stores or helpers.
- **Interface first.** Every service and store sits behind an `I*` interface in
  `common/interfaces/` (`IJournalStore`, `IAuthorizationStore`, `IFeeService`, ...). Callers
  depend on the interface, never the class.
- **One wiring point.** Classes are created only in `src/container.ts`. No `new` of a service
  or store anywhere else (tests excepted).
- **The handler is the only validator.** It turns a raw event into typed values (money parsed,
  account resolved, currency checked). Services trust their inputs.
- **The ledger service is the only orchestrator.** It owns the clock, sequences events and runs
  end of day. It delegates every rule to a specific service.
- **Rules are data.** Every business constant lives in `common/policy.ts` and is explained in
  `NUMBERS.md`. Changing a constant means updating both.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on. No `any` (use
  `unknown` and narrow).
- File names are `<name>.<layer>.ts` in kebab-case: `fee.service.ts`, `journal.store.ts`,
  `event.handler.ts`, `money.helper.ts`, `ledger.interface.ts`.
- Interfaces start with `I` when they are a contract (`IFeeService`). Plain data shapes don't
  (`Entry`, `Account`, `Money`). Types and interfaces are PascalCase.
- **Two kinds of failure, kept apart:**
  - Business outcomes (declined authorization, force-posted settlement, late event, rejected
    reversal) are **recorded as `Incident`s** with a stable `ErrorCode` and reported per day.
    They never throw.
  - Programmer errors and broken invariants (unknown account, currency mismatch, event after
    the window closed) **throw `LedgerError(message, code)`**.
- Never swallow an error.

## 4. Output

- `pnpm replay` prints one block per processing day: closing ledger balance (as known at that
  end of day), fee and refund lines booked, authorization state changes, errors and exceptions.
  Day 6 adds the interest table. Then a restated balance view and the full journal.
- Output is deterministic: same input, same bytes. No timestamps, no random ids.
- No `console.log` in `src/` (ESLint enforces it). `helpers/report.helper.ts` builds the text;
  only `scripts/` prints.

## 5. Testing

- Vitest. `*.spec.ts` next to the source file (never `*.test.ts`).
- Helpers are tested directly. Services are tested against mocked `I*` stores. The handler is
  tested for validation and routing only.
- `src/index.spec.ts` replays the real E1..E10 stream end to end and asserts every acceptance
  criterion: accepted ones as stated, refused ones as what we do instead.
- A bug fix starts with a failing spec.
- **The one deliberately failing test** lives in `src/index.failing.spec.ts`. It is excluded
  from `pnpm test` and runs with `pnpm test:failing`. Its inline comments explain what it
  reveals. Do not "fix" it by changing the assertion.

## 6. Definition of done

All of these pass locally:

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

`pnpm check` runs all four. `pnpm test:failing` must still fail, and for the documented reason.

## 7. Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), body lines at most 100
  characters.
- One concern per commit. **Never squash**: the history is part of the submission.
- The author commits and pushes. AI tools may edit files in the working tree; they never commit
  or push.
- Update `NUMBERS.md`, `AMBIGUITIES.md` or `REJECTED.md` in the same commit as the behaviour
  that depends on them.
- Write `WORKLOG.md` entries as you work, with real local times. Never backfill.
- Never `--no-verify`.

## 8. Deliberately not set up (and why)

The take-home is a 48-hour, single-author repo, so these are left out: Husky/commitlint hooks,
CI, gitleaks, a dependency audit and Docker. Add them first if this becomes a shared codebase.
