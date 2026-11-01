## State

Units 2848-2853 are done: record schema, observer, aggregate, indicator scores, ensemble, and X1 acceptance. Task 2854 is done (commit `35ce076`): S0 harness in `harness/`, five 3-day S0 tests, and `harness/S0-REPORT.md` projecting 46,720 records over 730 days. N11 compaction is not needed for this harness.

Keeper's handoff: `E:/AI Programs/HQ/handoffs/history/HANDOFF.md`.

Record notes: writer/reader use synchronous Node filesystem APIs (allowed by RULES #3). The manifest is RunHeader plus nested `hashes: { filename: fnv1a64(text) }` for the four record files. `fail(reason)` marks the run non-reportable without I/O; the observer now catches recording errors and calls it. Score fields allow null for unavailable measurements; ensemble sign consistency is a count. Payload selection and byte limits belong to the observer; the record accepts exactly one of `payload` or `payload_hash`.

Observer records initial reads and optional snapshot at attach time, then checkpoints. A1 uses recorded t0 stocks; missing stocks fail with the day named. Boundary inputs follow DESIGN 1.1's explicit schema.

## Next

Following S0, complete the DESIGN.md section 6 thirty-day demonstration seams (the S0 tests use three days; a thirty-day S0 run takes about 16 min):
- X1-0: verify G-inert midnight hashes, replay bytes, daily money/goods/population measurements, and G-unread registry checks.

- Then DESIGN.md section 3.7: S1 soil to plant (N1, N2), S2 plant to inventory (N3), S3 inventory to body (N4), S4 body to mind (N5), onward to S5-S7; each waits on its Needs, held by other keepers.

## Blocked

- kernel-harness: export the hamlet and horse-stable examples; `harness/x1-0.ts` imports them by relative path from `../../settlement` and `../../realism`.
- kernel: incremental bus read. Expose detached EventRecords since a cursor, including phase, position and sequence; `since(cursor)` returns only KernelEvents.

## Gotchas

- `harness/S0-REPORT.md` is rewritten only when `S0_WRITE_REPORT` is set (or the file is missing).
- Observer reads: full copy per checkpoint via `bus.state()` because `since(cursor)` omits required ordering metadata (phase, position, sequence); no incremental EventRecord API exists.
- `share` takes `quantity: [part, whole]` (`src/aggregate.ts`).
- `count` returns null when a member has no row; present rows with null values are excluded from the count (`src/aggregate.ts`).
- `binomialTail` is one-sided and `signTest` is two-sided (`src/ensemble.ts`).
- `sign_consistency` is a summed count of checkpoint majorities, not a fraction (`src/ensemble.ts`).
- Unmapped event payloads are written as `payload_hash` only (`src/observer.ts`).
- During observer recording, writer errors go to `writer.fail` and are never thrown into the scheduler, even if `fail` throws; direct writer API calls can throw (`src/observer.ts`, `src/writer.ts`).
