import { TROPICAL_YEAR } from '@rex/kernel'
import type { DataLabel } from './record.ts'

export type HistoricalRange = readonly [low: number, high: number]
export interface DatedEvent { date: number; label: string }
export type DatasetValue = number | HistoricalRange | readonly string[] | readonly DatedEvent[] | null
export interface DatasetCheckpoint {
  date: number; value: DatasetValue; label: DataLabel; source: string; note?: string
}
export interface ComparisonDataset {
  target: string; indicator: string; version: string; checkpoints: readonly DatasetCheckpoint[]
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const event = (v: unknown): boolean => object(v) && finite(v.date) && text(v.label) && Object.keys(v).every(k => ['date', 'label'].includes(k))
const value = (v: unknown): boolean => v === null || finite(v) || (Array.isArray(v) && (
  (v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] <= v[1]) ||
  Array.from(v).every(text) || Array.from(v).every(event)))

/** Sorted diagnostics; dates are decimal astronomical years, including year zero. */
export function validateDataset(input: unknown): string[] {
  if (!object(input)) return ['dataset must be an object']
  const errors: string[] = []
  for (const key of ['target', 'indicator', 'version']) if (!text(input[key])) errors.push(`${key}: expected non-empty string`)
  for (const key of Object.keys(input)) if (!['target', 'indicator', 'version', 'checkpoints'].includes(key)) errors.push(`${key}: unknown field`)
  if (!Array.isArray(input.checkpoints)) errors.push('checkpoints: expected array')
  else {
    const dates = new Set<number>()
    Array.from(input.checkpoints).forEach((p, i) => {
      const prefix = `checkpoints[${i}]`
      if (!object(p)) { errors.push(`${prefix}: expected object`); return }
      if (!finite(p.date)) errors.push(`${prefix}.date: expected finite year`)
      else if (dates.has(p.date)) errors.push(`${prefix}.date: duplicate year`)
      else dates.add(p.date)
      if (!value(p.value)) errors.push(`${prefix}.value: invalid value`)
      if (!['researched', 'estimate', 'fiction'].includes(p.label as string)) errors.push(`${prefix}.label: invalid label`)
      if (!text(p.source)) errors.push(`${prefix}.source: required`)
      if (p.note !== undefined && typeof p.note !== 'string') errors.push(`${prefix}.note: expected string`)
      for (const key of Object.keys(p)) if (!['date', 'value', 'label', 'source', 'note'].includes(key)) errors.push(`${prefix}.${key}: unknown field`)
    })
  }
  return errors.sort()
}

export function simDate(t: number, epoch: number): number {
  if (!finite(t) || !finite(epoch)) throw new Error('time and epoch must be finite')
  return epoch + t / TROPICAL_YEAR
}

export interface CheckpointMatch<T> { checkpoint: DatasetCheckpoint; simulated: { t: number; value: T } }
/** Inputs must describe one quantity/scope. Output and exclusions are date sorted.
 * period_ms is the record sampling period, not the historical dataset spacing.
 * A nearest null is missing; a farther non-null checkpoint never substitutes for it.
 */
export function matchCheckpoints<T>(dataset: ComparisonDataset, series: readonly { t: number; value: T | null }[], epoch: number, period_ms: number) {
  const errors = validateDataset(dataset)
  if (errors.length) throw new Error(errors.join('; '))
  if (!finite(period_ms) || period_ms <= 0 || !finite(epoch)) throw new Error('invalid checkpoint period or epoch')
  const rows = [...series].sort((a, b) => a.t - b.t)
  rows.forEach((r, i) => { if (!finite(r.t) || (i > 0 && r.t === rows[i - 1].t)) throw new Error('invalid or duplicate simulated checkpoint') })
  const matched: CheckpointMatch<T>[] = []
  const excluded: { date: number; reason: string }[] = []
  for (const checkpoint of [...dataset.checkpoints].sort((a, b) => a.date - b.date)) {
    const t = (checkpoint.date - epoch) * TROPICAL_YEAR
    let nearest: typeof rows[number] | undefined
    for (const r of rows) if (!nearest || Math.abs(r.t - t) < Math.abs(nearest.t - t)) nearest = r
    const reason = checkpoint.value === null ? 'missing historical value'
      : !nearest || Math.abs(nearest.t - t) > period_ms / 2 ? 'no simulated checkpoint within half period'
        : nearest.value === null ? 'missing simulated value' : null
    if (reason) excluded.push({ date: checkpoint.date, reason })
    else matched.push({ checkpoint, simulated: { t: nearest!.t, value: nearest!.value as T } })
  }
  return { matched, excluded, n_points: matched.length, n_excluded: excluded.length }
}
