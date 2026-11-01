import type { DatedEvent, HistoricalRange } from './dataset.ts'

export interface IndicatorScore { S: number | null; signed: number[] | null; n_points: number; excluded?: string }
const missing = (): IndicatorScore => ({ S: null, signed: null, n_points: 0, excluded: 'missing data' })
const result = (S: number, n_points: number, signed: number[] | null = null): IndicatorScore => ({ S, signed, n_points })
function finite(n: number): void { if (!Number.isFinite(n)) throw new Error('expected finite number') }
function share(n: number): void { finite(n); if (n < 0 || n > 1) throw new Error('share must be in [0, 1]') }

/** Zero comparisons saturate at signed ln(2); ranges compare to the nearest endpoint. */
export function logError(sim: number, hist: number | HistoricalRange): number {
  finite(sim)
  const [lo, hi] = typeof hist === 'number' ? [hist, hist] : hist
  finite(lo); finite(hi)
  if (sim < 0 || lo < 0 || hi < lo) throw new Error('log values must be non-negative and ranges ordered')
  if (sim >= lo && sim <= hi) return 0
  const reference = sim > hi ? hi : lo
  if (sim === 0 || reference === 0) return Math.sign(sim - reference) * Math.LN2
  const ratio = sim / reference
  return ratio > 0 && Number.isFinite(ratio) ? Math.log(ratio) : Math.log(sim) - Math.log(reference)
}

/** Aligned series only; use matchCheckpoints first for dated records. */
export function scoreLog(sim: readonly number[] | null, hist: readonly (number | HistoricalRange)[] | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  if (sim.length !== hist.length) throw new Error('series lengths must match')
  if (!hist.length) return missing()
  const signed = sim.map((v, i) => logError(v, hist[i]))
  return result(Math.max(0, 1 - signed.reduce((sum, e) => sum + Math.abs(e) / signed.length, 0) / Math.LN2), signed.length, signed)
}

/** Arrays use the same class ordering; distributions must sum to one. */
export function scoreTV(sim: readonly number[] | null, hist: readonly number[] | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  if (sim.length !== hist.length) throw new Error('class lengths must match')
  if (!hist.length) return missing()
  for (const values of [sim, hist]) {
    values.forEach(share)
    if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('shares must sum to one')
  }
  return result(Math.max(0, 1 - sim.reduce((sum, v, i) => sum + Math.abs(v - hist[i]), 0) / 2), hist.length)
}

export function scoreJaccard(sim: Iterable<string> | null, hist: Iterable<string> | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  const a = new Set(sim), b = new Set(hist), union = new Set([...a, ...b])
  return result(union.size ? [...a].filter(v => b.has(v)).length / union.size : 1, 1)
}

export function scoreAdoption(sim: number | null, hist: number | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  finite(sim); finite(hist)
  return result(1 - Math.min(1, Math.abs(sim - hist) / 50), 1, [sim - hist])
}

/** Globally closest available pair first; ties: historical date, simulated date,
 * label, then original indices. Known empty lists agree; null means unavailable.
 * n_points counts historical events, or simulated events when history is empty.
 */
export function scoreEvents(sim: readonly DatedEvent[] | null, hist: readonly DatedEvent[] | null, window = 25): IndicatorScore {
  finite(window)
  if (window < 0) throw new Error('window must be non-negative')
  if (sim === null || hist === null) return missing()
  for (const e of [...sim, ...hist]) { finite(e.date); if (!e.label.trim()) throw new Error('event label required') }
  const pairs = sim.flatMap((a, i) => hist.flatMap((b, j) => a.label === b.label && Math.abs(a.date - b.date) <= window
    ? [{ i, j, distance: Math.abs(a.date - b.date) }] : []))
  pairs.sort((a, b) => a.distance - b.distance || hist[a.j].date - hist[b.j].date || sim[a.i].date - sim[b.i].date ||
    (hist[a.j].label < hist[b.j].label ? -1 : hist[a.j].label > hist[b.j].label ? 1 : 0) || a.j - b.j || a.i - b.i)
  const usedSim = new Set<number>(), usedHist = new Set<number>()
  for (const p of pairs) if (!usedSim.has(p.i) && !usedHist.has(p.j)) { usedSim.add(p.i); usedHist.add(p.j) }
  return result(sim.length + hist.length ? 2 * usedSim.size / (sim.length + hist.length) : 1, hist.length || sim.length)
}

export function scoreShare(sim: number | null, hist: number | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  share(sim); share(hist)
  return result(1 - Math.abs(sim - hist), 1, [sim - hist])
}

/** Chronological input; flags latch true at the first of two consecutive zeros.
 * Null breaks a zero pair. Later reoccupation does not erase the abandonment event.
 */
export function abandoned(residents: readonly (number | null)[]): boolean[] {
  for (const n of residents) if (n !== null) { finite(n); if (n < 0) throw new Error('residents must be non-negative') }
  const first = residents.findIndex((n, i) => n === 0 && residents[i + 1] === 0)
  return residents.map((_, i) => first >= 0 && i >= first)
}

/** Indicator keys and exclusions are lexically sorted. Weights default to one. */
export function combine(scores: Readonly<Record<string, IndicatorScore | null>>, weights: Readonly<Record<string, number>> = {}) {
  const excluded: { indicator: string; reason: string }[] = []
  let total = 0, weight = 0, n_points = 0
  for (const key of Object.keys(weights).sort()) {
    finite(weights[key])
    if (weights[key] < 0) throw new Error('weights must be non-negative')
  }
  for (const indicator of Object.keys(scores).sort()) {
    const score = scores[indicator], w = weights[indicator] ?? 1
    if (!score || score.S === null || score.excluded) { excluded.push({ indicator, reason: score?.excluded ?? 'missing data' }); continue }
    share(score.S)
    if (w === 0) { excluded.push({ indicator, reason: 'zero weight' }); continue }
    total += score.S * w; weight += w; n_points += score.n_points
  }
  return { S: weight ? total / weight : null, signed: null, n_points, excluded }
}
