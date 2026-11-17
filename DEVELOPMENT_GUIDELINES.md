# Development Guidelines

How we build in-memory-account-ledger. If code and this file disagree, fix one of them in the
same commit.

## 1. Ledger rules (never break these)

- **Append-only.** `Journal` has `append` and read methods only. No update, no delete. Entries
  and authorization transitions are `Object.freeze`d. A correction is always a new
  compensating line (`REVERSAL`, `OVERDRAFT_FEE_REFUND`) that points at the line it offsets.
- **No floats in the money path.** Amounts are signed `bigint` minor units (AED 1/100,
  BHD 1/1000). Parse from strings, never from `number`. An input with more decimals than the
  currency allows is refused, not rounded.
- **One rounding function.** Every derived amount goes through `divRoundHalfEven`. No
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

- Pure rule modules, one concern each: `money`, `journal`, `balances`, `authorizations`,
  `reversal`, `fees`, `interest`. They take inputs and return decisions or new entries.
- `engine.ts` is the only orchestrator. It owns the clock, sequences events, runs end of day and
  records incidents. It holds no business rule of its own.
- `report.ts` only formats. `scripts/replay.ts` is the only place that prints.
- Dependencies point down: `scripts` → `engine` → rule modules → `money` / `journal`.
  A rule module never imports `engine`.
- **Rules are data.** Every business constant (fee, rate, window, instalment count) lives in
  `src/policy.ts` and is explained in `NUMBERS.md`. Changing a constant means updating both.
- The event stream lives in `src/fixtures/scenario.ts`, exactly as the brief orders it.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on. No `any` (use
  `unknown` and narrow).
- File names are kebab-case. Types and interfaces are PascalCase.
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
- No `console.log` in `src/` (ESLint enforces it). Only `scripts/` prints.

## 5. Testing

- Vitest. `*.spec.ts` next to the source file (never `*.test.ts`).
- Rule modules are tested in isolation with hand-built journals. `engine.spec.ts` replays the
  real stream and asserts every acceptance criterion: accepted ones as stated, refused ones as
  what we do instead.
- A bug fix starts with a failing spec.
- **The one deliberately failing test** lives in `src/engine.failing.spec.ts`. It is excluded
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
