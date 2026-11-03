// Independent recomputation of the synthetic fixture verdicts (PLAN §3.9, V16).
//
// This script reads only the fixture JSON files and the rules written below, which come from PLAN §3.3, §3.6,
// §3.7, §3.8 and §3.11 and the RG-5 paragraph of §3. It reads no History code. Each case's verdict is recomputed
// and compared with the fixture's `expected`. A disagreement is a finding to report; never edit a fixture or the
// engine to make it agree.
//
// Checked here: accounting, trace, step, matching, rg5. The abandonment, continuity and ensemble fixtures are not
// covered by PLAN §3.9's list and are skipped.
//
// Every constant is labelled: `fixture` marks a value the synthetic fixtures need and PLAN does not give.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHECKED = ["accounting", "trace", "step", "matching", "rg5"];

const ACCOUNT_TOL = 1e-9; // fixture: exact for the synthetic integer and tenth-unit balances; PLAN §3.7 gives no value
const ENDPOINT_QUANTITY = { "economy/household": "economy.inventory", "life/gut": "life.gut.mass" }; // fixture: endpoint to observed quantity
const Z_95 = 1.96; // two-sided 0.95 normal quantile, as the step margin's confidence says
const LOW_CREDIBILITY = 0.5; // fixture: no PLAN value; a report below it may leave a belief unchanged (RG-5 updating)

// ---- accounting (PLAN §3.7) ----

function checkAccounting(j) {
  const transfers = j.events.filter((e) => e.type === "kernel.transfer");

  // One journal entry per leg. A second entry for the same leg is a double entry.
  const legCount = new Map();
  for (const e of transfers) {
    const key = `${e.transaction_id}|${e.leg_id}`;
    legCount.set(key, (legCount.get(key) ?? 0) + 1);
  }
  if ([...legCount.values()].some((n) => n !== 1)) return "fail";

  // A transfer without its amount or endpoints cannot be checked.
  for (const e of transfers) {
    const p = e.payload ?? {};
    if (typeof p.amount !== "number" || !p.from || !p.to) return "insufficient";
  }

  // Each account is written only by its declared owner: the source must own one of the leg's two accounts.
  for (const e of transfers) {
    const owners = [e.payload.from, e.payload.to].map((endpoint) => endpoint.split("/")[0]);
    if (!owners.includes(e.source)) return "fail";
  }

  // Observed accounts: one series per (quantity, scope).
  const series = new Map();
  for (const o of j.observations) {
    const key = `${o.quantity}|${o.scope.id}`;
    if (!series.has(key)) series.set(key, { quantity: o.quantity, points: [] });
    series.get(key).points.push({ t: o.t, v: o.value });
  }
  for (const s of series.values()) s.points.sort((a, b) => a.t - b.t);

  const t0 = j.header.epoch.sim_t0;
  const t1 = Math.max(
    ...j.observations.map((o) => o.t),
    ...transfers.map((e) => e.t),
  );

  // Recorded changes, per series. An endpoint names its series by quantity; more than one candidate is ambiguous.
  const delta = new Map([...series.keys()].map((key) => [key, 0]));
  for (const e of transfers) {
    for (const [endpoint, sign] of [[e.payload.from, -1], [e.payload.to, 1]]) {
      const quantity = ENDPOINT_QUANTITY[endpoint];
      if (!quantity) return "insufficient";
      const keys = [...series.keys()].filter((key) => series.get(key).quantity === quantity);
      if (keys.length !== 1) return "insufficient";
      if (e.t > t0 && e.t <= t1) delta.set(keys[0], delta.get(keys[0]) + sign * e.payload.amount);
      if (e.t > series.get(keys[0]).points.at(-1).t && e.t > t0 && e.t <= t1) return "insufficient";
    }
  }

  // Interval residual per account: X(t1) − X(t0) − Σ recorded changes, within tolerance.
  // An account not observed at t0 is taken as 0 there (fixture assumption; the stock starts empty).
  for (const [key, s] of series) {
    const atStart = s.points.find((p) => p.t === t0);
    const x0 = atStart ? atStart.v : 0;
    const x1 = s.points.at(-1).v;
    const residual = x1 - x0 - delta.get(key);
    if (Math.abs(residual) > ACCOUNT_TOL) return "fail";
  }
  return "pass";
}

// ---- trace (PLAN §3.6) ----

function checkTrace(j) {
  const deaths = j.events.filter((e) => e.type === "body.death");
  for (const d of deaths) {
    // A death without its person cannot be traced.
    if (!d.payload?.person) return "insufficient";
    // The death must cite its crisis, and that crisis must be recorded for the same person no later than the death.
    if (!d.cause || !d.cause.startsWith("crisis/")) return "insufficient";
    const crises = j.events.filter(
      (c) => c.type === "body.crisis" && c.payload?.person === d.payload.person && c.t <= d.t,
    );
    if (crises.length === 0) return "insufficient";
    // The crisis must cite the reserve it came from.
    if (!crises.at(-1).cause?.startsWith("reserve/")) return "insufficient";
  }
  // Contributing conditions are listed, never required, so a complete chain is a pass.
  return "pass";
}

