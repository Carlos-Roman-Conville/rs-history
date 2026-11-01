# History: design (P10–P11, History keeper, 2026-10-31)

**Status: approved (Rex, 2026-10-31)**, through the controller: HIST-Q1 yes (owners write coarse forms and
dynamics; History owns the series across the switch and the fine-vs-coarse check); HIST-Q2 declared, labelled
boundary inputs at a region's edge allowed, never outcomes (X1's dry season is one); HIST-Q3 the score amendments
accepted as proposed, **Rex's definition of the 70 %**; HIST-Q4 X1 starts from a documented village in the Catalogue.
Belt units need the marker `history-design-approved-by-rex`. Marks: **(Rex)** his decision; **proposed** the History keeper's; **open** a question (§9 lists
them, prefix HIST-Q). Evidence levels are PLATFORM §4 (1 law … 6 fiction). Values are **researched** (source),
**estimate** (derivation shown) or **fiction**; a value nobody has given is `null` with a flag, never invented.

Sources read for this draft: `HQ/handoffs/controller/NEW_ENGINE_BRIEF.md`; `ENGINE_MAP.md` §11 and "How they connect";
`PLATFORM.md` §4, §5, §9, §11a, §11b; `ROADMAP.md` P10, P11a–c, X1, executable demonstrations; `ENGINES.md` "History is
the backend record; knowledge of history is Cognition's" and "Success measures"; registry row `history.record.backend`;
`kernel/harness/thirty-days.ts` and its tests; `kernel/src/events.ts`, `resolution.ts`, `snapshot.ts`, `rng.ts`,
`time.ts`; `cognition/DESIGN.md` §0–§3 as the model. (There is no `kernel/harness/README.md`; HIST-1.)

Reading order of this file: §0 the fence, then the three things the controller asked to lead with: **§1 the record
schema, §2 the eleven indicators and how each is measured from engine state, §3 the X1 harness specification**. The
brief's standard sections follow: §4 mechanisms with contracts, §5 interfaces, §6 first executable demonstration,
§7 the ensemble protocol (systematic vs stochastic), §8 validation plan, §9 open questions.

## 0. What History is, and its fence

**(Rex, 2026-10-31)** History is **the backend record of what occurred** in the simulation and the validation
harness. It aggregates, compares against real history, and **never determines what happens; no mechanism in any engine
reads it.** What a person in the world knows of the past is Cognition's (memory, written records, inference from
evidence, oral transmission; rows `cognition.history.*`), and those beliefs, never this record, drive choices. Myth,
propaganda and lost knowledge come from the gap between the record and the beliefs; History never narrows that gap.

**Owns (ENGINE_MAP §11, ROADMAP P10–P11):**

1. The record: an append-only log of what occurred (kernel events, sampled series, snapshot hashes, run headers).
2. Aggregation **of the record**: series per settlement, polity and region, continuous across resolution switches.
3. The resolution hand-off **check** at civilisation scale (P10 test 1: individual and aggregated runs agree).
4. Historical initialisation: turning a Catalogue starting-conditions bundle into each engine's own t0 load commands.
5. The evaluation harness: the eleven indicators (P11a), the generative-plausibility indicators (P11b), the
   cliodynamic baseline comparison (P11c), N seeds per target, systematic error told from stochastic variation.
6. Seshat and cliodynamic models as **yardsticks** (labelled validation data and a baseline model), never mechanisms.
7. X1, the first integrated experiment, specified as a harness run (§3).

