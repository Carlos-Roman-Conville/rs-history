import { fnv1a32 } from '@rex/kernel'
import type { HistoricalRange } from './dataset.ts'
import type { DataLabel, Score } from './record.ts'
import type { IndicatorScore } from './scores.ts'

type Matrix = readonly (readonly (number | null)[])[]
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v / values.length, 0)
function finite(value: number): void { if (!Number.isFinite(value)) throw new Error('expected finite number') }
function natural(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new Error('expected non-negative integer') }
function probability(value: number): void { finite(value); if (value < 0 || value > 1) throw new Error('expected probability') }

export function seeds(target: string, n: number): number[] {
  natural(n)
  return Array.from({ length: n }, (_, i) => fnv1a32(`${target}/${i + 1}`))
}

/** Columns retain checkpoint order; ragged trailing entries and nulls are missing. */
function columns(rows: Matrix): number[][] {
  let width = 0
  for (const row of rows) {
    width = Math.max(width, row.length)
    for (const value of row) if (value !== null) finite(value)
  }
  return Array.from({ length: width }, (_, i) => rows.flatMap(row => row[i] == null ? [] : [row[i] as number]))
}

export function decompose(errors: Matrix) {
  return columns(errors).map(values => {
    if (!values.length) return { n: 0, bias: null, variance: null, mse: null, systematicShare: null }
    const bias = mean(values), variance = mean(values.map(v => (v - bias) ** 2)), mse = bias ** 2 + variance
    return { n: values.length, bias, variance, mse, systematicShare: mse === 0 ? 0 : bias ** 2 / mse }
  })
}

/** Exact one-sided P(Binomial(n, 0.5) >= k), with no normal approximation.
 * Relative masses start at the mode to avoid underflow from starting at 2^-n.
 */
export function binomialTail(n: number, k: number): number {
  natural(n); natural(k)
  if (k > n) return 0
  const mode = Math.floor(n / 2)
  let total = 1, tail = mode >= k ? 1 : 0, mass = 1
  for (let j = mode; j > 0; j--) {
    mass *= j / (n - j + 1); total += mass
    if (j - 1 >= k) tail += mass
  }
  mass = 1
  for (let j = mode; j < n; j++) {
    mass *= (n - j) / (j + 1); total += mass
    if (j + 1 >= k) tail += mass
  }
  return tail / total
}

export function signTest(errors: readonly number[], sidedness: 'one' | 'two' = 'two') {
  if (sidedness !== 'one' && sidedness !== 'two') throw new Error('invalid sidedness')
  errors.forEach(finite)
  const positive = errors.filter(e => e > 0).length, negative = errors.filter(e => e < 0).length
  const n = positive + negative, k = Math.max(positive, negative)
  return { n, k, sidedness, p: Math.min(1, (sidedness === 'two' ? 2 : 1) * binomialTail(n, k)) }
}

export function coverage(simValues: Matrix, hist: readonly (number | HistoricalRange | null)[], lo = 0.05, hi = 0.95): (boolean | null)[] {
  probability(lo); probability(hi)
  if (lo > hi) throw new Error('quantiles must be ordered')
  if (simValues.some(row => row.length > hist.length)) throw new Error('unexpected simulated checkpoint')
  const points = columns(simValues)
  return hist.map((historical, i) => {
    if (historical === null) return null
    const [low, high] = typeof historical === 'number' ? [historical, historical] : historical
    finite(low); finite(high)
    if (low > high) throw new Error('historical range must be ordered')
    const values = (points[i] ?? []).slice().sort((a, b) => a - b)
    if (!values.length) return null
    // Empirical quantiles linearly interpolate adjacent ranks at (n - 1) * p.
    const quantile = (p: number) => {
      const rank = (values.length - 1) * p, index = Math.floor(rank), fraction = rank - index
      return values[index] * (1 - fraction) + values[Math.ceil(rank)] * fraction
    }
    return low <= quantile(hi) && high >= quantile(lo)
  })
}

