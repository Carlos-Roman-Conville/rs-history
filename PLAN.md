# History: PLAN.md (History keeper, 2026-11-02, per `HQ/handoffs/PLAN-SPEC.md`)

**Approved as the working design (Rex 2026-11-02).** Approval does not lift the build stop (`queue/STOP-KEEPER`
stays); no unit is queued until Rex lifts it. All three CN-7 arms are in the M1a protocol (§7.1). Transaction
enforcement stays with Kernel and the state owners; History independently checks the recorded commit evidence without
affecting execution (§3.7). No further broad History review is planned.

Consolidates `Toolchain/history/DESIGN.md` (approved, Rex 2026-10-31; head ab3274a). DESIGN.md stays as reference and is
cited by section; this file is the one authoritative plan. Marks: **(Rex)** his decision; **proposed** the keeper's;
**open** a question (HIST-Q / HIST- ids, to Rex through the controller). Repo paths are relative to `Toolchain/history/`.

## Pass 1 (one page)

**What History is.** The measuring instrument: the record of what occurred, the observer that writes it, aggregates,
scores and ensembles. It determines nothing and nothing reads it (Rex, 2026-10-31; G-unread, G-inert, G-once,
DESIGN §0). Because it is the one engine that reads every engine, **it is the acceptance instrument for M1a–M5**: each
milestone is passed or failed by a History protocol run (§7.1), never by the building engine's own tests.

**Mechanisms present (implemented, unit-tested; file evidence):**
- Record schema and validators, `src/record.ts:1-105`; writer and manifest hashes, `src/writer.ts:16`; reader `src/reader.ts:9` (2848).
- Observer, one `readonly` process in phase `record`, catches its own errors, `src/observer.ts:33-86` (2849); copies the whole bus each checkpoint (`bus.state()`, `:43`), O(n²) until 2944 adopts kernel `recordsSince`.
- Aggregation and sum identity / continuity checks, `src/aggregate.ts:29,76,108` (2850).
- Scores (log error with range and zero rules, TV, Jaccard, events, share, abandonment, combine), `src/scores.ts:10-104` (2851).
- Ensemble (derived seeds, bias/variance, sign test, coverage, verdict), `src/ensemble.ts:12-119`; planted-bias test `test/ensemble.test.ts:45` (2852).
- X1 acceptance A1–A4 and G-inert, `src/x1/acceptance.ts:28,85,122,144,175`; config `src/x1/config.ts` (2853).
- S0 run on the three-engine harness: G-inert, replay, measurement, G-unread all pass; 613 s / 30 days; ~49 k records per 730 days (`harness/x1-0.ts`, `harness/S0-REPORT.md`, 2940). G-unread rule lives in Kernel `kernel/scripts/check-registry.ts:140-146`.

**Mechanisms missing (this plan adds them, §3):** the milestone protocol (paired arms, seed set, second step,
pre-registered tolerances) · the **fate trace** that explains every death and every survival · the
**independent-measurement** check (one flow measured by its debit, its credit and the kernel `TransferJournal`,
`kernel/src/transfer.ts:28,76`) · the transfer-once count · the step-comparison check · initialisation from a Catalogue
bundle (`history.init.bundle`, designed only, DESIGN §4.4) · the fine-vs-coarse check (DESIGN §4.3) · typology tables ·
SDT baseline (DESIGN §4.7) · comparison datasets (none stored; Seshat licence HIST-4).

**Quantities owned:** only `history.record` (files under `history-runs/`, outside every engine's state). Every number
in it is a copy or an arithmetic function of a copy; conservation does not apply; invariants are record order = kernel
order, manifest hash covers every file, aggregate = sum of parts (§2).

**External inputs:** kernel bus records, snapshot hashes, `TransferJournal` entries, scheduler time; each engine's
declared ports at the `record` phase; Life's death ledger (`realism/src/crisis.ts:85-87`) and crisis records;
Cognition intention and decision records; Catalogue bundles, unit masses, calendars, reference datasets.
**Host-supplied today (to become owners' ports):** the observer's read list and snapshot function (`harness/x1-0.ts:18`),
A1's store mapping `MassStores` (`src/x1/acceptance.ts:20`), all tolerances (`data/x1.json`: `tolerances: {}`,
`food_plant`, `init_bundle`, `dry_input` all `null`).

**Outputs:** run records, Score rows, milestone verdicts and fate reports. No kernel quantity.

**Contribution to M1a.** The M1a protocol (§7.1): paired provisioned / deprived arms on the same 10 derived seeds with
common random numbers; checks that each `eat` transaction's declared legs commit exactly once (by transaction and leg
id; Economy debit = Life credit = journal), with an interval reconciliation as backstop; the hunger signal follows
Life's declared timing; the controlled learning comparison separates changed hunger from changed knowledge; a paired
step-equivalence check at a second body step; every person who entered the tracked population ends with a mechanism
trace (recorded steps and contributing conditions, not a single forced cause). Needs from others for M1a: N4, N5, N6 (X1 list) plus the INTEGRATION-PLAN M1a rows, now settled as follows.
The eat/take/gather/move host resolutions: History specifies (§3.11) and Kernel builds (REG-39). `body.crisis` and
`body.death`: Life emits them (M1a-25). `cognition.decision`: Cognition (M1a-27). The deprivation states: Life's
(M1a-24).