**Never owns:** any formula that changes simulated state; polity formation, war decisions, collapse (Government and
Society since 2026-10-31); coarse-resolution dynamics of any engine (each owner's, proposed §4.3); the decision to
refine or coarsen (the host's, proposed, HIST-Q1); reference dates and starting values (Catalogue); calendars as
reference data (Catalogue, proposed); what anyone believes about the past (Cognition); the kernel check script
(Kernel; History proposes one rule to it, §5.3).

**Three structural guarantees (proposed; each is a test, §8):**

- **G-unread.** No process in any `kernel.json` declares a read of a `history.*` quantity; History declares writes only
  to `history.*`. (ROADMAP P10 test 2.)
- **G-inert.** Attaching History changes no byte of any engine's state: the same seeds with History attached and
  detached give identical kernel snapshot hashes (`fnv1a64(canonical(...))`) at every checkpoint. History draws no
  random number, enlists in no transaction, emits no kernel event.
- **G-once.** Initialisation writes engine state only at t0 and only through each engine's own loader; after t0
  History writes nothing outside its record.

## 1. The record schema (proposed)

The record is files, not engine state: one directory per run, append-only JSON Lines, canonical JSON (kernel
`canonical`), each file's hash in the manifest. Nothing in it is a kernel quantity any engine could subscribe to; the
quantity id `history.record` exists only so the registry and the G-unread check can name it.

```
history-runs/<target>/<run_id>/
  manifest.json          RunHeader + file hashes, written last (a run without a manifest is incomplete)
  events.jsonl           EventEntry, in kernel order (t, phase, position, sequence)
  series.jsonl           Observation, one row per (checkpoint, quantity, scope)
  aggregates.jsonl       Aggregate, derived from series rows (ids of inputs kept)
  snapshots.jsonl        SnapshotRef at each checkpoint
  report.json            Score rows (§2, §7), written by the evaluator, never by the run
```

### 1.1 RunHeader

| Field | Type | Meaning |
|---|---|---|
| `run_id` | string | `<target>/<seed>/<config_hash>`; stable, so a rerun overwrites nothing silently |
| `target` | string | `H1`…`H5`, `X1`, `G-<name>` (P11b), `C-<case>` (P11c) |
| `seed` | integer | the kernel run seed (`streams(runSeed)`); all engine streams derive from it |
| `engines` | `{id, package, version, commit}`[] | every package that ran, with its git commit; a dirty tree is recorded as `commit+dirty` and the run is marked non-reportable |
| `config_hash` | string | `fnv1a64` of the canonical initial-conditions bundle and harness options |
| `init_bundle` | string | Catalogue bundle id (e.g. `england-1270`) and the label count by class (researched / estimate / fiction) |
| `boundary` | `BoundaryInput`[] | every exogenous input with its label and source (HIST-Q2); empty means a closed run |
| `epoch` | `{sim_t0: 0, date: <decimal year, proleptic Gregorian>, calendar_note}` | maps sim time to the dates the comparison data use (HIST-9) |
| `checkpoints` | `{period_ms, first_ms}` | the sampling grid (§2: 10 y for H1/H2, 25 y for H3/H4, 1 day for X1) |
| `resolution_plan` | `{entity, mode, from_t}`[] | which entities ran fine or coarse when, as the host decided (History records it, never decides it) |

**Manifest shape (keeper, 2026-11-01, as built in 2848):** `manifest.json` is the RunHeader plus
`hashes: {<file>: fnv1a64(text)}` for the four record files; that nested shape is the contract.

**BoundaryInput (keeper, 2026-11-01; Rex allowed boundary inputs, HIST-Q2):** `{id, kind: pathogen | arrival |
forcing | other, target: <engine>, port: <declared boundary input port of that engine>, region_edge: <region id>,
schedule: [{t, value, unit}] | {series: <dataset path>, unit}, label: researched | estimate | fiction, source, note?}`.
It names an input at the region's edge only: what arrives (a pathogen introduced, a ship, a forcing series), never an
outcome (deaths, a famine, an abandonment). The owning engine's own boundary port receives it; History only records
it in the header. Engines that have no boundary port yet get one through their keeper (HIST-6).

**Initial state (keeper, 2026-11-01):** the observer writes one Observation set at attach time `t = scheduler.t`
(normally 0) before the first checkpoint, so every record has its t0 stocks; reading at t0 is as inert as any read.

### 1.2 EventEntry: what occurred

Copied from the kernel bus, never invented. One row per `EventRecord` on the `EventBus`:

| Field | From | Note |
|---|---|---|
| `id`, `t`, `source`, `type`, `cause` | `KernelEvent` | `cause` is the parent event id: the causal trace P11b G4 needs |
| `phase`, `position`, `sequence` | `EventRecord` | kernel order; replay identity |
| `payload` | `KernelEvent.payload` | stored whole for the event types in the class table, else `payload_hash` only (size limit, §4.1 rate limiter) |
| `class` | the **event-class table** (data, versioned) | maps `source`+`type` to an indicator class: `demographic`, `economic`, `land`, `technology`, `institution`, `conflict`, `succession`, `migration`, `culture`, `other`. Unmapped types are `other` and counted in the report, so a new engine event never silently drops out of a measure |

### 1.3 Observation: what the state was

Sampled at each checkpoint by History's observer process (§4.1), which runs in a final `record` phase after every
engine process of that instant and reads through declared kernel input ports.

| Field | Type | Meaning |
|---|---|---|
| `t` | SimTime (ms) | checkpoint instant |
| `quantity` | registry quantity id | e.g. `body.alive`, `economy.goods.produced`, `settlement.parcel.area` |
| `unit` | kernel unit | dimension-checked against the port declaration |
| `scope` | `{kind: person|household|settlement|polity|region|world, id}` | engine-qualified id |
| `value` | number \| string[] \| null | null when the owning engine does not yet expose it; never filled with a guess |
| `mode` | `fine` \| `coarse` | the resolution the value came from (ResolutionService state) |
| `port` | string | the input port read, so every number traces to its owner |

### 1.4 Aggregate, SnapshotRef, Score

- **Aggregate** `{t, measure, scope, value, unit, fn, inputs[]}`: `fn` is a named aggregation (`sum`, `count`, `max`,
  `share`, `classify@<table-version>`), `inputs` the Observation or EventEntry ids it used. Aggregation is arithmetic
  over the record; it never reads engine state directly and never feeds back.
- **SnapshotRef** `{t, kernel_hash, participants: {id: hash}}`: the hashes G-inert compares.
- **Score** `{target, indicator, run_id | 'ensemble', checkpoint | 'all', S, signed_error, n_points, data_label}`;
  ensemble rows add `mean_S, sd_S, bias, variance, sign_consistency, verdict: systematic|stochastic|insufficient`
  (§7).

### 1.5 Historical comparison data (fixtures, not record)

Each target has a dataset file per indicator: `{indicator, checkpoints: [{date, value | [low, high], label, source,
note}]}`. Ranges are kept as ranges (e.g. Tokugawa 1600 population ~12–18 M, contested; ROADMAP). Seshat extracts
are stored the same way with the Seshat variable name and its own uncertainty coding. These are Catalogue reference
rows where the Catalogue holds them (proposed with the Catalogue keeper), History's fixtures otherwise.

## 2. The eleven indicators and how each is measured from engine state

The definitions and scores are ROADMAP P11a's, proposed there and kept here unchanged except where marked
**HIST amendment** (each amendment is HIST-Q3 for Rex because it changes what a score means). The column "From" names
the owning engine and the quantity History reads; "Today" says whether that quantity exists.

**Common error measure (ROADMAP I1):** per checkpoint `e_k = ln(sim_k / hist_k)`; `S = max(0, 1 − mean_k |e_k| / ln 2)`
(a factor of 2 off scores 0). **HIST amendments (Rex, 2026-10-31, HIST-Q3; Rex's definition of the 70 %):** (a) where the historical value is a range
`[lo, hi]`, `e_k = ln(sim/hi)` above, `ln(sim/lo)` below, 0 inside, so contested data do not penalise a simulation
that lands inside the scholarly range; (b) zero values (abandonment, a lost territory): both zero → `e_k = 0`;
exactly one zero → `|e_k| = ln 2` (that checkpoint scores 0) — the log measure is undefined there today (HIST-2);
(c) the signed `e_k` is kept beside `S`, because §7 needs the sign.

| # | Indicator | Measured from engine state as | From (owner, quantity) | Today |
|---|---|---|---|---|
| I1 | Population | count of living persons in scope at the checkpoint; coarse mode reads the aggregate's population quantity (the conserved quantity of the owner's `Resolution`) | Life `body.alive` per person (moves to Society demography, DUP-41); scope by Settlement residence | Life population exists inside `realism`; no residence link |
| I2 | Settlement growth | settlements = Settlement's settlement entities; size = resident count (I1 within it); classes by the target's historical size thresholds (dataset, researched); largest size scored as I1, class distribution as `1 − TV` | Settlement (entity, parcels), Life/Society (residents) | Settlement has a hamlet, no multi-settlement world; **a "settlement" entity is not yet defined** (HIST-7) |
| I3 | Resource availability | area by use (arable, pasture, forest) in km² = Σ parcel area by Settlement land-use tag, cross-checked with Reality terrain cells and Life vegetation cover; key stocks (timber, fish, game) in kg from Life standing biomass, never Economy inventories (three owners in sequence, ENGINE_MAP) | Settlement `land use`, Reality `realism.terrain.*`, Life `realism.terrain.vegetation_stocks` | planned |
| I4 | Production | staple output per head, kg/person/year = Σ Economy `producedLast` of the staple good × kg per unit (Catalogue mass), summed over the year ÷ I1 | Economy `economy.goods.produced`, Catalogue unit mass | Economy produces per day; units not all in kg (HIST-10) |
| I5 | Technology | the set of Catalogue technology ids whose Knowledge & Technology state is **deployed** in scope; Jaccard with the historical set; adoption date = first checkpoint deployed, error `1 − min(1, |Δt| / 50 y)` | K&T capability states (possibility ≠ knowledge ≠ invention ≠ adoption ≠ deployment, Rex) | K&T not built |
| I6 | Institutional change | ordered transitions of governmental configuration and of land-tenure regime, each a **classification** of engine state by a versioned typology table (e.g. distribution of authority → "monarchy"; Settlement titles and leases → "manorial", "leasehold"); event match within ±25 y, F1 | Government (distribution of authority, offices' powers), Settlement (titles, leases) | Government not built; Settlement tenure exists |
| I7 | Territory | area in km² of terrain cells a polity controls (Government) or occupies (Settlement parcels in use) | Government polity territory; Reality terrain cell area | Government not built |
| I8 | Conflict | rate of conflict events per period (`conflict` class: wars by Government, revolts and collective action by Society) scored as I1; intensity = deaths whose single cause traces (EventEntry `cause` chain) to that conflict, from Life's death ledger; timing of major ones by I6's F1 | Government, Society events; Life `realism.medicine.*` death ledger | Life death ledger exists; the rest not built |
| I9 | Political stability | regime duration (between I6 transitions) scored as I1; share of successions whose event chain contains violence (a `conflict`-class ancestor), `1 − |share_sim − share_hist|` | Government succession events | not built |
| I10 | Migration | net migration per period = arrivals − departures across the scope boundary (Society migration events); abandonment = a settlement whose resident count is 0 at two consecutive checkpoints (**Rex, 2026-10-31**, HIST-Q3), timing scored as I6 | Society migration; Settlement + residents | not built |
| I11 | Cultural and religious change | share of persons by religion or practice = Society's aggregation of Cognition belief-system membership; `1 − TV` | Society (religious community), Cognition (individual belief systems) | not built |

**Classification is a measurement instrument, not a rule.** I6, I9 and I11 need historical labels ("republic",
"leasehold", "Catholic") that the engines never assign (Rex, 2026-10-31: no government type is ever assigned). The
typology tables live in History, are versioned, labelled evidence level 4 with their sources (Seshat's variable codings
where they exist), and are applied only to the record after the fact. Nothing reads their output. Changing a table
changes scores, never a run, so every report names the table versions.

**Combined score:** the weighted mean of the indicators the target has data for (equal weights by default; Rex sets
any other weighting, ROADMAP). Reported per indicator and combined; the 70 % is provisional (Rex), and the first P11
unit is the data-coverage audit of these eleven against H1–H5 (ROADMAP), which History runs as research.

**What can be measured when:** I1, I3 (partly) and I4 can be measured once Life, Settlement and Economy expose the
quantities above; I2 and I10 need Society; I5 needs K&T; I6–I9 need Government. Until then a target's combined score
covers only the indicators with both data and a quantity, and the report says which (never a silent zero).

**P11b indicators** (ROADMAP G1–G7) are measured from the same record: G1 conservation from owners' trace checks
copied into the record, G4 from `cause` chains (every institution, war, adoption event has an ancestor chain ending
in mechanism events), G5 by replaying sampled decisions from the snapshot (Cognition supplies the replay call), G6 from
the ensemble's outcome distribution (§7), G2, G3, G7 against documented ranges as datasets.

## 3. X1 as a harness run (X1 approved by Rex 2026-10-31 as drafted in ROADMAP; this harness specification proposed)

X1 is the registry keeper's draft in ROADMAP (proposed for Rex): **terrain produces resources, organisms consume them,
individuals decide, and those decisions alter a settlement's development**, headless and seeded on the Kernel's one
clock, no pirate slice. This section turns it into a runnable harness specification. It decides nothing about the
loop's mechanisms; each seam's owner builds its side.

### 3.1 Where it lives and what it imports

`Toolchain/history/harness/x1/` (proposed). History is the one engine ENGINE_MAP lets read every engine, so the X1
harness imports each engine package one way plus the kernel; no engine imports it. It reuses the kernel harness's
adapters (`runnerAdapter`, `dailyProcesses`, `withKernelSteps`) rather than copying them: either imported from
`@rex/kernel-harness` or lifted by the Kernel keeper into an exported harness module (coordination item K-1, §5.4).

### 3.2 Needs (other keepers' work; the run is not started before each is true; tracked in HANDOFF)

Each Need becomes a `Needs:` line, by full unit name, on the seam unit that uses it (§3.7).

| # | Need | Owner | Registry / contract | Seam |
|---|---|---|---|---|
| N1 | soil with water and N/P/K, hydrology held simple | Reality | `realism.terrain.soils`, `realism.terrain.hydrology` | S1 |
| N2 | one food plant as a species profile: a provisions crop, **cassava or plantain** (Rex 2026-10-31, LIFE-Q5), queued after mahogany, sugarcane, mangrove and turtle grass | Life | `realism.plant.physiology`, `realism.terrain.vegetation_stocks` | S1 |
| N3 | harvest as a conserving transfer, harvested mass = biomass removed | Life → Economy | IF-42 | S2 |
| N4 | food into bodies through inventories | Economy → Life | DUP-21 closed, IF-36 | S3 |
| N5 | Life writes Cognition's body inputs (no stubs) | Life → Cognition | `body.hunger_signal`, `body.capacity_functional` | S4 |
| N6 | consumption from individual choice (labour offers optional) | Cognition → Economy | IF-26 (IF-27) | S5 |
| N7 | population labour through the contract | Life → Settlement, Economy | CONTRACTS §16/§18 `hours()`, DUP-26/28/29 closed with a combined test | S6 |
| N8 | a boundary precipitation input for the dry arm | Reality | none yet (HIST-6; HIST-Q2) | S7 |
| N9 | harness adapters exported (`harness/adapters.ts`) | Kernel | K-1 (Composer) | S0 |
| N10 | `record` phase; `readonly` process | Kernel | K-2 (Codex) | S0 |
| N11 | EventBus horizon compaction (a 2-year run keeps every event otherwise) | Kernel | K-3 | S7 |
| N12 | check-script rule on `"engine": "history"` | Kernel | K-4 (Codex) | S0 |
| N13 | starting-conditions bundle for a documented village (Rex, 2026-10-31, HIST-Q4) | Catalogue | ROADMAP P4 test 1; CAT-5 | S7 |

### 3.3 Configuration

| Parameter | Value | Label |
|---|---|---|
| Initial conditions | a documented village's Catalogue bundle (Rex, 2026-10-31, HIST-Q4) | researched / estimate per row |
| Food plant | cassava or plantain (Rex 2026-10-31, LIFE-Q5) | Rex |
| Population, households, parcels, businesses | from the bundle; `null` + flag until the bundle exists | — |
| Duration | **2 simulated years**, proposed: acceptance (2) asks that "the next season's fields and choices differ", which needs at least two growing seasons | proposed |
| Clock | Kernel scheduler; Reality/Life at their own declared steps; Settlement and Economy daily; Cognition at its declared decision period | owners' |
| Checkpoints | daily at the `record` phase (after `day.economy` and `day.settlement`) | proposed |
| Seeds | N = 10 per arm, seeds `fnv1a32('X1/' + i)` for i = 1…10 | proposed (N ≥ 2 suffices for acceptance 3; 10 measures spread) |
| Arms | **control** and **dry** (paired: the same 10 seeds; the only difference is the boundary precipitation input in the dry arm's first growing season) | boundary input allowed (Rex, 2026-10-31, HIST-Q2) |

### 3.4 What the observer records each day (all through declared ports; `null` where an owner does not expose it)

Soil water and N/P/K per field (Reality); plant standing biomass and harvested mass (Life); inventories by good,
prices, consumption, trades, wage quotes (Economy); posts, staffing, business status, construction progress, ledger
balances (Settlement); per person: alive, hunger signal, capacity, health crises, death and its one cause (Life);
per mind: intentions issued, counted by type, with their event ids (Cognition); every kernel event with its `cause`.

### 3.5 Acceptance, as measurable checks (mapping ROADMAP X1 (1)–(5))

| # | ROADMAP X1 acceptance | Measured as | Pass |
|---|---|---|---|
| A1 | mass closes across soil, plant, inventory and bodies every day | per element tracked by the owners (at least C and N where Reality/Life track them, else dry mass), daily `Σ stocks + Σ outflows − Σ inflows` across the four stores, against the owners' declared tolerances (kernel `ConservedQuantity`) | every day, every run, both arms (a gate, PLATFORM §11b mandatory) |
| A2 | a dry season lowers the harvest, raises the food price and changes who works, eats and leaves, with no script | paired differences dry − control per seed: harvested mass (< 0), mean food price over the following 90 days (> 0), the set of persons with work intentions and with eat intentions (Jaccard distance > 0); "leaves" only if a departure intention exists (HIST-5) | sign as stated in ≥ 9 of 10 seeds (sign test, p ≈ 0.011) for harvest and price; set change in ≥ 9 of 10; no event in the dry arm whose `cause` chain lacks a mechanism root (G4) |
| A3 | two seeds differ in which businesses grow | per seed, the vector of business sizes (posts filled) at day 730; pairwise distance | at least one pair of seeds differs, in each arm |
| A4 | every decision traces to a mind's intention and every death to one cause | every Economy consumption and labour event has a `cause` ancestor that is a Cognition intention event; every death row has exactly one cause in Life's ledger | 100 %, every run (gate) |
| A5 | Cognition's rows move from "integrated with stubs" to "integrated" with Life | registry keeper's re-audit after A1–A4 pass | the registry's verdict, not History's |

Plus the History-side gates on every X1 run: **G-inert** (a detached rerun of seed 1 of each arm gives identical
snapshot hashes at every checkpoint), **G-unread** (the check script passes), and replay (restore t0 + rerun gives the
same record hash).

### 3.6 What X1 reports on the eleven indicators

X1 is one settlement over two years, so most of the eleven have nothing to measure. The report lists every indicator
with its state, never a silent zero:

| # | X1 reports | Measured as (§2) |
|---|---|---|
| I1 | yes, daily | living persons in the settlement |
| I2 | yes (one settlement) | largest settlement size = I1; class distribution trivial |
| I3 | yes | field area by use; soil water and N/P/K; standing plant biomass in kg (Life, never inventories) |
| I4 | yes | harvested staple kg per person per year (Catalogue mass per unit, CAT-5) |
| I10 | only if Cognition issues a departure intention (HIST-5) | departures across the settlement boundary |
| I5–I9, I11 | excluded: no Knowledge & Technology, Government or Society in X1 | — |

Historical scores (S against data) where the documented village (Rex, HIST-Q4) has series to compare; otherwise X1
reports the series, the arm differences (§3.5 A2) and the P11b gates that apply: G1 conservation, G3 nothing
produced without its inputs, G4 causal traces, G5 a sample of decisions replayed from the snapshot.

### 3.7 Seam-by-seam plan (one harness unit per seam, then the combined run)

Each seam unit runs only its seam, short and seeded, with the History observer attached, and its Gate asserts that
seam's conservation and trace plus G-inert (§11b: filtered, never the full harness). The seam's owners build their
sides; History writes the harness unit and the Gate. Units are queued when their Needs exist, not before.

| Seam | What crosses | Run | Gate (validation spec) | Needs | Model |
|---|---|---|---|---|---|
| S0 | X1-0 observer on the thirty-day harness (§6) | 30 days, existing engines | G-inert, replay, record = `Midnight` values, G-unread with a failing fixture; reports kernel bus records per simulated day (N11 is queued only if the 2-year projection exceeds ~10^6) | N9 (2784), N10 (2785), N12 (2786), marker `history-design-approved-by-rex` | Sonnet |
| S1 | soil → plant (Reality → Life) | one field, one growing season, wet and dry soil | daily water and N balance soil ↔ plant within owners' tolerance; growth lower on dry soil (sign) | N1, N2 | Sonnet; Composer fixtures |
| S2 | plant → inventory (IF-42) | one harvest | harvested mass = biomass removed, exactly within tolerance; no mass created | N3 | Sonnet |
| S3 | inventory → body (DUP-21, IF-36) | 30 days, a household | food leaving inventory = food entering nutrition; hunger falls after eating | N4 | Sonnet |
| S4 | body → mind (Life → Cognition) | 7 days, the hungry pair on real Life signals | Cognition's inputs equal Life's written values; no stub on the path | N5 | Sonnet |
| S5 | mind → demand (IF-26) | 30 days | every consumption event has an intention ancestor (A4 on this seam) | N6 | Sonnet |
| S6 | labour (CONTRACTS §18) and the host's `work` resolution (§3.8) | 30 days | `hours()` per §18; posts filled from person-hours; the combined test DUP-26/28/29 asks for; §3.8 checks H1–H4 | N7, `shared.host.work_resolution` built (Kernel keeper, after kernel v0.1.0) | Sonnet |
| S7 | combined X1 | 2 years × 10 seeds × 2 arms | A1–A4 and the History gates (§3.5); A5 is the registry's re-audit | S0–S6 passed, N8, N11, N13, `2819-realism-life-step-convergence` | Sonnet; Haiku recompute of A2 from the record files |

X1 is a scientific validation run under §11b: the combined run reruns when a seam changes, never per change.
**Kernel side confirmed by the Kernel keeper 2026-10-31**: N9, N10, N12 for S0; N11 only for S7 and only if S0's
measured event rate projects past ~10^6 records per 2-year run (estimate: 10^4–10^5).

**S7's cost is wall time (HIST-11).** The thirty-day harness at realism's 1 s step took ~15 min (Kernel keeper,
measured); two years at 1 s is ~63 M steps, ~6 h per run, so 10 seeds × 2 arms ≈ 120 h. §11b forbids testing that
costs like building. Before S7 is queued: settle with the Reality and Life keepers which realism processes X1 runs
and at what step (owners' choice, from their stability limits), measure S1–S6 wall times, and put the expected wall
time in S7's unit. If it stays large, the seed count drops before the step is coarsened against an owner's
stability limit (A2's sign test still works at N = 6 with 6 of 6, p ≈ 0.016 one-sided).

**Reality keeper's answer (2026-10-31, realism 2817a7b):** X1 runs the body processes (physiology, nutrition,
muscular fatigue, medicine daily, the crisis and death ledger; population only if cohorts) at their **designed and
tested 60 s step** (`human-week`, kernel.json period 60000 ms), environment `place_process` for weather inputs, daily
processes at day periods once the kernel.json split (2765) lands; not the horse thermal model, stills, combustion,
walls, atmosphere grid, room air, or circulation unless X1 has wounds. Estimate ≈ 6 min per 2-year run before soil
and plants (thirty-day × 24 / 60), so 20 runs ≈ 2 h: inside §11b. No step beyond 60 s without a stability unit; none
is asked for. S1 waits on soils and hydrology (Reality phase 16), plant growth (Life phase 17) and functional capacity
(batch-2 group 1), none built. **Life keeper (2026-10-31, LIFE-11):** no Life
process has a proven largest stable step; 60 s is the defensible one (3600 s plausible for nutrition, water and
medicine, unproven). Muscular fatigue sub-steps at ≤ 1 s whatever the outer step (`realism/src/muscular.ts:87`), so
its cost stays per simulated second: the ≈ 6 min/run estimate may not hold and is measured in S0/S4 before S7. The
step-convergence unit is drafted (`HQ/handoffs/life/drafts/life-11-step-convergence.md`; human week at 1 s day-one
reference, 60, 600, 3600 s; reports state differences and wall time per simulated day by process and step), queued
through the Reality keeper; S7 gets `Needs: 2819-realism-life-step-convergence`. If muscular dominates, Life drafts
an exact constant-effort 3CC solution (linear 3×3 system, matrix exponential, level 1) so cost no longer scales with
step length; seeds are not cut before that measurement. **Measured (2819, realism fbecd32,
`validation/STEP-CONVERGENCE.md`; gate rechecked after timeout fix 2831):** water ledger closes at every step
(≤ 1e-14 kg); week-end body water 39.647 / 39.656 / 39.676 kg at 60 / 600 / 3600 s; day-one expenditure +0.04 % /
+0.19 %; alertness not monotone (600 s off by 0.062 on day 2, unexplained); room CO2 peak rises with step (1377 → 2047
ppm at 3600 s); the 3CC dominates wall time at coarse steps (97 % at 3600 s). **X1 keeps 60 s for the body**; the
exact 3CC solution is the lever on S7's cost: drafted as LIFE-12 (`HQ/handoffs/life/drafts/life-12-3cc-exact-solution.md`),
queued through the Reality keeper after 2832; it refreshes STEP-CONVERGENCE.md's wall-time table, from which S7's
unit takes its expected wall time. The 600 s alertness anomaly is LIFE-13.

**Link safety (KRN-26, I-1048).** `history/harness/x1/node_modules` holds `file:` junctions to the live kernel and
engines: never delete it recursively; never run X1 in a git worktree whose `node_modules` links to the live packages
(each worktree runs its own `npm ci --offline`, or links are removed with `cmd /c rmdir` first).

### 3.8 The host's `work` resolution in the X1 harness (contract `shared.host.work_resolution`, rs-platform 8c04e38; closes IF-27)

Specified here at the controller's assignment (registry keeper, 2026-11-01); built by the Kernel keeper in
`kernel/harness/` after kernel v0.1.0; carried by seam S6 and by S7. It is harness code, not an engine mechanism and
not History: History only records what it does.

- **Reads:** Life's LabourSupply provider, `hours(person, role, day)` and `reservationWage?` (provider is Life's).
- **Acts:** for each accepted `work` intention, one `{type: 'hire', post, holder, cause: <intention event id>}`
  through Settlement's `apply`, all inside one `kernel.transaction`; Settlement emits `settlement.post_filled` and
  `shared.action.outcome`. The phase it runs in follows the kernel's `data/order.json`, not this text.
- **Accepted, from the sources (2026-11-01):** the worker's side is the mind's decision. A `work` intention is
  accepted on the worker's side while it is the person's latest `work`/`refuse_work` intention and LabourSupply
  `hours(person, role, day) > 0` (Cognition DESIGN §2.4; CONTRACTS §16, §18, §19). `refuse_work` closes it (hours 0).
  `reservationWage?` is **not** a host filter: Settlement declined a staffing rule on it and only Economy's wage
  quote reads it (CONTRACTS §19; ECON-24 is Rex's). "Not hired" is `failed` from the declining side, the employer's
  decision or Economy's clearing (Cognition §2.4), never the host's.
- **Decided by the controller (2026-11-01, contract `shared.host.work_resolution`, rs-platform 90c1489; HIST-12 is
  dispatch, not Rex's):** (a) **employer side:** until Society's organisation actors exist (DUP-58), a business is
  not a mind, so **a vacant post is acceptance**: a provisional host rule (evidence level 4), replaced by the
  organisation's own decision when Society lands, never a staffing formula inside Settlement. (b) **which post:**
  the intention's `terms` gain a `role` field (Cognition contract amendment, registry records it); the host takes
  the first vacant post of that role by stable id, deterministic under replay. **Interim, until that field exists:**
  the host hires only where the run's fixture names the post per person. Not accepted (hours 0, no role, no vacant
  post) resolves `failed` with the reason among the stimuli (C-Q25). No wage comparison until Rex's wage rule
  (ECON-24).

S6's Gate adds, from the record: **H1** every `settlement.post_filled` has a `hire` whose `cause` is an accepted
`work` intention's event id, every accepted intention (as decided above) has exactly one `hire` to the first vacant
post of its role by stable id (interim: the post the fixture names), and every other `work` intention has a `failed` outcome with its reason (A4 trace on this seam); **H2** a
`hire` rejected by `apply` leaves no partial state (transaction rolled back; snapshot hash before = after);
**H3** no wage-bearing field is written by the host (the record attributes every wage write to an Economy process);
**H4** G-inert with the observer attached and detached.

## 4. The mechanisms (PLATFORM §7 contracts; proposed rows for the registry keeper)

History's "mechanisms" change no simulated state; they are recording and measuring processes. Registry kind is
proposed as `mechanism` for the record and `harness` for the evaluators, so the duplicate check never pairs them with
an engine's dynamics (the registry keeper decides the kind). One row exists today: `history.record.backend` (adopted
and filled below). Searched the registry for `record`, `history`, `indicator`, `seshat`, `aggregate`, `initial`:
the only neighbours are `economy.goods.record_object` (a record as a physical object) and `cognition.history.*`
(knowledge of the past); neither overlaps, since both are in-world and this is not.

### 4.1 `history.record.backend` (exists, planned; contract filled)

| Field | Value |
|---|---|
| Inputs | every kernel event (bus cursor); declared input ports per observed quantity, units as declared by owners |
| Outputs | `history.record` (files, §1); no kernel quantity any process may read |
| State | bus cursor; checkpoint index; open file handles; running hashes |
| Formulation | at each checkpoint in the `record` phase: drain the bus from the cursor into EventEntry rows; read each declared port into Observation rows; take snapshot hashes; append. Pure copy, no arithmetic beyond hashing |
| Dependencies | Kernel (EventBus, Scheduler phase, ports, snapshot `canonical`/`fnv1a64`) |
| Timescale | the run's checkpoint period (§1.1); events drained at each checkpoint |
| Invariants | G-unread, G-inert, G-once (§0); record order equals kernel order; manifest hash covers every file |
| Sources, evidence | level 1 (it is bookkeeping) |
| Approximations | payloads outside the class table are hashed, not stored; series exist only at checkpoints |
| Validation tests | §8 V1–V4 |
| Consumers | History's evaluators and reports only; humans |
| Rate limiter | record volume: bounded by checkpoint period × observed quantities × scopes, plus events; for centuries-long runs the person scope is sampled only at coarse checkpoints and aggregated (§4.2), and payloads above a declared byte limit are hashed |
| Failure mode | a write or port-read failure stops the observer and marks the run `non-reportable` in the manifest; it never throws into the scheduler of an engine (the observer process catches its own errors), so a History fault cannot alter or halt the simulation |

### 4.2 `history.aggregate.series` (new, proposed)

| Field | Value |
|---|---|
| Inputs | Observation and EventEntry rows; the scope hierarchy (person → household → settlement → polity → region) from Settlement and Government ids in the record |
| Outputs | Aggregate rows: per-scope series for every indicator quantity |
| State | none between calls (a pure function of the record) |
| Formulation | `sum`, `count`, `max`, `share`, `classify@version` over scopes; where an entity ran coarse, its value is the owner's aggregate quantity; where fine, the sum over individuals; the series is one line across a mode switch, with the switch instant marked |
| Dependencies | `history.record.backend` |
| Timescale | offline, after the run (or at checkpoints for live reports) |
| Invariants | an aggregate equals the sum of its parts at the same instant (checked); the value across a resolution switch is continuous within the owner's declared `ConservedQuantity` tolerance |
| Evidence | level 1 (arithmetic); `classify` tables level 4 |
| Approximations | scope membership is read at checkpoints, so a person moving between checkpoints is counted where they were at the checkpoint |
| Validation tests | V5 (sum identity), V6 (continuity across a switch), and ROADMAP P10 test 1 (§4.3) |
| Consumers | the evaluators |
| Rate limiter | none at run time (offline) |
| Failure mode | a missing scope link yields `null` for that aggregate, counted in the report |

### 4.3 The resolution hand-off: what History owns (Rex, 2026-10-31, HIST-Q1)

ENGINE_MAP and ROADMAP give History "long-step aggregation of settlements and polities" and "the resolution hand-off
at civilisation scale". Read literally, that would make History run the coarse dynamics of a distant village and
decide when it is refined; both change outcomes (a coarse step is a model of what happens; `refine` draws random
numbers), which Rex's 2026-10-31 rule forbids History. The Kernel already has the switching infrastructure
(`ResolutionService`: a transaction that refines, coarsens a copy back and checks every declared conserved quantity).
**Proposed split:**

- Each **owning engine** writes its own `Resolution<A, I>` (coarsen, refine) and its coarse long-step processes:
  demography for Society (Life today), output for Economy, land and buildings for Settlement, polities for Government.
- The **host** (the game adapter, or the harness configuration) decides when an entity switches, and History records
  the `resolution_plan`.
- **History** owns the measurement across the switch (§4.2) and the acceptance check `history.check.resolution`:
  ROADMAP P10 test 1, the same village run fine and run coarse for 50 years agrees within 10 % on population, output
  and deaths, measured on the record as an ensemble (§7) so a seed-level difference is not mistaken for a model error.

### 4.4 `history.init.bundle` (new, proposed)

| Field | Value |
|---|---|
| Inputs | a Catalogue starting-conditions bundle (ROADMAP P4 test 1: "England, 1270" returns a bundle with every value labelled and sourced) |
| Outputs | each engine's t0 load commands, issued through that engine's own fixture/loader API, and `init_bundle` in the RunHeader |
| State | none |
| Formulation | a mapping table bundle field → engine loader call; a field with no engine to receive it is listed as unused; a value an engine needs that the bundle lacks is `null` + flag and the run is marked incomplete, never filled |
| Dependencies | Catalogue (bundle), every engine's loader |
| Timescale | once, at t0 (G-once) |
| Invariants | no write after t0; label counts preserved (a researched value stays researched); engines validate their own inputs |
| Evidence | carries the bundle's labels |
| Approximations | disaggregation of a regional bundle to persons is done by the owner's `refine`, not by History |
| Validation tests | V7: loading then immediately recording t0 reproduces the bundle's values (round trip) |
| Consumers | the harness |
| Rate limiter | n/a (once) |
| Failure mode | any loader rejection aborts before t0; nothing partial runs |

Boundary inputs during the run (climate forcing, a pathogen's arrival) are allowed (Rex, 2026-10-31, HIST-Q2):
they are declared in the RunHeader and fed to the owning engine's boundary port, never by History deciding an outcome.

### 4.5 `history.eval.indicators` (new, harness, proposed)

Inputs: Aggregate rows, dataset fixtures (§1.5), typology tables. Outputs: Score rows per run (§2). Formulation: §2.
Evidence: the scores are definitions (level 1 arithmetic); the typology tables level 4. Invariants: a score names its
dataset version, typology version and the indicators excluded for lack of data. Validation: V8 (hand-computed scores
on a synthetic record, Haiku), V9 (a known-good synthetic run scores 1.0; a factor-2 run scores 0). Consumers: reports,
the registry keeper's investigations. Rate limiter: none (offline). Failure mode: missing data excludes an indicator
from the combined score and is reported, never scored 0 or 1.

### 4.6 `history.eval.ensemble` (new, harness, proposed): §7.

### 4.7 `history.baseline.sdt` (new, kind `baseline`, proposed)

Turchin's structural-demographic model as published (Turchin & Nefedov, *Secular Cycles*, 2009, and later work;
evidence level 5, its own record mixed, ENGINES.md), implemented as a small stand-alone model in `history/baselines/`
that reads only a case's initial conditions and its own parameters as published, never platform state. It predicts
I1, I7, I8, I9 on P11c cases neither model was calibrated on, scored exactly as the platform. Kind `baseline` keeps it
out of the engine graph; it is a yardstick and must never become a second population or instability mechanism
(DUP risk with Society/Government, so the registry keeper is asked to register it under a kind the duplicate check
excludes).

### 4.8 Seshat as data

The Seshat Global History Databank enters as dataset fixtures (§1.5) with each value's Seshat coding and uncertainty
kept, labelled researched. Its licence must be confirmed before extracts are stored in a repo that is backed up to
GitHub (HIST-4).

## 5. Interfaces (kernel ports; to agree with each owner)

### 5.1 Reads (all `declareInput`, read-only, at the `record` phase)

| From | Quantities (registry ids where they exist) | For |
|---|---|---|
| Kernel | EventBus records, scheduler phase, snapshot hashes, ResolutionService mode | §1 |
| Life (now `realism`) | `body.alive`, hunger, capacity, crises, death ledger with cause; plant biomass, vegetation stocks | I1, I3, I8, X1 |
| Reality | terrain cell area, soil water and nutrients, land cover | I3, I7, X1 |
| Settlement | settlements, parcels with area and use, titles and leases, posts, businesses, ledger | I2, I3, I6, I10, X1 |
| Economy | produced/consumed per good, inventories, prices, trades, wage quotes | I4, X1 |
| Cognition | intention events (ids and types) | X1 A4, P11b G5 |
| Society, Government, K&T | demography, migration, religion, organisations; authority, offices, polities, territory, wars, successions; capability states | I2, I5–I11 |
| Catalogue | starting bundles, technology ids, unit masses, calendars, reference datasets | §4.4, I4, I5, §1.5 |

**DUP-61 (collective knowledge; owner Knowledge & Technology, Rex-approved; History agreed 2026-10-31):** History reads
`society.knowledge_stock` only as a read-only `record`-phase observation (for I5 and P11b), proven by G-inert and the
K-4 rule; it never writes the stock, at t0 or after. At t0 it passes Catalogue beliefs and surviving records only to
Cognition's and Economy's own loaders, and the stock is computed from them (G-once).

### 5.2 Writes

`history.record` files only. No kernel output port any process may read.

### 5.3 Proposed to the Kernel check script (Kernel keeper's to accept)

A rule: **fail** if any `kernel.json` other than History's declares a read of a quantity under `history.*`; **fail**
if History's `kernel.json` declares a write outside `history.*`. This is ROADMAP P10 test 2 as a mechanical check.

### 5.4 Coordination with the Kernel keeper (sent 2026-10-31, answers awaited)

K-1 reuse of the thirty-day adapters (import from `@rex/kernel-harness` or lift into an exported module); K-2 a
`record` phase that runs after every engine process at an instant, and whether a process can be declared read-only
(no emit, no transaction enlistment, no RNG stream) so G-inert is enforced by the kernel, not only tested; K-3 memory
and trace compaction for year- to century-long runs (the thirty-day run already compacts hourly); K-4 the §5.3 check
rule; K-5 the calendar (**agreed with the Catalogue keeper 2026-10-31**, their DESIGN §1.3, CAT-Q6; Kernel agreed its
side): the Catalogue owns calendars as reference data and converts source dates to one stored proleptic axis, keeping
each source's own calendar; the Kernel keeps the integer clock and `TROPICAL_YEAR`, the epoch a label in the snapshot;
History owns nothing calendrical and maps sim time to that axis as `epoch + t / TROPICAL_YEAR`. Held-out targets carry
the Catalogue field `benchmark_role: held_out` (H1/H2 `development`, H5 `reserve`, requested); the Catalogue's check
stops tuning units from reading held-out rows, while History's evaluator units (kind `harness`) score them. **Adopted by the Catalogue 2026-10-31** (its DESIGN §1.1, §1.3, V5): epoch a decimal astronomical year on the proleptic axis; `benchmark_role` ∈ {development H1/H2, held_out H3/H4, reserve H5}; staple masses per period unit and technology ids come as CAT-5 after approval.

**Kernel keeper's answers (2026-10-31; its units wait on Rex's approval of this design, except the README):**
K-1 the three adapters move to `harness/adapters.ts`, re-exported, with a package `exports` entry; History depends on
`@rex/kernel-harness`, never on engines directly (one Composer unit). K-2 a `record` phase appended after `aggregate`
in the kernel's `data/order.json`; a declared `readonly: true` process whose context has no `rng` or `emit` and which
`transaction()` refuses (one Codex unit); mutation by reference cannot be guarded cheaply and stays proven by G-inert
(V1). K-3 the integer clock covers ~285,000 years; the kernel EventBus has no compaction yet (a horizon compaction will
be queued when X1 needs it); centuries run on owners' coarse resolutions, not 1 s steps. K-4 accepted, keyed on an
explicit `"engine"` field in kernel.json, platform-wide and optional at first; the history rules require it (a
`history.*` read without `"engine": "history"` fails; a History write outside `history.*` fails). K-5 no kernel objection; settled with the
Catalogue as above. HIST-1 fixed: harness README landed (2776). Kernel units 2784 (K-1), 2785 (K-2), 2786 (K-4) are queued with `Needs: history-design-approved-by-rex`; 2805 puts `epoch` (decimal year), `epochLabel` and `catalogue_hash` in the snapshot's kernel block, which the RunHeader `epoch` reads.


## 6. First executable demonstration (proposed): X1-0, "the observer's thirty days"

Buildable now on what exists, with no engine change: attach History's observer to the kernel's thirty-day
three-engine harness (realism horse-stable, settlement hamlet, economy three-ports) and show:

1. **G-inert:** the thirty-day run with and without the observer gives identical snapshot hashes at every midnight
   and identical `Midnight` rows (the harness's own record).
2. **Replay:** two runs with the same seed give byte-identical record files; the manifest hash matches.
3. **Measurement:** the record yields the daily money total, goods produced/consumed/total per good and the hamlet's
   population as series; the aggregates equal the harness's own `Midnight` values exactly.
4. **G-unread:** the check-script rule (§5.3) passes over every `kernel.json`, and a deliberately bad fixture that
   reads `history.record` fails it.

It proves the record and the fence before any reconstruction exists; it scores no historical indicator because no
historical target can run yet.

## 7. The ensemble protocol: systematic error told from stochastic variation (proposed)

ROADMAP: N ≥ 30 runs per target with recorded seeds; an error that keeps its sign across seeds is systematic, one
that does not is stochastic; nothing tuned on H3 or H4. Concretely, per target, indicator and checkpoint k, over seeds
s = 1…N with signed log error `e_{s,k}` (§2):

- **Bias** `b_k = mean_s e_{s,k}`; **variance** `v_k = var_s e_{s,k}`; mean squared error `MSE_k = b_k² + v_k` (an
  identity, level 1). The **systematic share** is `b_k² / MSE_k`.
- **Sign consistency:** the count of seeds with the majority sign; with N = 30, ≥ 21 of 30 rejects "sign is a coin
  flip" at about p = 0.04 two-sided (binomial). Verdict per indicator: **systematic** when sign consistency passes
  at the majority of checkpoints and the systematic share exceeds 0.5; **stochastic** when neither; **insufficient**
  when fewer than 5 checkpoints have data. (The thresholds are proposed and stated in every report.)
- **Coverage:** whether the historical value (or range) lies inside the ensemble's 5–95 % envelope at each
  checkpoint. History is one realisation; a model that is right in distribution but whose single historical path lies
  in its tail is not wrong, and coverage is how that is told from bias.
- **Seeds** are derived, not chosen: `fnv1a32('<target>/' + i)`, i = 1…N, recorded in every RunHeader, so nobody can
  pick favourable seeds.
- A systematic verdict opens an investigation issue (missing mechanism, input or interaction) with the registry
  keeper; on H3/H4 it never opens a tuning pass (ROADMAP).

## 8. Validation plan (PLATFORM §11a: implemented ≠ integrated ≠ validated)

| # | Test | Level (§11b) | Independent of the author by |
|---|---|---|---|
| V1 | G-inert: attached vs detached snapshot hashes identical | mechanism; every History unit | runs engine code History did not write |
| V2 | G-unread: check-script rule, with a failing fixture | mechanism; mandatory | Kernel's check script |
| V3 | Replay: same seed → same record hash | mechanism | kernel snapshot/replay |
| V4 | Record order equals kernel order; every bus record present | mechanism | EventBus sequence numbers |
| V5 | Aggregate sum identity | mechanism | Haiku check unit |
| V6 | Continuity across a resolution switch within owners' tolerance | integration (when a `Resolution` lands) | kernel `ConservedQuantity` |
| V7 | Initialisation round trip | integration (per bundle) | Catalogue labels |
| V8 | Hand-computed scores on a synthetic record | mechanism | Haiku, from §2 alone |
| V9 | Synthetic perfect / factor-2 runs score 1.0 / 0 | mechanism | arithmetic |
| V10 | P10 test 1: fine vs coarse village, 50 years, within 10 % (ensemble) | validation | owners' Resolutions; History only measures |
| V11 | X1 acceptance A1–A4 | validation (when seams close) | owners' mechanisms |
| V12 | P11a H1, H2 (development), then H3, H4 held out as-is; P11c against the SDT baseline on uncalibrated Seshat cases | validation, periodic | Seshat and the ROADMAP sources; held-out data |

Validated, for History, means: the record is complete and inert (V1–V4), the measures compute what §2 says (V5, V8,
V9), and the evaluation separates bias from noise on a synthetic ensemble with known bias and known noise (a planted
test: inject a constant +20 % on one indicator and pure noise on another; the protocol must call the first systematic
and the second stochastic).

## 9. Questions for Rex: all answered (Rex, 2026-10-31; see the status line)

- **HIST-Q1. History's share of "long-step aggregation" and "the resolution hand-off".** Proposed (§4.3): each owning
  engine writes its own coarse form and coarse dynamics; the host decides when to switch; History owns only the
  series across the switch and the fine-vs-coarse agreement check (P10 test 1). Reason: coarse dynamics and the
  refine draw change outcomes, which History may not. Approve, or say otherwise.
- **HIST-Q2. Boundary conditions in reconstructions.** A region run alone needs things that come from outside it:
  England's Black Death arrives in 1348 from elsewhere; Greenland's trade link is Norway; Tokugawa trade is the Dutch
  and Chinese at Nagasaki; volcanic and solar forcing drive the climate Reality computes. Proposed: such inputs are
  allowed as **declared, labelled boundary inputs at the region's edge** (a pathogen introduced, a ship arriving, a
  forcing series into Reality's physics), never an outcome: the plague's mortality, the famine, the abandonment must
  still emerge. The X1 dry-season treatment is the same kind of input. Allow, refuse, or limit?
- **HIST-Q3. Score amendments** (§2): score against historical ranges (zero error inside a contested range); zero-value
  rule; abandonment = zero residents at two consecutive checkpoints. They change what 70 % means, so they are yours.
- **HIST-Q4. X1's starting conditions:** a documented village from the Catalogue (recommended: the run then means
  something against data, and its numbers are researched, not invented) or a generic one? The food plant is already
  open in the X1 draft.
