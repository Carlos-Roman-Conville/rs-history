import { canonical } from '@rex/kernel'
import { binomialTail } from '../ensemble.ts'
import type { RunRecord } from '../reader.ts'
import type { EventEntry, Scope, SnapshotRef } from '../record.ts'
import { DAY_MS, type X1Arm } from './config.ts'

export interface CheckResult<T> { pass: boolean; failures: string[]; detail: T }
const result = <T>(failures: string[], detail: T): CheckResult<T> => ({ pass: failures.length === 0, failures: failures.sort(), detail })
export interface SeriesRef { quantity: string; scope: Scope }
const sameScope = (a: Scope, b: Scope) => a.kind === b.kind && a.id === b.id
/** Exact observation selectors prevent accidentally adding parents to their children. */
function numeric(run: RunRecord, ref: SeriesRef, t: number, failures: string[]): number | null {
  const rows = run.series.filter(o => o.t === t && o.quantity === ref.quantity && sameScope(o.scope, ref.scope))
  if (rows.length !== 1 || typeof rows[0].value !== 'number' || !Number.isFinite(rows[0].value)) {
    failures.push(`day ${t / DAY_MS} ${ref.quantity}/${ref.scope.id}: missing, duplicate or non-numeric observation`)
    return null
  }
  return rows[0].value
}
export type MassStores = Record<string, Record<'soil' | 'plant' | 'inventory' | 'bodies', {
  stock: SeriesRef; inflow: SeriesRef; outflow: SeriesRef
}>>
/** Flows at t are amounts during (t - day, t], in the stock's unit, not rates
 * or cumulative counters. Internal transfers appear once on each side. Checks
 * each daily interval using the observer-recorded t0 stocks for day 1, through
 * the last recorded checkpoint (including gaps). Missing t0 rows fail as day 0.
 */
export function a1MassCloses(run: RunRecord, stores: MassStores, tolerance: number | Record<string, number>) {
  const failures: string[] = [], balances: { day: number; quantity: string; residual: number | null }[] = []
  const end = Math.max(0, ...run.series.map(o => o.t), ...run.snapshots.map(o => o.t))
  if (!Object.keys(stores).length) failures.push('A1: no tracked quantities')
  if (end < DAY_MS || end % DAY_MS !== 0) failures.push('A1: missing daily checkpoints')
  for (const quantity of Object.keys(stores).sort()) {
    const limit = typeof tolerance === 'number' ? tolerance : tolerance[quantity]
    if (!Number.isFinite(limit) || limit < 0) { failures.push(`A1 ${quantity}: missing or invalid tolerance`); continue }
    for (let t = DAY_MS; t <= end; t += DAY_MS) {
      const before = failures.length
      let residual = 0
      const units = new Set<string>()
      for (const name of ['soil', 'plant', 'inventory', 'bodies'] as const) {
        const store = stores[quantity][name]
        if (!store) { failures.push(`day ${t / DAY_MS} ${quantity}: missing store ${name}`); continue }
        for (const [ref, time, sign] of [[store.stock, t, 1], [store.stock, t - DAY_MS, -1], [store.inflow, t, -1], [store.outflow, t, 1]] as const) {
          const value = numeric(run, ref, time, failures)
          if (value !== null) residual += sign * value
          for (const o of run.series) if (o.t === time && o.quantity === ref.quantity && sameScope(o.scope, ref.scope)) units.add(o.unit)
        }
      }
      if (units.size !== 1) failures.push(`day ${t / DAY_MS} ${quantity}: incompatible units`)
      const complete = failures.length === before
      balances.push({ day: t / DAY_MS, quantity, residual: complete ? residual : null })
      if (complete && Math.abs(residual) > limit) failures.push(`day ${t / DAY_MS} ${quantity}: mass residual ${residual} exceeds ${limit}`)
    }
  }
  return result(failures, { balances })
}