export interface FindingsOptions {
  /** Acceptance of absolute mean discrepancy: abs + rel * scale, in discrepancy units. */
  criterion: { abs: number; rel: number; scale: number; source: string } | null
  method: { name: 'sign_test'; sidedness: 'one' | 'two' } | null
}
export type EnsembleFindings = ReturnType<typeof findings>
export type EnsembleStatus = 'met' | 'not_met' | 'insufficient'
/** Rows are runs, columns are aligned checkpoints. No pooling across checkpoints. */
export function findings(errors: Matrix, { criterion, method }: FindingsOptions) {
  if (criterion !== null) {
    for (const value of [criterion.abs, criterion.rel, criterion.scale]) {
      finite(value)
      if (value < 0) throw new Error('negative criterion')
    }
    finite(criterion.abs + criterion.rel * criterion.scale)
    if (!criterion.source.trim()) throw new Error('criterion source required')
  }
  if (method !== null && (method.name !== 'sign_test' || !['one', 'two'].includes(method.sidedness))) throw new Error('invalid method')
  const checkpoints = columns(errors).map((values, checkpoint) => {
    const n_runs = values.length
    const mean_discrepancy = n_runs ? mean(values) : null
    const variance = mean_discrepancy === null ? null : mean(values.map(v => (v - mean_discrepancy) ** 2))
    const missing: string[] = []
    if (criterion === null) missing.push('criterion')
    if (method === null) missing.push('method')
    if (!n_runs) missing.push('discrepancies')
    if (n_runs < errors.length) missing.push('run_discrepancies')
    if (n_runs < 2) missing.push('repetitions')
    const uncertainty = method && n_runs ? { method: method.name, ...signTest(values, method.sidedness) } : null
    if (uncertainty?.n === 0) missing.push('nonzero_signs')
    const criterion_met = criterion === null || mean_discrepancy === null ? null
      : Math.abs(mean_discrepancy) <= criterion.abs + criterion.rel * criterion.scale
    const status: EnsembleStatus = criterion_met === null ? 'insufficient' : criterion_met ? 'met' : 'not_met'
    return { checkpoint, n_runs, mean_discrepancy, variance,
      mse: mean_discrepancy === null ? null : mean_discrepancy ** 2 + variance!,
      uncertainty, criterion_met, status, missing: missing.sort() }
  })
  const status: EnsembleStatus = checkpoints.some(p => p.status === 'not_met') ? 'not_met'
    : !checkpoints.length || checkpoints.some(p => p.status === 'insufficient') ? 'insufficient' : 'met'
  return { criterion, method, n_checkpoints: checkpoints.length,
    repetitions_per_checkpoint: checkpoints.map(p => p.n_runs), checkpoints, status,
    missing: [...new Set([...checkpoints.flatMap(p => p.missing), ...(!checkpoints.length ? ['checkpoints'] : []),
      ...(criterion === null ? ['criterion'] : []), ...(method === null ? ['method'] : [])])].sort() }
}

export type EnsembleRun = IndicatorScore & { data_label: DataLabel }
/** Runs must describe the same aligned log-error checkpoints and reference label.
 * S is the mean run score, sd_S its population SD; bias/variance average checkpoint
 * decompositions. sign_consistency sums majority counts across checkpoints (not a
 * pooled sign test). n_points counts observed checkpoints. Signed evidence is
 * independent of display-score availability; findings retain missing checkpoints.
 * No label is inferred: an empty ensemble or mixed reference labels is rejected.
 */
export function ensembleScore(target: string, indicator: string, perRun: readonly EnsembleRun[], options: FindingsOptions = { criterion: null, method: null }): Score {
  if (!perRun.length || perRun.some(run => run.data_label !== perRun[0].data_label)) throw new Error('one explicit reference label required')
  const usable = perRun.filter(run => run.S !== null && !run.excluded)
  const scores = usable.map(run => { probability(run.S!); return run.S! })
  const errors = perRun.map(run => run.signed ?? [])
  const points = decompose(errors).filter(point => point.n)
  const mean_S = scores.length ? mean(scores) : null
  const bias = points.length ? mean(points.map(point => point.bias!)) : null
  return {
    target, indicator, run_id: 'ensemble', checkpoint: 'all', S: mean_S, signed_error: bias,
    n_points: points.length, data_label: perRun[0].data_label, mean_S,
    sd_S: mean_S === null ? null : Math.sqrt(mean(scores.map(score => (score - mean_S) ** 2))),
    bias, variance: points.length ? mean(points.map(point => point.variance!)) : null,
    sign_consistency: points.length ? columns(errors).reduce((sum, point) => sum + signTest(point).k, 0) : null,
    ensemble: findings(errors, options),
  }
}
