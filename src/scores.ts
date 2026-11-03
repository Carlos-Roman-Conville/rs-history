import type { DatedEvent, HistoricalRange } from './dataset.ts'

/** Numeric e is sim minus ref (nearest compatible value for a range).
 * Sets retain their members; subtraction is undefined, so e is null.
 * Unmatched event dates retain the available side with null discrepancy.
 */
export interface RawDiscrepancy {
  sim: number | readonly string[] | null
  ref: number | HistoricalRange | readonly string[] | null
  e: number | null
  e_log: number | null
  unit: string | null
}
export interface IndicatorScore {
  S: number | null; signed: number[] | null; n_points: number; excluded?: string
  raw: RawDiscrepancy[]; conventions: string[]
}
const missing = (): IndicatorScore => ({ S: null, signed: null, n_points: 0, raw: [], conventions: [], excluded: 'missing data' })
const result = (S: number, raw: RawDiscrepancy[], signed: number[] | null = null, conventions: string[] = []): IndicatorScore =>
  ({ S, signed, n_points: raw.length, raw, conventions })
const rawNumber = (sim: number, ref: number, unit: string | null, proportional = false): RawDiscrepancy =>
  ({ sim, ref, e: sim - ref, e_log: proportional && sim > 0 && ref > 0 ? logError(sim, ref) : null, unit })
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
export function scoreLog(sim: readonly number[] | null, hist: readonly (number | HistoricalRange)[] | null, unit: string | null = null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  if (sim.length !== hist.length) throw new Error('series lengths must match')
  if (!hist.length) return missing()
  const signed = sim.map((v, i) => logError(v, hist[i]))
  const raw = sim.map((v, i) => {
    const reference = hist[i]
    const closest = typeof reference === 'number' ? reference : Math.max(reference[0], Math.min(reference[1], v))
    return { ...rawNumber(v, closest, unit, true), ref: reference }
  })
  const conventions = ['zero_rule_ln2']
  if (hist.some(v => typeof v !== 'number')) conventions.push('interval_compatibility')
  return result(Math.max(0, 1 - signed.reduce((sum, e) => sum + Math.abs(e) / signed.length, 0) / Math.LN2), raw, signed, conventions)
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
  return result(Math.max(0, 1 - sim.reduce((sum, v, i) => sum + Math.abs(v - hist[i]), 0) / 2), sim.map((v, i) => rawNumber(v, hist[i], '1', true)))
}

export function scoreJaccard(sim: Iterable<string> | null, hist: Iterable<string> | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  const a = new Set(sim), b = new Set(hist), union = new Set([...a, ...b])
  return result(union.size ? [...a].filter(v => b.has(v)).length / union.size : 1, [{ sim: [...a].sort(), ref: [...b].sort(), e: null, e_log: null, unit: null }])
}

export function scoreAdoption(sim: number | null, hist: number | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  finite(sim); finite(hist)
  return result(1 - Math.min(1, Math.abs(sim - hist) / 50), [rawNumber(sim, hist, 'year')], [sim - hist], ['adoption_normaliser_50'])
}

/** Maximum-cardinality same-label matching within a fixed symmetric window.
 * Sorted two-pointer sweeps do not guarantee minimum total date error.
 * Known empty lists agree; null means unavailable.
 * n_points counts historical events, or simulated events when history is empty.
 * Raw rows follow those points in lexical label/date order; unmatched simulated
 * events still penalise F1 but are not additional historical comparison points.
 */
export function scoreEvents(sim: readonly DatedEvent[] | null, hist: readonly DatedEvent[] | null, window = 25): IndicatorScore {
  finite(window)
  if (window < 0) throw new Error('window must be non-negative')
  if (sim === null || hist === null) return missing()
  for (const e of [...sim, ...hist]) { finite(e.date); if (!e.label.trim()) throw new Error('event label required') }
  const byLabel = (events: readonly DatedEvent[]) => {
    const groups = new Map<string, number[]>()
    for (const e of events) {
      const dates = groups.get(e.label) ?? []
      dates.push(e.date)
      groups.set(e.label, dates)
    }
    for (const dates of groups.values()) dates.sort((a, b) => a - b)
    return groups
  }
  const simulated = byLabel(sim), historical = byLabel(hist)
  let matches = 0
  const raw: RawDiscrepancy[] = []
  for (const label of [...new Set([...simulated.keys(), ...historical.keys()])].sort()) {
    const a = simulated.get(label) ?? [], b = historical.get(label) ?? []
    let i = 0, j = 0
    while (i < a.length && j < b.length) {
      if (Math.abs(a[i] - b[j]) <= window) { raw.push(rawNumber(a[i], b[j], 'year')); matches++; i++; j++ }
      else if (a[i] < b[j]) i++
      else { raw.push({ sim: null, ref: b[j++], e: null, e_log: null, unit: 'year' }) }
    }
    while (j < b.length) raw.push({ sim: null, ref: b[j++], e: null, e_log: null, unit: 'year' })
    if (!hist.length) for (const date of a) raw.push({ sim: date, ref: null, e: null, e_log: null, unit: 'year' })
  }
  return result(sim.length + hist.length ? 2 * matches / (sim.length + hist.length) : 1, raw)
}

export function scoreShare(sim: number | null, hist: number | null): IndicatorScore {
  if (sim === null || hist === null) return missing()
  share(sim); share(hist)
  return result(1 - Math.abs(sim - hist), [rawNumber(sim, hist, '1', true)], [sim - hist])
}

export interface VacancyStatus { t: number; status: 'abandoned' | 'occupied' | 'insufficient' }
/** Samples must be chronological. Non-null events assert complete coverage of the
 * sample interval (including a known empty log); null means coverage is unavailable.
 * A confirmed event latches from its first zero sample, even after reoccupation.
 * Unconfirmed zeros are insufficient; positive samples are occupied.
 */
export function abandoned(samples: readonly { t: number; residents: number | null }[],
  events: readonly { t: number; kind: 'arrive' | 'leave' }[] | null,
  t_vacancy_ms: number | null): VacancyStatus[] {
  if (t_vacancy_ms !== null) { finite(t_vacancy_ms); if (t_vacancy_ms <= 0) throw new Error('vacancy duration must be positive') }
  samples.forEach((s, i) => {
    finite(s.t)
    if (i && s.t <= samples[i - 1].t) throw new Error('samples must be strictly chronological')
    if (s.residents !== null) { finite(s.residents); if (s.residents < 0) throw new Error('residents must be non-negative') }
  })
  const arrivals = (events ?? []).filter(e => { finite(e.t); return e.kind === 'arrive' }).map(e => e.t).sort((a, b) => a - b)
  let start = -1, confirmed = -1, arrival = 0
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    while (arrival < arrivals.length && arrivals[arrival] <= sample.t) {
      if (start >= 0 && arrivals[arrival] > samples[start].t) start = -1
      arrival++
    }
    if (sample.residents !== 0) { start = -1; continue }
    if (start < 0) start = i
    if (events !== null && t_vacancy_ms !== null && sample.t - samples[start].t >= t_vacancy_ms) { confirmed = start; break }
  }
  return samples.map((s, i) => ({ t: s.t, status: confirmed >= 0 && i >= confirmed ? 'abandoned'
    : t_vacancy_ms === null ? 'insufficient' : s.residents !== null && s.residents > 0 ? 'occupied' : 'insufficient' }))
}

/** Display only, never an input to a Verdict.
 * Indicator keys and exclusions are lexically sorted. Weights default to one. */
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