export interface IntentionRef { type: string; personField: string }
export interface DryPair {
  control: RunRecord; dry: RunRecord
  /** Owner-specified common harvest checkpoint; harvested mass is this harvest's total. */
  harvestTime: number
  harvest: SeriesRef; foodPrice: SeriesRef
  work: IntentionRef; eat: IntentionRef; departure: IntentionRef
}
function persons(run: RunRecord, ref: IntentionRef, failures: string[]): Set<string> {
  const ids = new Set<string>()
  for (const event of run.events.filter(e => e.type === ref.type)) {
    const payload = event.payload
    const person = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>)[ref.personField] : undefined
    if (typeof person !== 'string' || !person.trim()) failures.push(`event ${event.id}: missing person field ${ref.personField}`)
    else ids.add(person)
  }
  return ids
}
function distance(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : 1 - [...a].filter(id => b.has(id)).length / union
}
/** Ten distinct paired seeds; ties do not count as successes. Missing data fail
 * rather than reduce the denominator. Price window is (harvest, harvest + 90d].
 * Intentions use the whole record. Departure sets are compared, with no invented
 * direction or pass threshold (the specification supplies neither for leaves).
 */
export function a2DrySeason(pairs: readonly DryPair[]) {
  const failures: string[] = []
  if (pairs.length !== 10) failures.push(`A2: expected 10 pairs, got ${pairs.length}`)
  const seen = new Set<number>()
  const rows = [...pairs].sort((a, b) => a.control.header.seed - b.control.header.seed).map(pair => {
    const { control, dry, harvestTime: t } = pair, seed = control.header.seed
    const local: string[] = []
    if (seed !== dry.header.seed || seen.has(seed)) local.push(`seed ${seed}: mismatched or duplicate pair`)
    seen.add(seed)
    if (!Number.isSafeInteger(t) || t < 0 || t % DAY_MS !== 0) local.push(`day ${t / DAY_MS}: invalid harvest checkpoint`)
    const c = numeric(control, pair.harvest, t, local), d = numeric(dry, pair.harvest, t, local)
    const price = (run: RunRecord) => {
      const values = Array.from({ length: 90 }, (_, i) => numeric(run, pair.foodPrice, t + (i + 1) * DAY_MS, local))
      return values.some(v => v === null) ? null : (values as number[]).reduce((sum, v) => sum + v / 90, 0)
    }
    const cp = price(control), dp = price(dry)
    const work = distance(persons(control, pair.work, local), persons(dry, pair.work, local))
    const eat = distance(persons(control, pair.eat, local), persons(dry, pair.eat, local))
    const leaves = distance(persons(control, pair.departure, local), persons(dry, pair.departure, local))
    failures.push(...local.map(f => `seed ${seed}: ${f}`))
    return { seed, day: t / DAY_MS, harvest: c === null || d === null ? null : d - c,
      price: cp === null || dp === null ? null : dp - cp, work, eat, leaves }
  })
  const harvest = rows.filter(r => r.harvest !== null && r.harvest < 0).length
  const price = rows.filter(r => r.price !== null && r.price > 0).length
  const work = rows.filter(r => r.work > 0).length, eat = rows.filter(r => r.eat > 0).length
  for (const [name, count] of Object.entries({ harvest, price, work, eat })) {
    if (count < 9) failures.push(`A2 ${name}: ${count}/10 pairs; failed seeds/days: ${rows.filter(r => name === 'harvest' ? r.harvest === null || r.harvest >= 0 : name === 'price' ? r.price === null || r.price <= 0 : r[name as 'work' | 'eat'] === 0).map(r => `${r.seed}/day ${r.day}`).join(', ')}`)
  }
  const measurable = pairs.some(p => [...p.control.events, ...p.dry.events].some(e => e.type === p.departure.type))
  return result(failures, { pairs: rows, harvest: { successes: harvest, p: binomialTail(pairs.length, harvest) },
    price: { successes: price, p: binomialTail(pairs.length, price) }, work, eat,
    leaves: measurable ? rows.map(r => ({ seed: r.seed, distance: r.leaves })) : 'not measurable' as const })
}

