import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { canonical, Scheduler, EventBus } from '@rex/kernel'
import { attachObserver, openRun, readRun, x1, compareEvents } from '../src/index.ts'
import type { RunRecord, Observation, EventEntry, SnapshotRef } from '../src/index.ts'
import { header, observation, event, snapshot } from './fixtures.ts'

const root = resolve('.codex-runs'), dirs: string[] = [], day = x1.DAY_MS
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    if (!dir.startsWith(root + '\\') && !dir.startsWith(root + '/')) throw new Error('unsafe fixture path')
    rmSync(dir, { recursive: true, force: true })
  }
})
function record(series: Observation[] = [], events: EventEntry[] = [], seed = 1, snapshots: SnapshotRef[] = []): RunRecord {
  const dir = mkdtempSync(join(root, 'x1-test-')); dirs.push(dir)
  const writer = openRun(dir, { ...header, seed, run_id: `X1/${seed}/${header.config_hash}`, checkpoints: { first_ms: 0, period_ms: day } })
  series.forEach(writer.observe)
  events.slice().sort(compareEvents).forEach(writer.event)
  snapshots.forEach(writer.snapshot)
  writer.close()
  return readRun(dir)
}
const obs = (quantity: string, t: number, value: number | null, id = 'world/all'): Observation => ({ ...observation, quantity, t, value, scope: { kind: 'world', id }, unit: 'kg' })
const ref = (quantity: string): x1.SeriesRef => ({ quantity, scope: observation.scope })
const evt = (id: string, type: string, sequence: number, cause?: string, person = 'person/a'): EventEntry => ({ ...event, id, type, sequence, cause, payload: { person }, payload_hash: undefined })
function mass() {
  const rows: Observation[] = []
  const stores: x1.MassStores = { N: {} as x1.MassStores[string] }
  for (const name of ['soil', 'plant', 'inventory', 'bodies'] as const) {
    stores.N[name] = { stock: ref(`${name}.N`), inflow: ref(`${name}.in`), outflow: ref(`${name}.out`) }
    rows.push(obs(`${name}.N`, 0, 10), obs(`${name}.N`, day, 11), obs(`${name}.in`, day, 2), obs(`${name}.out`, day, 1))
  }
  return { rows, stores }
}
it('A1 closes all four stores and names day/quantity for broken mass or missing values', () => {
  const { rows, stores } = mass(), run = record(rows), before = canonical(run)
  expect(x1.a1MassCloses(run, stores, { N: 0 })).toMatchObject({ pass: true, detail: { balances: [{ day: 1, quantity: 'N', residual: 0 }] } })
  expect(canonical(run)).toBe(before)
  expect(x1.a1MassCloses(record(rows.map(o => o.quantity === 'plant.N' && o.t === day ? { ...o, value: 12 } : o)), stores, 0).failures).toContain('day 1 N: mass residual 1 exceeds 0')
  expect(x1.a1MassCloses(record(rows.map(o => o.quantity === 'soil.in' ? { ...o, value: null } : o)), stores, 0).failures.join()).toContain('day 1 soil.in')
  expect(x1.a1MassCloses(run, stores, {}).pass).toBe(false)
  expect(x1.a1MassCloses(run, {}, 0).pass).toBe(false)
})
it('A1 catches missing intermediate days, duplicate observations and incompatible units', () => {
  const { rows, stores } = mass()
  expect(x1.a1MassCloses(record([...rows, obs('soil.N', 3 * day, 11)]), stores, 0).failures.join()).toContain('day 2')
  expect(x1.a1MassCloses(record([...rows, rows[0]]), stores, 0).failures.join()).toContain('day 0 soil.N')
  expect(x1.a1MassCloses(record(rows.map((o, i) => i === 0 ? { ...o, unit: 'g' } : o)), stores, 0).failures).toContain('day 1 N: incompatible units')
})
function pairs(): x1.DryPair[] {
  return Array.from({ length: 10 }, (_, i) => {
    const make = (dry: boolean) => record([
      obs('harvest', day, dry ? 8 : 10),
      obs('price', day, dry ? 0 : 1000), // harvest day is outside the window
      ...Array.from({ length: 90 }, (_, j) => obs('price', (j + 2) * day, dry ? 3 : 2)),
      obs('price', 92 * day, dry ? 0 : 1000), // also outside the window
    ], [evt('work', 'work-intention', 1, undefined, dry ? 'b' : 'a'), evt('eat', 'eat-intention', 2, undefined, dry ? 'b' : 'a')], i + 1)
    return { control: make(false), dry: make(true), harvestTime: day, harvest: ref('harvest'), foodPrice: ref('price'), work: { type: 'work-intention', personField: 'person' }, eat: { type: 'eat-intention', personField: 'person' }, departure: { type: 'leave-intention', personField: 'person' } }
  })
}
it('A2 passes nine of ten, reports exact one-sided sign p and excludes leaves without intentions', () => {
  const input = pairs()
  input[0].dry = input[0].control
  const check = x1.a2DrySeason(input)
  expect(check.pass).toBe(true)
  expect(check.detail.harvest.successes).toBe(9)
  expect(check.detail.harvest.p).toBeCloseTo(11 / 1024, 14)
  expect(check.detail.price.successes).toBe(9)
  expect(check.detail.price.p).toBeCloseTo(11 / 1024, 14)
  expect(check.detail.leaves).toBe('not measurable')
  expect(check.detail.work).toBe(9)
  expect(check.detail.eat).toBe(9)
  input[1].dry = input[1].control
  const broken = x1.a2DrySeason(input)
  expect(broken.pass).toBe(false)
  expect(broken.failures.join()).toContain('2/day 1')
})
it('A2 rejects missing price days, mismatched/duplicate seeds and missing person payloads', () => {
  const input = pairs()
  input[0].dry = record(input[0].dry.series.filter(o => o.t !== 50 * day), [evt('bad-person', 'eat-intention', 1, undefined, '')], 2)
  const check = x1.a2DrySeason(input)
  expect(check.pass).toBe(false)
  expect(check.failures.join()).toContain('day 50 price')
  expect(check.failures.join()).toContain('mismatched or duplicate pair')
  expect(check.failures.join()).toContain('event bad-person')
  input[0] = input[1]
  expect(x1.a2DrySeason(input).pass).toBe(false)
  expect(x1.a2DrySeason([]).pass).toBe(false)
})
it('A2 compares departures only when departure intentions are present', () => {
  const input = pairs(), p = input[0]
  p.dry = record(p.dry.series, [...p.dry.events, evt('leave', 'leave-intention', 3)], 1)
  const check = x1.a2DrySeason(input)
  expect(check.pass).toBe(true)
  expect(check.detail.leaves).toEqual(expect.arrayContaining([{ seed: 1, distance: 1 }]))
})
it('A3 needs distinct business vectors at day 730 in each arm, keyed by business identity', () => {
  const runs: x1.SeedRun[] = (['control', 'dry'] as const).flatMap(arm => [1, 2].map(seed => ({ arm, businessSizeQuantity: 'posts', run: record([obs('posts', 730 * day, seed, 'business/a'), obs('posts', 730 * day, 4, 'business/b')], [], seed) })))
  expect(x1.a3SeedsDiffer(runs).pass).toBe(true)
  runs[3].run = record([...runs[2].run.series].reverse(), [], 2)
  expect(x1.a3SeedsDiffer(runs).failures).toContain('dry day 730: no differing pair of seeds')
  runs[3].run = record([obs('posts', 729 * day, 99)], [], 2)
  expect(x1.a3SeedsDiffer(runs).failures.join()).toContain('dry seed 2 day 730: missing')
  expect(x1.a3SeedsDiffer([]).pass).toBe(false)
})
it('A4 follows multiple cause links and names broken decisions and deaths', () => {
  const types: x1.TraceTypes = { consumptionTypes: ['eat'], labourTypes: ['labour'], intentionTypes: ['intention'], deathType: 'death' }
  const rows = [evt('mind', 'intention', 1), evt('trade', 'trade', 2, 'mind'), evt('eat', 'eat', 3, 'trade'), evt('labour', 'labour', 4, 'mind'), evt('death', 'death', 5, 'eat')]
  expect(x1.a4Traces(record([], rows), types)).toMatchObject({ pass: true, detail: { decisions: 2, deaths: 1 } })
  const broken = x1.a4Traces(record([], rows.map(e => e.id === 'eat' || e.id === 'death' ? { ...e, cause: undefined } : e)), types)
  expect(broken.pass).toBe(false)
  expect(broken.failures.join()).toContain('event eat:')
  expect(broken.failures.join()).toContain('event death:')
  expect(x1.a4Traces(record([], rows.map(e => e.id === 'trade' ? { ...e, cause: 'eat' } : e)), types).failures.join()).toContain('event eat:')
  expect(x1.a4Traces(record([], rows.map(e => e.id === 'trade' ? { ...e, cause: 'missing' } : e)), types).pass).toBe(false)
})
it('G-inert compares all checkpoint and participant hashes, reporting changed or absent days', () => {
  const snapshots = record([], [], 1, [snapshot, { ...snapshot, t: day }]).snapshots
  expect(x1.gInert(snapshots, [...snapshots].reverse()).pass).toBe(true)
  const changed = record([], [], 1, [snapshot, { ...snapshot, t: day, participants: { engine: 'aaaaaaaaaaaaaaaa' } }]).snapshots
  expect(x1.gInert(snapshots, changed).failures).toEqual(['day 1: snapshot hashes differ'])
  expect(x1.gInert(snapshots, [snapshot]).failures).toEqual(['day 1: missing checkpoint'])
  expect(x1.gInert(snapshots, [snapshot, snapshot]).failures.join()).toContain('day 0: duplicate detached')
  expect(x1.gInert([], []).pass).toBe(false)
})

it('V11 A1 uses observer-written initial stocks and names day 0 when one is missing', () => {
  const { rows, stores } = mass()
  const dir = mkdtempSync(join(root, 'x1-test-')); dirs.push(dir)
  const writer = openRun(dir, header), bus = new EventBus()
  const scheduler = new Scheduler({ emit: bus.emit, order: { phases: ['record'], order: { record: ['history.record'] } } })
  const quantities = [...new Set(rows.map(o => o.quantity))]
  attachObserver({ scheduler, bus, writer, checkpoint: { first_ms: 0, period_ms: day }, classes: { version: 1, map: [] },
    reads: quantities.map(quantity => ({ ...obs(quantity, 0, 0), port: quantity,
      read: () => rows.find(o => o.quantity === quantity && o.t === scheduler.t)?.value ?? null,
    })),
  })
  scheduler.runUntil(day)
  writer.close()
  const run = readRun(dir)
  expect(x1.a1MassCloses(run, stores, 0).pass).toBe(true)
  run.series = run.series.filter(o => !(o.t === 0 && o.quantity === 'soil.N'))
  const check = x1.a1MassCloses(run, stores, 0)
  expect(check.pass).toBe(false)
  expect(check.failures.join()).toContain('day 0 soil.N')
})
