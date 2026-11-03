import type { Protocol, ProtocolCheck } from '../protocol.ts'
import type { CheckStatus } from '../verdict.ts'

export interface StepRun {
  id: string
  seed: number
  step_ms: number
  /** Stable mechanism/person stream identities, not just a seed. */
  streams: readonly string[]
  decision_every_ms: number | null
  value: number | null
  outcomes?: Readonly<Record<string, string>>
}
export interface StepInput {
  protocol: Protocol
  check_id: string
  unit: string
  reference: readonly StepRun[]
  second: readonly StepRun[]
  kind: 'continuous' | 'outcome'
}
export interface StepReport {
  status: CheckStatus
  equivalence: 'equivalent' | 'not_equivalent' | 'insufficient'
  unit: string
  mean: number | null
  interval: { low: number; high: number } | null
  confidence: number | null
  differences: { seed: number; difference: number }[]
  contingency: { reference: string; second: string; count: number }[]
  evidence: string[]
  reasons: string[]
}
const positive = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0
const same = (a: readonly string[], b: readonly string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// Lanczos log-gamma and continued-fraction incomplete beta evaluate the Student t
// CDF. Constants below are numerical approximation coefficients, not model inputs.
function logGamma(z: number): number {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7]
  let x = 0.99999999999980993
  z -= 1
  for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300
  const clamp = (v: number) => Math.abs(v) < tiny ? tiny : v
  let c = 1, d = 1 / clamp(1 - (a + b) * x / (a + 1)), h = d
  for (let m = 1; m <= 1000; m++) {
    const coefficients = [m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)),
      -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))]
    let delta = 1
    for (const aa of coefficients) {
      d = 1 / clamp(1 + aa * d); c = clamp(1 + aa / c)
      delta = d * c; h *= delta
    }
    if (Math.abs(delta - 1) < 1e-14) return h
  }
  return NaN
}
function beta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  return x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b
}
function criticalT(confidence: number, df: number): number {
  const tail = (t: number) => beta(df / (df + t * t), df / 2, 0.5)
  let low = 0, high = 1
  while (tail(high) > 1 - confidence && high < 1e16) high *= 2
  if (!Number.isFinite(tail(high)) || tail(high) > 1 - confidence) return NaN
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2, p = tail(mid)
    if (!Number.isFinite(p)) return NaN
    if (p > 1 - confidence) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/** PLAN §3.5/3.8, HI-7: pure post-run arithmetic owned by history.record.
 * Two-sided Student t interval: mean(d) +/- t_(1+confidence)/2,n-1 * s(d)/sqrt(n).
 * Assumes independent seed pairs and approximately normal paired differences;
 * two settings establish sensitivity, not convergence. Units follow the measure.
 * Missing owner parameters remain missing. No run or decision schedule is changed.
 * Synthetic verification only; no empirical validation or engine integration yet.
 */
export function checkStep(input: StepInput): StepReport {
  const { protocol, reference, second } = input
  const criterion: ProtocolCheck | undefined = protocol.checks.find(c => c.id === input.check_id)
  const step = protocol.steps.find(s => s.owner === criterion?.owner)
  const margin = criterion?.margin
  const report: StepReport = { status: 'insufficient', equivalence: 'insufficient', unit: input.unit,
    mean: null, interval: null, confidence: margin?.confidence ?? null, differences: [], contingency: [],
    evidence: [...new Set([...reference, ...second].map(r => r.id))].sort(), reasons: [] }
  const reason = (s: string) => { report.reasons.push(s) }
  if (!criterion || !step || !positive(step.reference_ms) || !positive(step.second_ms) || step.reference_ms === step.second_ms) reason('Missing or invalid declared steps/check')
  if (!input.unit.trim()) reason('Missing unit')
  if (!margin || !Number.isFinite(margin.value) || margin.value < 0 || !margin.source.trim()) reason('Missing or invalid owner margin')
  if (!positive(margin?.confidence) || margin.confidence >= 1) reason('Missing or invalid declared confidence')
  const streams = protocol.streams.map(s => s.id)
  if (!streams.length || new Set(streams).size !== streams.length) reason('Missing or duplicate stream identities')
  if (!protocol.seeds.length || new Set(protocol.seeds).size !== protocol.seeds.length) reason('Missing or duplicate protocol seeds')
  const all = [...reference, ...second]
  if (new Set(all.map(r => r.id)).size !== all.length || all.some(r => !r.id.trim())) reason('Missing or duplicate run evidence ids')
  const frequencies = new Set(all.map(r => r.decision_every_ms))
  if (frequencies.size !== 1 || all.some(r => !positive(r.decision_every_ms))) reason('Decision frequency missing or changed')
  const maps = [reference, second].map((runs, i) => {
    const map = new Map<number, StepRun>()
    for (const run of runs) {
      if (map.has(run.seed) || !protocol.seeds.includes(run.seed)) reason('Duplicate or undeclared seed')
      if (run.step_ms !== (i === 0 ? step?.reference_ms : step?.second_ms)) reason('Run step does not match protocol')
      if (!same(run.streams, streams)) reason('Stream identities do not match protocol')
      map.set(run.seed, run)
    }
    return map
  })
  const counts = new Map<string, { reference: string; second: string; count: number }>()
  for (const seed of [...protocol.seeds].sort((a, b) => a - b)) {
    const a = maps[0].get(seed), b = maps[1].get(seed)
    if (!a || !b) { reason('Missing seed pair'); continue }
    if (input.kind === 'continuous') {
      if (a.value === null || b.value === null || !Number.isFinite(a.value) || !Number.isFinite(b.value)) { reason('Missing or nonfinite measurement'); continue }
      report.differences.push({ seed, difference: b.value - a.value })
    } else {
      const left = a.outcomes, right = b.outcomes
      if (!left || !right || !Object.keys(left).length || !same(Object.keys(left), Object.keys(right))) { reason('Missing paired person outcomes'); continue }
      for (const person of Object.keys(left).sort()) {
        if (!left[person].trim() || !right[person].trim()) { reason('Missing outcome class'); continue }
        const key = JSON.stringify([left[person], right[person]])
        const row = counts.get(key) ?? { reference: left[person], second: right[person], count: 0 }
        row.count++; counts.set(key, row)
      }
    }
  }
  report.contingency = [...counts.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row)
  if (input.kind === 'outcome') reason('No supported outcome test declared in protocol schema')
  else {
    const values = report.differences.map(d => d.difference), n = values.length
    const mean = values.reduce((sum, d) => sum + d / n, 0)
    report.mean = n && Number.isFinite(mean) ? mean : null
    if (n < 2) reason('At least two independent seed pairs required for t interval')
    if (n >= 2 && positive(margin?.confidence) && margin.confidence < 1) {
      const variance = values.reduce((sum, d) => sum + (d - mean) ** 2 / (n - 1), 0)
      const half = criticalT(margin.confidence, n - 1) * Math.sqrt(variance / n)
      if (Number.isFinite(mean) && Number.isFinite(half)) report.interval = { low: mean - half, high: mean + half }
      else reason('Nonfinite paired interval')
    }
    if (!report.reasons.length && report.interval && margin) {
      const { low, high } = report.interval
      if (low >= -margin.value && high <= margin.value) { report.status = 'pass'; report.equivalence = 'equivalent' }
      else if (low > margin.value || high < -margin.value) { report.status = 'fail'; report.equivalence = 'not_equivalent' }
      else reason('Interval overlaps equivalence boundary')
    }
  }
  report.reasons = [...new Set(report.reasons)].sort()
  return report
}