// ---- step (PLAN §3.8) ----

function checkStep(j) {
  const protocol = j.protocol;
  const step = protocol?.steps?.[0];
  const margin = protocol?.checks?.[0]?.margin?.value;
  if (!step || typeof margin !== "number") return "insufficient";

  // Paired samples: the first arm's observation at the reference step, and the second arm's at the declared step.
  // Pairs are taken in scope-id order (fixture assumption).
  const energy = j.observations.filter((o) => o.quantity === "life.energy");
  const byScope = (rows) => rows.sort((a, b) => a.scope.id.localeCompare(b.scope.id));
  const reference = byScope(energy.filter((o) => o.t === step.reference_ms));
  const second = byScope(energy.filter((o) => o.t === step.second_ms));
  const n = Math.min(reference.length, second.length);
  if (n < 1) return "insufficient";

  const diffs = [];
  for (let i = 0; i < n; i++) diffs.push(second[i].value - reference[i].value);
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  // A single pair has no spread, so its interval is the point; the margin is then the whole decision (fixture).
  let half = 0;
  if (n >= 2) {
    const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1);
    half = (Z_95 * Math.sqrt(variance)) / Math.sqrt(n);
  }
  const inside = mean - half >= -margin && mean + half <= margin;
  return inside ? "pass" : "fail";
}

// ---- matching (PLAN §3.3) ----

// Maximum cardinality of a one-to-one pairing with |s − r| ≤ w, by exhaustive search (independent of the sweep).
function maxMatches(sim, ref, w) {
  const used = new Array(ref.length).fill(false);
  const go = (i) => {
    if (i === sim.length) return 0;
    let best = go(i + 1);
    for (let k = 0; k < ref.length; k++) {
      if (!used[k] && Math.abs(sim[i] - ref[k]) <= w) {
        used[k] = true;
        best = Math.max(best, 1 + go(i + 1));
        used[k] = false;
      }
    }
    return best;
  };
  return go(0);
}

function checkMatching(j) {
  const m = j.matching;
  if (!m || typeof m.window !== "number") return "insufficient";
  return maxMatches(m.simulated, m.reference, m.window) === m.expected_matches ? "pass" : "fail";
}

// ---- rg5 (PLAN §3 RG-5 paragraph) ----

function checkRg5(j) {
  const reports = new Map(j.events.filter((e) => e.type === "cognition.report").map((e) => [e.payload.report, e.payload]));

  // (1) Information isolation: a changed belief comes only from a report the same person received.
  for (const e of j.events.filter((x) => x.type === "cognition.belief")) {
    const changed = e.payload.belief !== e.payload.prior;
    if (!changed) continue;
    const report = reports.get(e.cause);
    if (!report || report.person !== e.payload.person || report.received !== true) return "fail";
  }

  // (1b) A ledger change never comes from report content.
  for (const e of j.events.filter((x) => x.type === "kernel.transfer")) {
    if (e.cause?.startsWith("report/")) return "fail";
  }

  // (2) Updating: an unchanged belief must be what the declared rule predicts. Under low credibility, no change is predicted.
  for (const e of j.events.filter((x) => x.type === "cognition.belief")) {
    const changed = e.payload.belief !== e.payload.prior;
    if (changed) continue;
    const report = reports.get(e.cause);
    if (report && report.received === true && report.credibility >= LOW_CREDIBILITY) return "fail";
  }
  return "pass";
}

// ---- driver ----

const CHECKS = { accounting: checkAccounting, trace: checkTrace, step: checkStep, matching: checkMatching, rg5: checkRg5 };

function listJson(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listJson(path) : entry.name.endsWith(".json") ? [path] : [];
  });
}

const root = process.argv[2] ?? "test/fixtures/synthetic";
const relative = (path) => path.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
const disagreements = [];
let count = 0;

for (const path of listJson(root).sort()) {
  const category = relative(path).split("/")[0];
  if (!CHECKED.includes(category)) continue;
  const j = JSON.parse(readFileSync(path, "utf8"));
  const recomputed = CHECKS[category](j);
  const line = `${category}/${j.case} ${j.expected} ${recomputed}`;
  console.log(line);
  count++;
  if (recomputed !== j.expected) disagreements.push(line);
}

if (disagreements.length > 0) {
  console.log(`DISAGREE ${disagreements.length} of ${count}:`);
  for (const line of disagreements) console.log(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(`ALL AGREE (${count} cases)`);
}
