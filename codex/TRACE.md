# HI-5 mechanism trace (5495)

`traceFates` in `src/checks/trace.ts` measures PLAN §3.6 / V13 after a run.
It returns one `FateRow` for each recorded entrant, including initial members
and people who leave scope. `fateJsonl` returns canonical, person-sorted JSONL;
the caller writes and seals it beside the run report. No engine state, event,
transaction, random stream or server is touched.

The record adapter contract is documented on `traceFates`. Inputs are a run
header, events, observations and the protocol's `required_event_types` and
`self_feeding` declaration, with optional observer status. Native observations
use `series.jsonl:<one-based line>` evidence addresses; adapters may retain an
explicit recorded row id instead. Event causes must resolve to actual row ids;
domain identifiers are never guessed to be event ids. Anonymous outcomes need
recorded ancestry to establish whose outcome they are.

Threshold values and comparison operators come from recorded `life.threshold`
declarations. Numeric samples are compared with those floors; recorded boolean
incapacity transitions retain a null numeric floor. Outcome timestamps mean the
last observed outcome, not survival extrapolated to the end of the run. Missing
outcomes remain null. Death ledger cause, source and crisis start time must agree
with the referenced crisis; reserve series, crossed floor and energy budget
must be present. Journal intake ids identify the recorded inflows. Numerical
transfer reconciliation remains the separate accounting check.

`data/trace-conditions.json` version 1 contains executable predicates at
measurement level 4. Every matching condition is retained, with its evidence
ids. This describes a simulated sequence, not causal necessity: that requires a
counterfactual arm. Life's terminal criteria remain open under LIFE-25. A
terminal state becomes `dead` only with a complete chain and an active terminal
criterion explicitly marked sourced by its owner; this does not make the whole
simulation empirically validated. A missing required payload, recording gap or
broken chain yields `insufficient` and a null explanation.

## Synthetic verification and limits

The checked-in trace JSON scenarios are sketches, like the accounting scenarios.
Six death scenarios marked `pass` have dangling cause ids, no reserve series or
floor, and incomplete death ledgers; most also lack budgets. The exit scenario
contains no outcome state. These raw records correctly remain insufficient.

Following `test/accounting.test.ts`, `test/trace.test.ts` supplies **explicitly
labelled test-only evidence extensions**, leaving `test/fixtures/` unchanged:

- Synthetic reserve samples (10 and 0 J), a 1 J fixture floor, the missing
  referenced crisis row, and death ledger fields linking that row.
- Synthetic intention rows for otherwise dangling intention ids.
- A 0/0 J budget where none is present, or a synthetic 1 J journal row for the
  supplied positive-intake budget.
- An alive-at-exit observation solely for the exit test.

All nine scenarios meet their declared expected result with these extensions.
Separate tests assert that the unextended incomplete scenarios cannot pass.
The several-conditions JSON supports both no-food-perceived and failed-attempt.
Its `selected: rest` alone does not prove eating was evaluated; a separate
test-only alternatives list verifies that all three conditions are retained
when that evidence exists.

Status: implemented and numerically verified on synthetic records. Integration
with future owner event payloads and empirical validation have not been tested;
there is no validation evidence yet. The trace requires owners/adapters to
supply the documented records, never reconstructs missing ones in production,
and does not change the writer's current manifest/file contract.

Gate: `npx vitest run test/trace.test.ts && npx tsc --noEmit`.
