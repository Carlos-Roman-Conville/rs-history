# Rules for Codex (and any belt worker) in `Toolchain/history`

1. Read `DESIGN.md` (the sections your task names) first. It is the spec. Disagree by parking in `HANDOFF.md`
   Blocked, never by changing DESIGN.md.
2. **History is the backend record (Rex, 2026-10-31).** Never write code that changes simulated state, feeds a value
   back into an engine, draws a random number, emits a kernel event or joins a transaction. History reads, copies,
   aggregates and scores; nothing else.
3. `src/` imports only `@rex/kernel` and its own files. Engines are reached only through `harness/` packages.
4. Deterministic: no `Math.random`, no `Date.now`; canonical JSON (kernel `canonical`) for anything hashed or written;
   every output sorted by a stated key, never by object-key order.
5. Never invent a value. A missing quantity is `null` and is counted in reports; a missing indicator is excluded from
   a combined score and reported, never scored 0 or 1.
6. Style: TypeScript, ES modules with `.ts` import suffixes, small files, one test file per source file in `test/`,
   test titles naming the rule they check.
7. Run only your own tests while working (`npx vitest run test/<file>.test.ts`); the runner runs the Gate.
8. Never edit another repo. Never delete `node_modules` recursively (junctions to live packages).
9. One commit, not pushed, ending with `Co-Authored-By: OpenAI Codex <codex@openai.com>`. Nothing left uncommitted.
   Close with a short report: done or parked, tests, commit hash.
