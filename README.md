# @rex/history

The History engine (P10–P11): **the backend record of what occurred** in a run and the validation harness (Rex,
2026-10-31). It records kernel events, sampled series and snapshot hashes; aggregates them across scales and
resolutions; scores runs against real history on the eleven indicators over many seeds; and runs the cliodynamic
baseline. **No mechanism in any engine reads it, and it never determines what happens.** Design: `DESIGN.md`
(approved by Rex 2026-10-31). Rules for belt workers: `codex/RULES.md`, `cursor/RULES.md`.

## Layout

- `src/`, `test/`: the record schema and writer, aggregation, indicators, ensemble statistics
- `harness/x1/` (later): the X1 integrated experiment, depending on `@rex/kernel-harness`
- `history-runs/`: run output, never committed

## Test

```
npm install
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

**Link safety (KRN-26, I-1048):** `node_modules` holds `file:` junctions to the live kernel (and, in `harness/x1`,
the engines). Never delete it recursively; `cmd /c rmdir` a link first.
