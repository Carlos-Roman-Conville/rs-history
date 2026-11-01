## State

Units 2848-2853 are done: record schema, observer, aggregate, indicator scores, ensemble, and X1 acceptance. Unit 2854 (S0 harness, `harness/`) is queued.

Keeper's handoff: `E:/AI Programs/HQ/handoffs/history/HANDOFF.md`.

2848 implementation notes: writer/reader use synchronous Node filesystem APIs (RULES #3 exception awaits keeper decision). The manifest is RunHeader plus nested `hashes: { filename: fnv1a64(text) }` for the four record files. `fail(reason)` marks the run non-reportable without I/O; the observer now catches recording errors and calls it. Score fields allow null for unavailable measurements; ensemble sign consistency is a count. Payload selection and byte limits belong to the observer; the record accepts exactly one of `payload` or `payload_hash`.

## Next

2854: build the S0 harness in `harness/`, then address the seams in DESIGN §6.

## Blocked

- 2848 BoundaryInput schema: DESIGN has no detailed schema; implementation requires `label` (researched/estimate/fiction) and `source`, preserving further canonical JSON fields. Confirm the complete boundary contract before building loaders.
- Keeper decides whether RULES #3 allows Node `fs` in `writer.ts` and `reader.ts` (both also use `node:path`), and whether the manifest's nested `hashes: {file: hash}` shape is the §1 contract.
- Timing mismatch: A1 currently requires t0 stock rows to check day 1; observer-only records omit t0. Resolve the initial-state contract before relying on A1 for harness acceptance.

## Gotchas

- `share` takes `quantity: [part, whole]` (`src/aggregate.ts`).
- `count` returns null when a member has no row; present rows with null values are excluded from the count (`src/aggregate.ts`).
- `binomialTail` is one-sided and `signTest` is two-sided (`src/ensemble.ts`).
- `sign_consistency` is a summed count of checkpoint majorities, not a fraction (`src/ensemble.ts`).
- The observer's `first_ms: 0` does not sample t0 (kernel offsets run after registration), so observer records have no initial state; A1 starts at day 1, the first recorded day for daily sampling, but still requires t0 stocks (`src/observer.ts`, `src/x1/acceptance.ts`).
- Unmapped event payloads are written as `payload_hash` only (`src/observer.ts`).
- During observer recording, writer errors go to `writer.fail` and are never thrown into the scheduler, even if `fail` throws; direct writer API calls can throw (`src/observer.ts`, `src/writer.ts`).
