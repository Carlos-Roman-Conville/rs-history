## State

Units 2848-2853 are done: record schema, observer, aggregate, indicator scores, ensemble, and X1 acceptance. Task 2854 is done (commit `35ce076`): S0 harness in `harness/`, five 3-day S0 tests, and `harness/S0-REPORT.md` projecting 46,720 records over 730 days. N11 compaction is not needed for this harness.

Keeper's handoff: `E:/AI Programs/HQ/handoffs/history/HANDOFF.md`.

2848 implementation notes: writer/reader use synchronous Node filesystem APIs (RULES #3 exception awaits keeper decision). The manifest is RunHeader plus nested `hashes: { filename: fnv1a64(text) }` for the four record files. `fail(reason)` marks the run non-reportable without I/O; the observer now catches recording errors and calls it. Score fields allow null for unavailable measurements; ensemble sign consistency is a count. Payload selection and byte limits belong to the observer; the record accepts exactly one of `payload` or `payload_hash`.

## Next

Following S0, complete the DESIGN.md section 6 thirty-day demonstration seams (the S0 tests use three days):
- G-inert: identical midnight snapshot hashes and `Midnight` rows with and without the observer.
- Replay: byte-identical record files for the same seed, with matching manifest hash.
- Measurement: daily money, goods produced/consumed/total per good, and hamlet population series; aggregates equal the harness's `Midnight` values exactly.
- G-unread: check every `kernel.json` and reject a deliberately bad fixture reading `history.record`.

## Blocked

- kernel-harness: export the hamlet and horse-stable examples; `harness/x1-0.ts` imports them by relative path from `../../settlement` and `../../realism`.

- kernel: incremental bus read. Expose detached EventRecords since a cursor, including phase, position and sequence; `since(cursor)` returns only KernelEvents.
- 2848 BoundaryInput schema: DESIGN has no detailed schema; implementation requires `label` (researched/estimate/fiction) and `source`, preserving further canonical JSON fields. Confirm the complete boundary contract before building loaders.
- Keeper decides whether RULES #3 allows Node `fs` in `writer.ts` and `reader.ts` (both also use `node:path`), and whether the manifest's nested `hashes: {file: hash}` shape is the §1 contract.
- Timing mismatch: A1 currently requires t0 stock rows to check day 1; observer-only records omit t0. Resolve the initial-state contract before relying on A1 for harness acceptance.

## Gotchas

- `harness/S0-REPORT.md` is rewritten only when `S0_WRITE_REPORT` is set (or the file is missing).

Observer reads: full copy per checkpoint via `bus.state()` because `since(cursor)` omits required ordering metadata (phase, position, sequence); no incremental EventRecord API exists.

- `share` takes `quantity: [part, whole]` (`src/aggregate.ts`).
- `count` returns null when a member has no row; present rows with null values are excluded from the count (`src/aggregate.ts`).
- `binomialTail` is one-sided and `signTest` is two-sided (`src/ensemble.ts`).
- `sign_consistency` is a summed count of checkpoint majorities, not a fraction (`src/ensemble.ts`).
- The observer's `first_ms: 0` does not sample t0 (kernel offsets run after registration), so observer records have no initial state; A1 starts at day 1, the first recorded day for daily sampling, but still requires t0 stocks (`src/observer.ts`, `src/x1/acceptance.ts`).
- Unmapped event payloads are written as `payload_hash` only (`src/observer.ts`).
- During observer recording, writer errors go to `writer.fail` and are never thrown into the scheduler, even if `fail` throws; direct writer API calls can throw (`src/observer.ts`, `src/writer.ts`).