**Flagged assumptions (open, not invented):** tolerances for every check are read from each owner's PLAN.md §7 (keeper
item HIST-13; e.g. economy PLAN §7 1e-9 relative, INTEGRATION-PLAN IT-M1a-3 1e-9, Life energy store 1e-3 J); the
deprived arm's intermediate states are Life's PLAN (glycogen gone → ketosis → wasting → starvation crisis →
host-declared death; floors still open in Life's LIFE-25; keeper item HIST-14); the second time step per engine is the owner's
choice from its stability evidence (HIST-11); N = 10 seeds per arm is the keeper's proposal (sign test 9/10, p ≈ 0.011).

**Next dependency-ready task (after Rex approves this plan):** queue nothing new until then. First: let 2944
(`recordsSince`, Needs met) run, then a codex unit for the fate-trace and transfer-once checks against synthetic
records (no engine needed), with Composer fixtures and a Haiku recompute.

**Review adopted (Rex 2026-11-02).** Nine lanes HI-1–HI-9 and checkpoints CP-1–CP-5 (§0); every report states three
verdicts separately; the corrections are folded into §3.1–3.8 and §3.11. The resolvers' behaviour is Kernel's and the
action owners'; History states only the evidence it needs (amends REG-39; HIST-16). CP-1 first: HI-1, HI-2, HI-3 and
HI-6, built against synthetic records with injected defects before any real run.

**Evaluation simplified (Rex 2026-11-03).** Recording, accounting and replay are unchanged; evaluation is simplified.
The primary result of every measured quantity is its raw discrepancy `e = Y_sim − Y_ref` (and `e_log = ln(Y_sim/Y_ref)`
for positive quantities where proportion matters) with its unit, the reference uncertainty and the protocol's declared
acceptance criterion. S and the combined score are display only and never decide a verdict (§3.3). The ensemble reports
explicit findings, not a systematic/stochastic class (§3.4). Abandonment and resolution-switch continuity use time and
same-instant rules, not sample counts (§3.2, §3.3). Each protocol declares what it records (§3.1). Broad historical
comparison (CP-5, stage 9) waits until the connected mechanisms work. HIST-20.

---

# Pass 2: the full plan

## 0. Lanes, checkpoints and the three verdicts (Rex 2026-11-02 review)

**Every report and every milestone verdict opens with three separate verdicts**, each `pass`, `fail` or `insufficient`
with its evidence ids: (1) **implementation verified**: each mechanism executed as specified; (2) **integration
verified**: the engines connected as specified; (3) **empirically validated**: predictions matched independent
evidence. A working loop can earn (1) and (2) without (3). History measures; it does not steer outcomes or invent
explanations. Trustworthy records and checks come first, historical reconstruction later.

| Lane | Responsibility | Mechanisms | First acceptance case |
|---|---|---|---|
| HI-1 Observation and event capture | copy authoritative events and declared state without changing the simulation | 3.1 | observer attached vs detached gives identical simulated state (and random draws); missing events and failed reads are reported |
| HI-2 Run identity and replay | record configuration, versions, initial conditions, seeds, external inputs; seal them | 3.1a | a replay reproduces the run; a changed dependency is detected |
| HI-3 Accounting and exactly-once | reconcile transfers, transformations and account changes | 3.7 | a duplicate credit, a missing debit and an unrecorded change all fail |
| HI-4 Aggregation and population coverage | comparable totals, distributions, series | 3.2 | membership changes and resolution switches neither duplicate people nor lose their contributions |
| HI-5 Action and fate traces | link attempts, outcomes, bodily changes, terminal states | 3.6, 3.11 | a death has a complete recorded mechanism chain; incomplete evidence is not replaced by a confident explanation; causal ids survive replay across multi-transaction intentions |
| HI-6 Experimental protocols | predeclare treatments, controls, measurements, acceptance conditions | 3.5 | the learning test distinguishes changed hunger from changed knowledge |
| HI-7 Time-step and resolution | numerical sensitivity and aggregation error | 3.8, 3.10 resolution | a planted step-size defect is detected without misclassifying ordinary stochastic variation |
| HI-8 Reference comparison and uncertainty | compare outputs with applicable independent evidence | 3.3, 3.4, Seshat | missing data, uncertain ranges and incompatible definitions stay visible |
| HI-9 Storage, retention, independent audit | keep required evidence; verify the measuring code | writer, 3.9 | an archived run keeps everything its declared replay and audit guarantees need |

| Checkpoint | Scope | Build stages (§8) |
|---|---|---|
| CP-1 Trust the instrument | incremental capture, required payloads, sealed manifests, inertness, synthetic fault tests | 0–1 |
| CP-2 Adjacent eating | reconciliation, controlled cognition comparison, explicit fixture limits, complete traces | 2–3 |
| CP-3 Movement and work | multi-step intentions, interruptions, actual activity, step checks | 4–5 |
| CP-4 Growth, recycling, social integration | wider balances, population coverage, resolution changes | 6–8 |
| CP-5 Historical comparison | independent datasets, ensembles, declared score interpretation, retention | 9 |

No further lane is added unless a concrete missing responsibility is shown.

## 1. Purpose and boundaries

**Determines:** nothing in the world. History determines *verdicts about runs*: whether a milestone's loop happened
as specified, how far a reconstruction is from history, and whether a systematic bias is established.

**Receives:** copies of state and events through declared read-only ports at the `record` phase (§4), kernel
snapshot hashes and `TransferJournal` entries, Catalogue bundles and reference data, and owners' declared tolerances.

**Must never calculate (owned elsewhere):** any quantity that changes simulated state; coarse dynamics and `refine`
(each owner's `Resolution`, HIST-Q1, DESIGN §4.3); when to switch resolution (the host); polities, wars, collapse
(Government, Society); intermediate body states and their floors (Life); a person's knowledge of the past (Cognition,
`cognition.history.*`); calendars (Catalogue, HIST-9); the conservation tolerance of any flow (its owner); step size
(each owner, from its stability evidence). The three fences are tests (DESIGN §0): **G-unread** (Kernel check
`kernel/scripts/check-registry.ts:140-146`), **G-inert** (attached vs detached snapshot hashes), **G-once** (t0 load
only through owners' loaders).

**Why History is the acceptance instrument.** An engine's own tests show its mechanism works alone (implemented). A
milestone needs the loop across engines to happen in a run nobody steered (integrated), measured by code that did not
write the mechanisms (PLATFORM §11a, independence). History is the only engine that reads all of them and writes
nothing they read, so a History protocol run is the milestone's acceptance test. The building keepers own their
mechanisms; History owns only whether the record shows the loop.

## 2. State

| Quantity | Unit | Range | Meaning | Kind |
|---|---|---|---|---|
| `history.record` (run directory, DESIGN §1) | files | append-only | what occurred: RunHeader, EventEntry, Observation, Aggregate, SnapshotRef | record: invariants, not conservation |
| observer cursor | count | 0…bus length | next bus record to copy | monotone, never rewinds |
| observer status `stopped`, `readFailures`, `missingValues` (`src/observer.ts:22`) | flag, count | ≥ 0 | a fault marks the run non-reportable, never halts it | monotone |
| Score rows (DESIGN §1.4) | dimensionless S ∈ [0, 1], signed log error | — | distance from history per indicator | pure function of record + dataset |
| Ensemble rows | bias, variance, share ∈ [0, 1], sign count | — | systematic bias established or not by this test | pure function of Score rows |
| **Milestone verdict** (new) | pass / fail / insufficient per check, plus the three verdicts (§0) | — | §7.1 | pure function of a protocol's runs |
| **Trace row** (new), one per person who entered the tracked population | outcome + recorded mechanism steps + contributing conditions + evidence ids | — | the recorded sequence for this person (§3.6) | pure function of the record |
| Protocol file and input manifest (new), one per protocol | JSON, sealed | — | arms, seeds, steps, margins, tolerances, required event classes, run identity, sealed **before** execution | immutable; a change is a new protocol |
| Output manifest (new), one per run | JSON, sealed | — | every record file's hash, sealed **after** the run | immutable |

Invariants: record order = kernel order (`compareEvents`, `src/record.ts:103`); manifest hashes cover every file; each
aggregate equals the sum of its parts at that instant (`sumIdentity`, `src/aggregate.ts:76`); a run with a dirty
engine tree or a stopped observer is non-reportable. Nothing History owns is conserved mass, energy or money: it holds
copies, and summing a copy into a balance would double-count (the rule "every transfer happens once" applies to the
world, which History only reads).

## 3. Mechanisms (each a complete chain: input → computation → what its output changes)

Every History mechanism ends in a record file or a verdict; none changes world state. Registry kind `mechanism` for
3.1, `harness` for the rest (DESIGN §4; the registry keeper decides). Searched `registry/mechanisms.json` on
2026-11-02 for fate, trace, transfer, step, milestone, accept: neighbours are `kernel.transfer` (the journal History
reads), `realism.infra.trace` (realism's in-world trace, which holds crises and their notes) and
`cognition.history.*` (in-world knowledge). None overlaps; 3.5–3.9 are new ids, proposed.

### 3.1 `history.record.backend` (implemented, DESIGN §4.1)
Kernel bus + declared ports → at each checkpoint, copy bus records since the cursor into EventEntry rows (payload
stored for mapped classes, hashed otherwise), read each port into an Observation, write snapshot hashes → record
files. Changes: nothing but the record. Applies at any checkpoint period; stops applying when a read fails (run
non-reportable). Known defect (confirmed, `src/observer.ts:43`): full `bus.state()` copy per checkpoint, quadratic in
run length; 2944 adopts kernel `recordsSince` (2941).

**Record contract (Rex 2026-11-02, HI-1).** Each EventEntry keeps a stable event id and kernel order, simulation time,
producing engine, intention, transaction and `cause` ids where they apply, the required payload, and every read
failure, gap and recording boundary. A hash proves a payload changed but cannot reconstruct it, so hashing is kept for
unmapped classes only as an integrity check. Each protocol declares its **required event classes** before it runs;
they are mapped (payload stored whole). A missing required payload makes every check that needs it `insufficient`,
never a silent pass. **Observer failure policy:** where evidence is mandatory, a failed read or stopped observer makes
the run non-reportable for those checks; it never yields a passing verdict on missing records. **Inertness covers
randomness:** recording consumes no draw from any simulated stream (V1 extended). **G-unread stays** (Kernel check):
external observers, including a read-only live dashboard, may watch progress; no simulated mechanism consumes History's
records or scores. The check is strengthened by a failing-fixture test per engine (V2).

**Recording by need (Rex 2026-11-03).** Two kinds: **events**, whose payloads are kept whole where a check needs them
to explain actions, transfers and outcomes; and **samples**, the state values a protocol names, read at the period it
declares (`samples: [{measure, every_ms}]` in the protocol file). Nothing else is promised. Automatic deletion and
compression wait until run sizes justify them, after each protocol states what it preserves.

### 3.1a Run identity, seal and replay (HI-2, new, proposed)
Run identity = {code versions, model data, initial state, protocol, seeds, external inputs}, a specification rather
than one equation. It names Catalogue content, Life composition data, Reality property models, scheduler
configuration and every fixture assumption. The protocol and input manifest are **sealed before execution**; the
output manifest is sealed after; the verdict cites both seals and is computed against the sealed protocol, never by
rereading an edited plan. Originals are preserved, never replaced. A replay that differs, or a dependency whose hash
changed, fails V3.

### 3.2 `history.aggregate.series` (implemented, DESIGN §4.2)
Observation rows + scope membership → `sum | count | max | share | classify@v` per scope → Aggregate rows. Across a
resolution switch the series is one line: coarse value is the owner's conserved aggregate, fine value the sum over
individuals; `continuity` (`src/aggregate.ts:108`) flags a jump beyond the owner's tolerance. Scope membership is
read at checkpoints only (a mover counts where it was at the checkpoint).

**Continuity at the switch (Rex 2026-11-03).** The current `continuity` compares the last value before the switch with
the first at or after it, so legitimate activity in between looks like a jump. Replacement: compare the coarse and the
fine representation **at the same simulation instant** (the switch records both at `from_t`); where only rows either
side exist, reconcile them with the recorded flows between (`after − before − Σ flows`). Neither available gives
`insufficient`. The question is only whether the change of representation created or destroyed anything. V22.

Corrections (HI-4): the sum identity `X_total = Σ_g X_g` is applied only to **disjoint partitions**; overlapping
memberships (a person in several organisations) are never summed as if they were several people. Every share
`p = n_matching / n_eligible` records its denominator, its coverage and its interval, and a complete zero is kept
distinct from missing observations. **State and flow differ:** residence at a checkpoint does not place the work,
consumption or transfers of the preceding interval; flows are attributed from their own events.

### 3.3 `history.eval.indicators` (implemented scores; indicator wiring planned, DESIGN §2, §4.5)
Aggregates + comparison dataset + typology version → per-checkpoint `e_k = ln(sim/hist)` with the range and zero rules
(Rex, HIST-Q3) → `S = max(0, 1 − mean|e_k|/ln 2)`, plus TV, Jaccard, event-F1, adoption, share scores
(`src/scores.ts`) → Score rows; combined score is the mean over indicators that have both data and a quantity
(missing ones are listed, never scored 0). I1–I11 sources and today's availability: DESIGN §2 table, carried forward.

**Reading the score (HI-8).** S is a declared scoring convention, not a percentage of realism: S = 0.8 does not mean
"80 % realistic". S reaches 0 at mean |e| = ln 2, a uniform factor-of-two discrepancy. Log error measures relative
discrepancy, so near-zero references can give extreme ratios for small absolute errors. Every Score row therefore
keeps the raw simulated and reference values, the absolute error and the log error. Zero error inside a reference range
is labelled **interval compatibility**, not exact agreement. A zero-rule comparison also reports its underlying
discrepancy. A combined score always shows its coverage, so a missing hard indicator cannot make a run look better.

**Raw discrepancy first (Rex 2026-11-03).** Each Score row's primary field is the raw discrepancy (`e`, and `e_log`
where it applies) with unit, reference uncertainty and the protocol's criterion. A validation check passes or fails
on that criterion; S and the combined score are optional display and never enter a `Verdict`. Omitting a hard
indicator cannot turn an incomplete experiment into an accepted one: a required check without evidence makes the
validation verdict `insufficient` whatever the remaining score (V21). Two conventions are labelled on every row that
uses them: the **zero rule** (a zero comparison gets the fixed magnitude ln 2, Rex HIST-Q3) and the **adoption
normaliser** (date difference ÷ 50, a DESIGN convention, `src/scores.ts`); neither is a scientific tolerance, so a
protocol judges these on the raw difference and its own margin.

**Abandonment by duration (Rex 2026-11-03).** The current rule (two consecutive zero-resident samples) means different
things at hourly and yearly sampling. Replacement: abandoned when the observed vacancy lasts at least the protocol's
`T_vacancy`, and the recorded residence events show no resident between the zero samples. Sparse samples without
supporting events give `insufficient`, never invented continuity; a `null` `T_vacancy` gives `insufficient`. V23.

**Event matching (defect, confirmed in review).** The current event scorer matches closest dates greedily, which can
lose valid matches: with a window of 2, simulated {0, 3} against reference {2, 5} gives one greedy match (3↔2) where
two are possible (0↔2, 3↔5). Replacement, per event label, with sorted scalar dates and a fixed symmetric window w:
a two-pointer sweep (if |s_i − r_j| ≤ w match and advance both; else advance the earlier) gives maximum match count.
It does not guarantee minimum total date error among maximum matchings; if that matters, a protocol states it as a
separate secondary objective. It is not generalised to uncertain date intervals or extra constraints. Test V17.

### 3.4 `history.eval.ensemble` (implemented, DESIGN §7)
Signed errors over N derived seeds `fnv1a32('<target>/'+i)` → bias `b`, variance `v`, `MSE = b² + v`, systematic share
`b²/MSE`, sign test, 5–95 % coverage → verdict systematic / stochastic / insufficient (`src/ensemble.ts:84`). A
systematic verdict opens an investigation with the registry keeper; on held-out targets it never opens tuning.

Corrections (HI-8): not detecting a consistent bias does not show the error is purely stochastic, so the `stochastic`
label is renamed **"systematic bias not established by this test"** (a code change in `src/ensemble.ts`, a unit after
approval). Each protocol selects and labels its sign-test sidedness: §7.1's 9-of-10 p ≈ 0.011 is one-sided, while
`signTest` is two-sided. Ten seeds is a pilot size for a sign claim, not an adequacy guarantee for tails, rare events or
distributional claims; those claims declare their own N.

**Explicit findings (Rex 2026-11-03).** The automatic class is dropped: no `systematic`/`stochastic` verdict from sign
tests and a bias-share threshold. The ensemble reports, per checkpoint: observed mean discrepancy `ē`, variation
across runs, `MSE = ē² + (1/N)Σ(e_i − ē)²`, the uncertainty under the protocol's declared method (sign test with its
sidedness, or another named method), whether the declared criterion is met (`null` criterion → `insufficient`), and
the missing evidence. **Both data dimensions are reported:** the number of checkpoints and the repetitions per
checkpoint; five checkpoints of one run each are not five repetitions. A failed criterion opens the investigation that
a `systematic` verdict used to open. Supersedes the rename in the correction above.

### 3.5 `history.protocol.milestone` (new, proposed): the paired-arm protocol
Input: a protocol file (§7.1) naming the scenario, the two arms and the **one** configuration difference between
them, the seed list, the steps, the checks and each check's owner-declared tolerance. Computation: the harness runs
every (arm, seed, step) combination with the observer attached, plus one detached rerun per arm for G-inert; the
evaluator applies the checks to the records. Output: a verdict file naming the protocol hash, every run id, every
check's result and its evidence row ids. Changes: the milestone's status in the registry (through the registry
keeper's re-audit), nothing in any engine. Applies when every Need of that milestone is landed; before then the
protocol is written but not run.

Arms: **provisioned** (the scenario's resources make survival possible) and **deprived** (one declared difference
removes it: less food in reach, food out of reach, less labour capacity, a dry season, waste exported). The deprived
arm must pass through Life's declared intermediate states in Life's declared order to incapacity or death (Life
PLAN pass 1: glycogen gone → ketosis → wasting → starvation crisis → host-declared death; INTEGRATION-PLAN IT-M1a-D;
the fat and mass floors are Life's open LIFE-25; HIST-14);
History checks the order and records the times, it never defines the states. **Outcomes are recorded, never tuned:**
the protocol file is hashed before the first run; any change to it after a run is a new protocol with a new hash, and
the old verdict stays in the record. A death in the provisioned arm is a finding (an investigation issue), not a
reason to adjust.

Additions (HI-6): the protocol file is sealed with the input manifest (§3.1a). Arms are paired by **common random
numbers**: matching seeds is not enough, because a changed step or configuration can change the number and order of
draws. The protocol therefore requires stable stream identities (one named stream per mechanism and person) and, where
feasible, draws coupled to the same underlying events; where coupling is not feasible it says so, and the paired
difference is still valid but may lose its variance reduction. A claim that one factor was **necessary** for an
outcome is made only from a counterfactual arm that changes that factor and holds the declared rest, never from a trace
alone. The **learning test** separates changed hunger from changed knowledge: a control with identical pressures,
actions, parameters and sensory inputs, so a difference in the evaluation of eating is attributable to learning
(Cognition owns what each arm switches; CN-7 below).

### 3.6 `history.eval.fate` (new, proposed): the mechanism trace for every person (HI-5)
History records the simulated sequence and its contributing conditions; it never fabricates one explanation where
several mechanisms contributed, and a trace is not causal proof (necessity needs a counterfactual arm, §3.5).
Input: one run's record. For **every person who entered the tracked population** during the run, including those who
left scope before the end:

1. **Outcome** from Life's ports and state history: alive, incapacitated, dead, or **terminal state reached**. "Terminal
   state reached" stays distinct from a validated death mechanism; it applies while Life's terminal criterion is
   unsourced (LIFE-25), and the harness declares death exactly when Life's criterion is met (NP-11). "Alive at run end"
   does not mean no reserve crossed an incapacity threshold: recovery is possible, so every crossing and recovery in
   Life's actual state history is listed.
2. **Mechanism trace** (all persons): the recorded steps, each with row ids. For a death: the death row (Life ledger,
   `realism/src/crisis.ts:85-87`) → its crisis (opened when a reserve or organ crossed Life's floor) → that reserve's
   series and budget over the window (journal inflows into the body's account, Life's expenditure) → the person's
   decisions, intentions and outcomes in the window.
3. **Contributing conditions**, from a versioned table (measurement, level 4), **any number per person, not one
   exclusive class**: no food perceived in reach; an attempt failed (with its reason); eating evaluated and not selected
   (Cognition's recorded alternatives, M1a-27); intake below expenditure; another crisis cause. Example: food was
   available but not perceived; an attempted alternative failed; reserves then crossed Life's declared threshold.
4. **Intake ancestry.** In the self-feeding fixture every intake traces through `cause` to the eater's intention and
   its need signal. Assisted feeding and later pathways declare their own valid causes; the rule is not applied to them.
5. **Incomplete** = a broken `cause` chain, a missing required payload, or a death with no recorded step. Incomplete
   evidence is reported `insufficient` and never replaced by a confident explanation; an incomplete death fails the
   trace check (extends A4, `src/x1/acceptance.ts:144`).

Output: `fate.jsonl` per run beside `report.json`. Changes: nothing; it is the answer to Rex's "why did they die"
(PLATFORM §11a), traceable row by row. Stops applying where an owner does not emit the needed rows: today crises and
deaths live on realism's in-world trace, not on the kernel bus (`events.json` has no death or crisis event;
confirmed 2026-11-02), so the trace cannot run until Life emits them as kernel events with `cause`. That is now
agreed: Life emits `body.crisis` and `body.death` through its process ctx, the harness resolver never does
(INTEGRATION-PLAN M1a-25). The decision rows for "evaluated and not selected" come from Cognition's `cognition.decision` event (M1a-27).

### 3.7 `history.check.transfer_once` (new, proposed): accounting and exactly-once (HI-3)
Enforcement is Kernel's and the state owners' (Rex 2026-11-02): they commit, roll back and refuse. History
independently checks the recorded commit evidence afterwards and never affects execution. Two checks, both required;
the second is a backstop, never a replacement for the first.

1. **Per transaction, at commit.** For each committed transaction, by transaction id and leg id: each declared leg has
   exactly one journal entry (`kernel/src/transfer.ts:28`), its debit owner's account changed by −q and its credit
   owner's by +q at its port, within tolerance. Exactly-once is judged by transaction and leg identity: one intention
   may legitimately produce several transfers or several committed movement steps. This is the check that catches an
   equal-and-opposite pair (−1 and +1) inside an interval, which would cancel in the residual.
2. **Over the reporting interval.** For account a and quantity q:
   `r_{a,q} = X_{a,q}(t₁) − X_{a,q}(t₀) − Σ_e Δ_{a,q,e}` over every recorded change e, and pass when
   `|r| ≤ ε_abs + ε_rel · S`. Each check declares its scale S, units and tolerance sources before the run. Candidate
   (proposed, not universal): `S = max(|X(t₀)|, |X(t₁)|, Σ_e |Δ_e|)`, all in the quantity's units; large transfer
   volume can make it too generous, so each owner confirms or replaces it. Exact integer counts use exact equality. **Shared contract (Kernel proposal 2026-11-03, agreed with amendments):** the
   owner's declared `tolerance(q)` object `{abs, rel, scale: 'span' | 'current'}` is the same one the kernel reconciler reads;
   History calls the kernel's exported pass function over its reporting interval, never a second threshold; `span`
   accumulates Σ|Δ| per leg (never the net sum); nothing declared → `insufficient`.
   Concurrent legitimate activity is allowed: the old rule "no other process changes either account at that instant"
   is withdrawn.

**Authoritative writers.** Neither check can reconstruct an illicit intermediate change that was never recorded, so
the check also requires that each account is written only by its declared owner (Kernel's registry rule), and reports
an undeclared writer as a failure. **Independence.** The debit, credit and journal are valuable cross-checks but not
automatically three independent measurements: they may share implementation. Faults are injected into each path
separately (V14) to show the checker detects each disagreement. The quantities are compared, never summed into a
History ledger.

### 3.8 `history.check.step` (new, proposed): step sensitivity and equivalence (HI-7)
Input: the same protocol at the owner's reference step Δ₁ and a second step Δ₂ the owner declares tested (body today:
60 s reference, 600 s or 1 s per STEP-CONVERGENCE.md, 2819 fbecd32; HIST-11), with common random numbers (§3.5).
For paired runs, `d_i = Y_i(Δ₂) − Y_i(Δ₁)`. The owner states a scientifically justified **equivalence margin ε**
before the run (read from its PLAN.md §7; none stated → `insufficient`). Pass (**equivalent**) when the uncertainty
interval of the mean paired difference lies inside [−ε, +ε]; outside it, **not equivalent**; evidence too weak to
decide, **insufficient**, never "equivalent". The withdrawn rule (difference within `2·sqrt(v₁/N + v₂/N)`) made noisy
models easier to accept. Discontinuous outcomes such as death use a predeclared event-time or outcome-distribution
check. Two steps establish sensitivity between those settings, not general convergence; an unresolved result is
refined further. The **integration step is kept separate from decision opportunities**: changing how often someone can
reconsider is a model change, not a numerical refinement, and is never varied by this check. A verdict that changes
with step is a numerical finding for the owner (as LIFE-13 was), never smoothed by History.

### 3.9 `history.check.recompute` (new, proposed): an independent recomputation
A Haiku unit recomputes every check of the verdict from the record files and the protocol alone, without importing
`@rex/history` code, and must reach the same verdict. A disagreement fails the milestone until resolved. This is the
"agent testing its own implementation is not independence" rule (PLATFORM §11a) applied to History itself.

### 3.11 Host resolutions for `eat`, `take`, `gather` and `move`: the evidence History needs (HI-5)

**Ownership (Rex 2026-11-02 review, amends REG-39; HIST-16):** Kernel and the action owners own the resolvers'
execution behaviour. History specifies only the evidence a milestone needs to accept them and does not redesign the
resolvers. The rules below are DC-13's (2026-11-02, Economy, Life, Kernel) as History reads them; the corrections
marked **flag** are plan inconsistencies passed to Kernel and the owners through the registry, not findings that the
built code fails. It follows the `work` precedent (DESIGN §3.8, kernel 5006); owners per kind: INTEGRATION-PLAN §2a.

- **One intention, one declared terminal outcome.** The resolver calls the owners' commands with `resolvedBy: 'host'`;
  they tag their records and emit no outcome. After commit or rollback, outside any transaction, the resolver emits
  exactly one terminal `shared.action.outcome` with `cause` = the intention id (the bus is a transaction participant,
  so an emit inside a rolled-back attempt would vanish). **Flag:** "one intention = one transaction" is withdrawn; an
  intention may span several committed steps (a multi-epoch move, HIST-15) and History traces each step to the one
  terminal outcome.
- **`impossible`** is decided before any transaction from the owners' precondition reads (a dead body, gut function 0,
  0 kg at the source, out of reach, REAL-40). No transfer; the reason is the owner's. **Flag:** unknown food (missing
  required composition) is a configuration failure or unsupported modelling, not a lesson about edibility; History
  requires that it is never recorded as `impossible`, and it makes the affected checks `insufficient`.
- **`failed`** is a rollback or an owner's refusal (Economy's `refused`). **Flag:** a technical rollback restores that
  transaction; an interrupted physical activity may keep earlier committed progress and expenditure, charged once
  through Life's MET path. "Failed actions have no transfers" holds only for the rolled-back transaction.
- **`completed`**: the journal entries carry the cause. Death is never emitted here (M1a-25).
- **Flag, emitter identity:** the resolver emits outcomes, so "no outcome has the host as source" contradicts it.
  History requires one declared resolver source id (Kernel names it) on every outcome, and no crisis or death event from
  that source.
- **Flag, signal timing:** "eating lowers the next evaluation" is withdrawn. History checks Life's declared hunger-signal
  timing and the controlled learning response (§3.5), not an immediate universal decrease.

| Kind | Preconditions (owner) | Legs inside the transaction | Quantity |
|---|---|---|---|
| `eat` | reach: same place or a graph edge (Reality); body able to eat (Life); food known (`Good.food`, CG-19) | Economy writes **one** `transfer()` of kg, eater's or household's inventory → Life `life.gut` (M1a-17); `eatMeal` never writes the mass again | `q = min(terms.kg, available kg, gastric room)`. While room is unsourced it is `null`, imposes no limit, and the record says so |
| `take` from the household | reach (Reality) is the only physical precondition. Authorisation (household membership, Society; `hasRightOfUse` and declared household rules, Settlement) never blocks a physically possible take; it is recorded on the outcome as `authorised`, `unauthorised` or `unjudged` (INTEGRATION-PLAN rev 3, RC-3, Rex). Detection and punishment are separate later events | none when the larder is the eater's household: the `eat` transfer debits it | — |
| `gather` | reach and mechanical demand (Reality); effort (Life) | Life `plant_state` → person inventory or gut, one transfer (IF-42) | the source's right of use: **open** (M5; INTEGRATION-PLAN M1a-13c). No source says untitled land is free to take, so the host checks only what Settlement holds |
| `move` | `world.position`, distance, grade (Reality); speed V, capacity (Life) | body energy → potential energy, written by Reality as one transfer; position by Reality; metabolic cost by Life (Pandolf, Life's) | how a move that lasts several epochs is committed (at the start with an arrival time, or step by step) is **open**, for Kernel and Reality (HIST-15) |

Gate checks, carried by the M1a protocol and IT-M1a-3:

- **E1:** every intention has exactly one terminal outcome whose `cause` is its id; every committed step of it is
  `cause`-linked to it, and those links survive replay.
- **E2:** each committed transaction has one journal entry per declared leg, with debit = credit (§3.7); `impossible`
  gives none; a rolled-back transaction leaves none of its own.
- **E3:** a forced technical failure in any leg restores that transaction's accounts (snapshot hash before = after).
- **E4:** every outcome's source is the declared resolver id; no crisis or death event has that source.
- **E5:** G-inert with the observer attached and detached.
- **E6** (INTEGRATION-PLAN M1a-20, at Economy's request): the trace can be recovered from the record whether or not a
  transfer happened.
- **E9** (IT-M1a-7 rev 3): three `take` cases. A member's take is recorded `authorised`. A take forbidden by a declared
  household rule succeeds once and is recorded `unauthorised`. A take with no applicable rule is recorded `unjudged`.
  No take that reach allows is blocked by authorisation, and no detection or punishment event shares the take's
  transaction.

**Early RG-5 check (INTEGRATION-PLAN rev 3 §2c, at B0), on synthetic reports:** two separate assertions.
(1) Information isolation: a person's beliefs change only from reports that person received. (2) Belief updating,
run under each report's declared credibility: the change matches the declared rule, and an unchanged belief can be a
correct result. History records both verdicts separately (V20) and reports implementation, integration and validation
apart, as INTEGRATION-PLAN §2d B4 asks (§0).

**Technical failures (Rex 2026-11-02, Cognition PLAN A.11.2, INTEGRATION-PLAN M1a-20):** a rollback or a harness
fault must still settle the intention. The harness does one of two things:

- retries explicitly, with the same intention id and exactly one later outcome; or
- emits exactly one `shared.action.outcome {status: failed, reason: technical}`.

A cancel with no outcome is not allowed. Cognition's adapter treats a technical failure as empty perceived feedback:
the intention closes and nothing is learned. The resolver's true cause goes only in a `diagnostic` field, which the
record keeps whole; it never goes in the stimuli. E1 therefore covers technical failures too. A new check, **E8**:
every `reason: technical` outcome has a `diagnostic` field and no stimuli derived from it, and every retry reuses the
intention id and yields exactly one outcome.

**Accepted by Rex 2026-11-02 (Cognition PLAN A.10 / CN-1, INTEGRATION-PLAN M1a-13):** on `body.death` the host stops
scheduling that person's mind, so no decision runs from absent signals. Gate check **E7**: no
`cognition.decision` or intention event for a person after that person's `body.death`.

**Outcome payload for `eat`** (also M1a-20). Stable ids and `cause` link the intention, the host outcome and any
journal entries. The payload carries:

- `requested_kg` (from `terms.kg`);
- `food` (the resolved food id) and `composition_version`;
- `accepted_kg` and `executed_kg`;
- `reason` for a refusal or a partial result;
- `transfers` (the journal entry ids, empty if none).

Economy supplies `takenKg` and its `refused` event; Life supplies its precondition reason and composition version.
Each carries the intention id as `cause`. The host only copies them into the payload and computes nothing itself. The
observer stores this payload whole: it is a mapped event class, `economic`, in `data/event-classes.json`, added by a
composer unit after approval.

### 3.10 Designed, not built (carried from DESIGN, unchanged)
`history.init.bundle` (DESIGN §4.4, t0 load from a Catalogue bundle, round-trip V7; it queries **both** the village and
its ancestor region England, because Catalogue `window()` returns descendants, not ancestors (Catalogue keeper,
2026-11-02), and records both bundle ids in `init_bundle`. Scaling England-wide rates to one village is a modelling
rule. Each quantity's owner specifies it (Life yields, Economy prices, Settlement households; Rex 2026-11-02). History
only applies it at t0 through that owner's loader and records it in the RunHeader as
`scaling: [{quantity, owner, rule_ref, source, label}]`. A rate with no owner's rule stays unscaled and is flagged.); `history.check.resolution`
(DESIGN §4.3, fine vs coarse 50-year village within 10 %); `history.baseline.sdt` (DESIGN §4.7, kind `baseline`);
Seshat datasets (DESIGN §4.8, HIST-4); typology tables (DESIGN §2).

## 4. Inputs and outputs

All reads are `declareInput`, read-only, at the `record` phase after every engine process of the instant. Failure
behaviour for every row: a failed read writes `null` and counts it; a thrown error stops the observer and marks the
run non-reportable; nothing propagates into the scheduler, and there is no rollback because History writes nothing
another engine holds.

| Quantity | Producer | Unit | Timing | Used by | Today |
|---|---|---|---|---|---|
| bus records (id, t, source, type, cause, payload) | Kernel | — | every checkpoint | 3.1, 3.6, A4 | yes (full copy; 2944 for incremental) |
| snapshot hashes | Kernel / host | fnv1a64 | each checkpoint | G-inert | host-supplied (`harness/x1-0.ts`) |
| `TransferJournal` entries | Kernel | per quantity | each instant | 3.7 | journal exists; not yet read by History |
| `body.alive`, reserves (energy, water), hunger signal, `body.capacity_functional` | Life | J or kg, dimensionless, N / W | checkpoint (daily; finer for M1a) | 3.5, 3.6, M1a–M2 | alive yes; capacity is N5 (DUP-15) |
| crisis open/close, death with cause | Life | event | when they occur | 3.6 | Life emits `body.crisis`, `body.death` (M1a-25, agreed); not built |
| intermediate states and floors | Life | declared table | protocol time | 3.5 | Life PLAN pass 1 order; floors open (LIFE-25) |
| intentions, decisions with evaluated alternatives, outcomes with reasons | Cognition / host | event | when they occur | 3.6, A4, M1a | intentions yes; alternatives recorded per SC-5, not yet as kernel events |
| inventories, consumption, prices, wage quotes | Economy | good units; kg via Catalogue mass | daily | M1a, M5, I4 | yes; kg per unit is CAT-5 (HIST-10) |
| posts, hires, titles, ledgers | Settlement | count, money | daily | M2, M5 | yes |
| position, path, travel time, metabolic cost of walking | Reality / Life | m, s, J | per movement | M1b | no walking model (gap G-L1) |
| soil water, N/P/K, light, plant biomass, harvest | Reality, Life | kg m⁻², kg | daily | M3 | N1, N2, N3 |
| waste mass, decomposition to soil | Life → Reality | kg (C, N) | daily | M4 | not built (gap G-R1) |
| authority, offices, taxes, trade | Government, Economy, Society | — | daily | M5 | not built |
| bundles, unit masses, calendars, datasets | Catalogue | labelled | t0 / offline | 3.10, I4 | N13, CAT-5 |
| tolerances per check | each owner | per quantity | protocol time | every check | read from owners' PLAN.md §7 (HIST-13) |

Outputs: run directories, Score rows, verdict and fate files; consumers are reports, the registry keeper's re-audit and
Rex. No engine consumes any of them (G-unread).

## 5. Evidence

| Item | Source | Label |
|---|---|---|
| Record, aggregates, hashes, transfer-once, recompute | bookkeeping and arithmetic | level 1 (established); no parameter |
| Log-error score, range and zero rules | ROADMAP P11a I1; amendments Rex 2026-10-31 (HIST-Q3) | definition (Rex) |
| `MSE = b² + v` | algebraic identity | level 1 |
| Sign test, binomial tail | exact binomial | level 1; thresholds (α 0.05, share 0.5, 5 points) assumption, stated in every report |
| N = 10 seeds per arm | 9 of 10 one-sided p ≈ 0.011 (11/1024) | assumption (keeper): a pilot sized for a sign claim, not for spread, tails or rare events |
| Step check | paired difference with a predeclared equivalence margin (Rex 2026-11-02 review) | method (Rex); margin ε per owner |
| Reconciliation scale S | candidate `max(|X(t₀)|, |X(t₁)|, Σ|Δ|)` | proposed; each owner confirms or replaces |
| Event matching | two-pointer sweep, maximum cardinality within a fixed window | level 1 (algorithm) |
| Contributing-conditions table, typology tables | the keeper's classification over owners' rows | level 4, versioned |
| Intermediate states, floors, tolerances, steps | Life, owners | owners' PLAN.md §7 and Life's PLAN (HIST-13, HIST-14, keeper items); Rex only where a source leaves one open |
| SDT baseline | Turchin & Nefedov, *Secular Cycles* (2009) | level 5 |
| Seshat data | Seshat Global History Databank | measured; licence unchecked (HIST-4) |
| Walking model for M1b | none chosen; the owner picks (candidates in the literature include load-carriage equations of the Pandolf type) | open, owner's |

## 6. Status (designed · implemented · connected · numerically checked · empirically validated)

| Mechanism | Des. | Impl. | Conn. | Num. checked | Emp. validated |
|---|---|---|---|---|---|
| 3.1 record.backend | yes | yes (2848, 2849) | three-engine harness (S0, 2940) | V1–V4 pass on S0 | n/a (bookkeeping) |
| 3.2 aggregate.series | yes | yes (2850) | S0 money/goods/population | sum identity on S0; continuity untested on a real Resolution | n/a |
| 3.3 eval.indicators | yes | scores yes (2851); indicator wiring no | no | synthetic tests | no target runnable |
| 3.4 eval.ensemble | yes | yes (2852) | no | planted bias / noise (`test/ensemble.test.ts:45`) | no |
| X1 A1–A4, G-inert | yes | yes (2853) | G-inert on S0 only | synthetic tests | no |
| 3.1a run identity, seal | this plan (manifest hashes exist, `src/writer.ts:16`) | partly | no | no | n/a |
| 3.5 protocol.milestone | this plan | no | no | no | no |
| 3.6 eval.fate | this plan | no (A4 death-cause check only) | no | no | no |
| 3.7 check.transfer_once | this plan | no | no | no | no |
| 3.8 check.step | this plan | no | no | no | no |
| 3.9 check.recompute | this plan | no | no | no | no |
| 3.10 init, resolution, SDT, Seshat, typologies | DESIGN | no | no | no | no |

## 7. Validation

### 7.0 History's own tests (DESIGN §8, carried forward)
V1 G-inert · V2 G-unread with a failing fixture · V3 replay · V4 order · V5 sum identity · V6 continuity · V7 init
round trip · V8 hand scores (Haiku) · V9 perfect / factor-2 · V10 fine vs coarse · V11 X1 A1–A4 · V12 reconstructions.
New: **V13** mechanism trace on synthetic records, one per contributing condition and one with several at once, a
person who left scope early, a survivor who crossed and recovered, and an incomplete chain that must report
`insufficient`; **V14** accounting on a synthetic journal with a double entry, a missing debit, an unrecorded change,
an equal-and-opposite pair inside one interval (caught per transaction, missed by the residual alone), an undeclared
writer, and a fault injected separately into the debit, credit and journal paths: all must fail; **V15** step check on
a synthetic pair with a planted step defect (must be detected) and a pair differing only by stochastic noise (must not
be called a defect), plus a weak-evidence pair that must be `insufficient`; **V16** a Haiku recompute agrees with
V13–V15 and V17–V19; **V17** event matching {0, 3} vs {2, 5}, window 2, gives 2 matches; **V18** a missing required
payload and a stopped observer each give `insufficient`, never pass; **V19** the observer draws no random number
(stream positions attached = detached); **V20** RG-5 on synthetic reports: a belief changed by a report the person
never received fails isolation, and an unchanged belief that the declared rule predicts (low declared credibility) passes updating. **V21** an experiment missing a required indicator stays `insufficient` even when its remaining score rises; **V22**
continuity: activity between two samples around a switch is not a jump, a representation change that creates mass is;
**V23** abandonment: zero samples a year apart without residence events give `insufficient`, an event-supported vacancy
of at least `T_vacancy` gives abandoned; **V14 adds** +1 in one store and −1 in another with no transfer: the world
total balances (X1 A1, kept as backstop) and the per-account checks fail. V1 and V3 extend to random streams and to sealed-manifest replay. All
mechanism level (§11b), no engine needed.

### 7.1 How History measures each milestone

Common to every milestone (the protocol, §3.5): two arms differing in one declared item; seeds `fnv1a32('M<n>/'+i)`,
i = 1…10, the same in both arms, with common random numbers (§3.5); a sealed protocol and input manifest (§3.1a); a
second step per owner with its equivalence margin (§3.8); G-inert on one detached rerun per arm; replay of seed 1;
per-transaction and interval accounting on every named flow (§3.7); a trace row for every person who entered the
tracked population (§3.6); the Haiku recompute (§3.9); the three verdicts (§0). A check passes in a seed or not; a
sign claim passes at ≥ 9 of 10 seeds (one-sided, labelled). Tolerances are read from the owners' PLAN.md §7 (HIST-13); a check whose owner states none is reported `insufficient`, never given a History number.

| M | Arms (the one difference) | History checks, from the record | Engines measured |
|---|---|---|---|
| **1a** adjacent consumption | on a **labelled test-fixture household** (Rex 2026-11-02, Catalogue PLAN §8 stage B; RunHeader `init_bundle` = the fixture id, every value labelled fixture, not a documented village). Provisioned: food in reach covers expenditure · deprived: the same household with too little food in reach | chain per eat: need signal → intention → acquire → eat, each `cause`-linked; each transaction's legs once, inventory −q, body +q, one journal entry per leg, plus the interval residual (3.7); the hunger signal follows Life's declared timing; the controlled learning comparison (§3.5) separates changed hunger from changed knowledge; deprived arm passes Life's states in order to incapacity or terminal state (HIST-14); trace row for every person; fixture limits stated in the report | Life, Cognition, Economy, host |
| **1b** locomotion | food at distance d reachable within reserves · food at a distance not reachable before incapacity | the M1a chain plus a move: path length and slope from position series; travel time = path / owner's speed; metabolic cost recorded vs the owner's walking model recomputed by Haiku from distance, slope, load; fatigue series moves with effort | Reality, Life, Cognition |
| **2** work and replenishment | rested, fed workers · underfed or fatigued workers | hours from §3.8 `work` resolution (H1–H4); capacity (force, power, endurance) series falls with work and recovers with rest and food; output follows capacity; a static check that no process reads an added success-probability for the task; food bought or grown by the work reaches bodies (3.7) | Life, Settlement, Economy, host |
| **3** growth | normal precipitation (declared boundary input, Rex HIST-Q2) · dry season (N8) | daily soil ↔ plant water and N balance (S1); harvest = biomass removed (S2, 3.7); yield lower in the dry arm (sign); the weather input appears in the RunHeader `boundary`, never an outcome | Reality, Life, Economy |
| **4** recycling | waste returned to soil · waste exported across the boundary | N (and C where tracked) balance over soil, plant, inventory, bodies, waste pool; waste body → soil as one transfer each; next-season yield differs by arm (sign); multi-season record volume measured (N11 if > 10⁶ records) | Life, Reality |
| **5** social organisation | open: to specify with the Economy, Settlement, Government and Society keepers | identity checks: every holder, worker, taxpayer and trader is a Life person id; every stock is one account (no second ledger); ownership changes move titles, not mass; taxes and trades are journal transfers; prices and who eats move with scarcity (X1 A2) | Economy, Settlement, Government, Society |

X1 (DESIGN §3) is the combined run of M1a, M2 and M3 with Economy's price response: S3–S5 measure M1a, S6 measures M2,
S1–S2 measure M3, S7 is the combined X1. Reconstructions (H1–H5, P11a–c) come after M5 and use §3.3–3.4.

**CN-7 (approved, Rex 2026-11-02; accepted earlier in the Cognition review):** IT-M1a-4 gains three arms inside the
M1a protocol, on the same derived seeds:

- **(i) a control:** identical current pressures, actions, parameters and sensory inputs. It compares first the
  predicted consequence and then EU(eat), each read from `cognition.decision`.
- **(ii) a no-learning arm.**
- **(iii) a competing-cause arm.**

Cognition owns their implementation and what each arm switches; History measures the results only. All three run in
the M1a protocol (HI-6's acceptance case: the learning test distinguishes changed hunger from changed knowledge).

**X1 moves to England 1270 and joins the ladder (proposed, for Rex; REG-38).** Rex put M1a in England 1270 with
cereals, and that world carries forward. So X1 becomes the ladder's combined run (M1a + M2 + M3 with Economy's price
response) in that world, not a Caribbean experiment beside it:

- One set of data to source: Catalogue cereal substances and unit masses, Life cereal composition and plant profile,
  and Reality England soil and weather.
- History's measurements and seams stay as specified. The dry arm still needs N8, now as an England precipitation
  boundary series.
- The Caribbean cassava and plantain rows stay in Life as reference.

The cost of the move: X1 waits on England soil and weather data, which no engine holds today. Splitting X1 off would
mean sourcing two worlds.

**Against the registry's map (`HQ/handoffs/registry/INTEGRATION-PLAN.md` §2, mapped, not yet reconciled):** each
owner writes its own IT-M1a test; History's protocol is the run that reads all of them from one record. History's
M1a checks carry: IT-M1a-0 (replay) → V3; IT-M1a-1 and IT-M1a-4 (hunger from state, satiety → next priority) → the
"hunger falls, next evaluation lower" check; IT-M1a-3 and IT-M1a-5 (one transaction, one debit) → §3.7 transfer-once;
IT-M1a-P/D → §3.5 with §3.6 fate rows. Excreta close to a declared `loss:excreta` boundary account until M4 (M1a-19). History's
own rows in the map are M1a-00 (X1 harness) and M5-12 (events to History); History confirms both.

### 7.2 X1 Needs N1–N13 mapped onto milestones and owners

| Need | What | Owner | Milestone | Seam | State |
|---|---|---|---|---|---|
| N4 | food into bodies through inventories (DUP-21, IF-36) | Economy → Life | M1a | S3 | open |
| N5 | Life writes Cognition's body inputs, `body.capacity_functional` (DUP-15) | Life → Cognition | M1a (hunger), M2 (capacity) | S4 | open |
| N6 | consumption from individual choice (IF-26) | Cognition → Economy | M1a; labour offers M2 | S5 | open |
| N9, N10, N12 | adapters, `record` phase and `readonly`, check rule | Kernel | all (instrument) | S0 | met (2784–2786) |
| N7 | population labour through `hours()` (CONTRACTS §16/§18) | Life → Settlement, Economy | M2 | S6 | open; host `work` resolution built (kernel 5006) |
| N1 | soil water and N/P/K | Reality | M3 (and M4) | S1 | open (Reality phase 16) |
| N2 | a cereal food-plant profile (Rex 2026-11-02, CAT-13, supersedes LIFE-Q5's cassava or plantain for X1; cereal ids from Catalogue PLAN §8 stage B) | Life | M3 | S1 | open |
| N3 | harvest as a conserving transfer (IF-42) | Life → Economy | M3 | S2 | open |
| N8 | boundary precipitation port | Reality | M3 | S7 | open (HIST-6) |
| N11 | EventBus compaction | Kernel | M4 / long runs only | S7 | not needed at ~49 k records / 730 days |
| N13 | an England 1270 village bundle (Rex 2026-11-02, CAT-13; Catalogue PLAN §8 stage B) | Catalogue | X1 start (M3 combined), reconstructions | S7 | open (CAT-5) |

Not covered by N1–N13 and needed by the milestones (gaps, to the registry keeper for the integration map):
**G-A1** the eat, take, gather and move host resolutions: now History's to specify (§3.11) and Kernel's to build
(REG-39); **G-F1** crisis and death events: Life's (M1a-25); **G-D1** evaluated alternatives: Cognition's
`cognition.decision` (M1a-27); **G-L1** a walking model and positions (M1b; Reality / Life); **G-R1** waste and decomposition to
soil (M4; Life / Reality); **G-S1** M5's arms and identity checks (Economy, Settlement, Government, Society). History
builds none of them.

## 8. Build order (each stage's smallest useful demonstration; all after Rex approves this plan)

| # | Stage | Needs | Demonstration | Model |
|---|---|---|---|---|
| 0 | 2944 incremental bus read; 2986 repo HANDOFF; 5062 kernel pin at a tag | queued, Needs met (5062 Needs 5153) | S0 unchanged, faster | codex, codex, sonnet |
| 1 (CP-1) | HI-1 record contract and required classes; HI-2 seals (3.1a); HI-3 accounting (3.7); HI-6 protocol schema with CRN and margins (3.5); 3.6 trace; 3.8 step; event matcher, ensemble findings, raw-discrepancy scores, duration and same-instant rules (5628); all on synthetic records with injected defects | none | V13–V15, V17–V23 pass; Composer writes the fixtures; Haiku V16 recompute | codex; composer; haiku |
| 2 | M1a protocol file on the labelled fixture household (arms, seeds, steps; no N13 needed, the village is sourced in parallel for X1; tolerances copied from owners' PLAN.md §7, `null` where none is stated) | stage 1 | a validated protocol file that cannot run yet and says which Needs block it | composer |
| 3 | S3, S4, S5 seam units, then the M1a run | N4, N5, N6, INTEGRATION-PLAN M1a blocking set (M1a-00, -03, -04, -06, -12, -15, -17, -18, -23), G-D1 | **M1a verdict**: chain, once-only transfer, satiety → next decision, fate rows, step check, recompute | sonnet; haiku |
| 4 | M1b protocol and run | G-L1 | M1b verdict | sonnet; haiku |
| 5 | S6, M2 protocol and run | N7, N5 capacity | M2 verdict | sonnet; haiku |
| 6 | S1, S2, M3 protocol and run; `history.init.bundle` (village + England 1270); S7 combined X1 | N1, N2, N3, N8, N13 | M3 verdict; X1 A1–A4 | sonnet; haiku |
| 7 | M4 protocol and run | G-R1, N11 if measured | M4 verdict | sonnet; haiku |
| 8 | M5 protocol and run | G-S1, Government, Society | M5 verdict | codex; sonnet |
| 9 | indicator wiring, typologies, Seshat datasets, SDT baseline, fine-vs-coarse | Society, Government, K&T, HIST-4 | H1/H2 development scores; V10 | codex; composer; sonnet |

Superseded from DESIGN.md: X1's food plant and starting village (DESIGN §3.2 N2, §3.3), now cereals and an England
1270 village (Rex 2026-11-02, CAT-13); `data/x1.json` `food_plant` is updated by a composer unit after approval. DESIGN §6 (X1-0) is done (2940). DESIGN §3.7's seam order is kept and now keyed to
milestones (§7.2). HIST-13 (tolerances) and HIST-14 (intermediate states) are keeper items, read from the owners' plans (controller,
2026-11-02); Rex sees one only where a source leaves it open. G-A1, G-F1 and G-D1 are settled (REG-39, M1a-25, M1a-27); G-L1, G-R1 and
G-S1 stay on the registry's map.

