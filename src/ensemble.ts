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

export function signTest(errors: readonly number[]) {
  errors.forEach(finite)
  const positive = errors.filter(e => e > 0).length, negative = errors.filter(e => e < 0).length
  const n = positive + negative, k = Math.max(positive, negative)
  return { n, k, p: Math.min(1, 2 * binomialTail(n, k)) }
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

export interface VerdictOptions { alpha?: number; share?: number; minPoints?: number }
export function verdict(errors: Matrix, { alpha = 0.05, share = 0.5, minPoints = 5 }: VerdictOptions = {}) {
  probability(alpha); probability(share); natural(minPoints)
  if (minPoints === 0) throw new Error('minPoints must be positive')
  const points = columns(errors).filter(point => point.length)
  const shares = decompose(errors).flatMap(point => point.systematicShare === null ? [] : [point.systematicShare])
  const rejecting = points.filter(point => signTest(point).p <= alpha).length
  const systematicShare = shares.length ? mean(shares) : null
  const result: 'insufficient' | 'systematic' | 'stochastic' = points.length < minPoints ? 'insufficient'
    : rejecting > points.length / 2 && systematicShare! > share ? 'systematic' : 'stochastic'
  return { verdict: result, alpha, share, minPoints, n_points: points.length, rejecting, systematicShare }
}

export type EnsembleRun = IndicatorScore & { data_label: DataLabel }
/** Runs must describe the same aligned log-error checkpoints and reference label.
 * S is the mean run score, sd_S its population SD; bias/variance average checkpoint
 * decompositions. sign_consistency sums majority counts across checkpoints (not a
 * pooled sign test). n_points counts observed checkpoints; missing runs are excluded.
 * No label is inferred: an empty ensemble or mixed reference labels is rejected.
 */
export function ensembleScore(target: string, indicator: string, perRun: readonly EnsembleRun[]): Score {
  if (!perRun.length || perRun.some(run => run.data_label !== perRun[0].data_label)) throw new Error('one explicit reference label required')
  const usable = perRun.filter(run => run.S !== null && !run.excluded)
  const scores = usable.map(run => { probability(run.S!); return run.S! })
  const errors = usable.map(run => run.signed ?? [])
  const points = decompose(errors).filter(point => point.n)
  const mean_S = scores.length ? mean(scores) : null
  const bias = points.length ? mean(points.map(point => point.bias!)) : null
  return {
    target, indicator, run_id: 'ensemble', checkpoint: 'all', S: mean_S, signed_error: bias,
    n_points: points.length, data_label: perRun[0].data_label, mean_S,
    sd_S: mean_S === null ? null : Math.sqrt(mean(scores.map(score => (score - mean_S) ** 2))),
    bias, variance: points.length ? mean(points.map(point => point.variance!)) : null,
    sign_consistency: points.length ? columns(errors).reduce((sum, point) => sum + signTest(point).k, 0) : null,
    verdict: verdict(errors).verdict,
  }
}