export interface SeedRun { arm: X1Arm; run: RunRecord; businessSizeQuantity: string }
/** Business vectors are keyed by scope kind/id, never by observation order. */
export function a3SeedsDiffer(runs: readonly SeedRun[]) {
  const failures: string[] = [], differing: X1Arm[] = []
  for (const arm of ['control', 'dry'] as const) {
    const seeds = new Set<number>(), vectors: string[] = []
    for (const { run, businessSizeQuantity } of runs.filter(r => r.arm === arm).sort((a, b) => a.run.header.seed - b.run.header.seed)) {
      const seed = run.header.seed, label = `${arm} seed ${seed} day 730`
      if (seeds.has(seed)) failures.push(`${label}: duplicate seed`)
      seeds.add(seed)
      const rows = run.series.filter(o => o.t === 730 * DAY_MS && o.quantity === businessSizeQuantity)
      const keys = rows.map(o => `${o.scope.kind}/${o.scope.id}`)
      if (!rows.length || rows.some(o => typeof o.value !== 'number') || new Set(keys).size !== rows.length) {
        failures.push(`${label}: missing, duplicate or non-numeric business sizes`); continue
      }
      vectors.push(canonical(rows.map((o, i) => [keys[i], o.value]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : 1)))
    }
    if (seeds.size < 2 || new Set(vectors).size < 2) failures.push(`${arm} day 730: no differing pair of seeds`)
    else differing.push(arm)
  }
  return result(failures, { differing })
}

export interface TraceTypes { consumptionTypes: readonly string[]; labourTypes: readonly string[]; intentionTypes: readonly string[]; deathType: string }
export function a4Traces(run: RunRecord, types: TraceTypes) {
  const failures: string[] = [], events = new Map<string, EventEntry>()
  for (const event of run.events) {
    if (events.has(event.id)) failures.push(`event ${event.id}: duplicate id`)
    events.set(event.id, event)
  }
  let decisions = 0, deaths = 0
  for (const event of run.events) {
    if (event.type === types.deathType) {
      deaths++
      if (typeof event.cause !== 'string' || !event.cause.trim() || event.cause === event.id || !events.has(event.cause)) failures.push(`event ${event.id}: death must have exactly one recorded cause`)
    }
    if (![...types.consumptionTypes, ...types.labourTypes].includes(event.type)) continue
    decisions++
    const seen = new Set([event.id])
    let cause = event.cause, found = false, broken = false
    while (cause !== undefined) {
      const parent = events.get(cause)
      if (!parent || seen.has(cause)) { broken = true; break }
      seen.add(cause)
      if (types.intentionTypes.includes(parent.type)) found = true
      cause = parent.cause
    }
    if (!found || broken) failures.push(`event ${event.id}: missing intention ancestor or broken/cyclic cause chain`)
  }
  return result(failures, { decisions, deaths })
}

/** Compare both kernel and participant hashes; checkpoint union catches omissions.
 * Failures are lexical; checkpoint detail is numeric. Empty runs cannot prove inertness.
 */
export function gInert(attachedSnapshots: readonly SnapshotRef[], detachedSnapshots: readonly SnapshotRef[]) {
  const failures: string[] = []
  const index = (rows: readonly SnapshotRef[], side: string) => {
    const map = new Map<number, SnapshotRef>()
    for (const row of rows) {
      if (map.has(row.t)) failures.push(`day ${row.t / DAY_MS}: duplicate ${side} checkpoint`)
      map.set(row.t, row)
    }
    return map
  }
  const attached = index(attachedSnapshots, 'attached'), detached = index(detachedSnapshots, 'detached')
  const checkpoints = [...new Set([...attached.keys(), ...detached.keys()])].sort((a, b) => a - b)
  if (!checkpoints.length) failures.push('G-inert: no checkpoints')
  for (const t of checkpoints) {
    const a = attached.get(t), d = detached.get(t)
    if (!a || !d) failures.push(`day ${t / DAY_MS}: missing checkpoint`)
    else if (canonical(a) !== canonical(d)) failures.push(`day ${t / DAY_MS}: snapshot hashes differ`)
  }
  return result(failures, { checkpoints })
}
