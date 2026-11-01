import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Scheduler, EventBus, streams, canonical, fnv1a64 } from '@rex/kernel'
import { attachObserver, openRun, readRun, type RunWriter, type EventEntry, type Observation, type SnapshotRef, type ObserverRead } from '../src/index.ts'
import { header } from './fixtures.ts'

const classes = { version: 1 as const, map: [{ source: 'toy.fast', type: 'draw', class: 'economic' as const }] }
const scope = { kind: 'world' as const, id: 'toy/world' }
function memory() {
  const events: EventEntry[] = [], series: Observation[] = [], snapshots: SnapshotRef[] = []
  const writer: RunWriter = {
    event: e => { events.push(e) }, observe: o => { series.push(o) }, snapshot: s => { snapshots.push(s) },
    aggregate() {}, fail: vi.fn(), close() {},
  }
  return { writer, events, series, snapshots }
}
function toy() {
  const bus = new EventBus(), random = streams(42)
  const scheduler = new Scheduler({ rng: random, emit: bus.emit, order: {
    phases: ['fast', 'aggregate', 'record'],
    order: { fast: ['toy.fast'], aggregate: ['toy.aggregate'], record: ['history.record'] },
  } })
  const state = { draws: [] as number[], total: 0, ticks: 0 }
  scheduler.register({ id: 'toy.fast', phase: 'fast', period: 10, mechanisms: ['toy.draw'], run(ctx) {
    const value = ctx.rng('toy.draw')()
    state.draws.push(value)
    ctx.emit('draw', { value })
  } })
  scheduler.register({ id: 'toy.aggregate', phase: 'aggregate', period: 10, mechanisms: [], run(ctx) {
    state.total += state.draws.at(-1)!
    state.ticks++
    ctx.emit('total', { total: state.total }, bus.since().at(-1)!.id)
  } })
  const hash = () => fnv1a64(canonical(state))
  const reads: ObserverRead[] = [{ quantity: 'toy.total', unit: '1', port: 'total', scope, read: () => state.total }]
  return { bus, scheduler, state, random, reads, hash }
}
const checkpoint = { period_ms: 10, first_ms: 10 }

it('V1 G-inert preserves draws, events, RNG state and engine hashes at all 100 checkpoints', () => {
  const plain = toy(), recorded = toy(), rows = memory()
  const register = vi.spyOn(recorded.scheduler, 'register')
  attachObserver({ ...recorded, ...rows, checkpoint, classes,
    snapshot: () => ({ kernel_hash: recorded.hash(), participants: { toy: recorded.hash() } }),
  })
  expect(register).toHaveBeenCalledTimes(1)
  expect(register.mock.calls[0][0]).toMatchObject({ id: 'history.record', phase: 'record', readonly: true, mechanisms: [], period: 10, offset: 10 })
  for (let t = 10; t <= 1000; t += 10) {
    plain.scheduler.runUntil(t); recorded.scheduler.runUntil(t)
    expect(recorded.hash()).toBe(plain.hash())
    expect(recorded.state.draws).toEqual(plain.state.draws)
    expect(recorded.bus.state()).toEqual(plain.bus.state())
    expect(recorded.random.state()).toEqual(plain.random.state())
    expect(rows.snapshots.at(-1)).toEqual({ t, kernel_hash: plain.hash(), participants: { toy: plain.hash() } })
  }
  expect(rows.series).toHaveLength(100)
  expect(rows.events).toHaveLength(200)
})

it('V4 drains every event once in kernel order before observing the same instant', () => {
  const run = toy(), rows = memory(), calls: string[] = []
  const event = rows.writer.event
  rows.writer.event = e => { calls.push(`event:${e.t}`); event(e) }
  attachObserver({ ...run, ...rows, checkpoint: { period_ms: 20, first_ms: 30 }, classes,
    reads: [{ ...run.reads[0], mode: 'coarse', read() { calls.push(`read:${run.scheduler.t}`); return run.state.total } }],
  })
  run.scheduler.runUntil(50)
  expect(rows.series.map(o => o.t)).toEqual([30, 50])
  expect(rows.series.every(o => o.mode === 'coarse')).toBe(true)
  expect(calls).toEqual([...Array(2).fill('event:10'), ...Array(2).fill('event:20'), ...Array(2).fill('event:30'), 'read:30', ...Array(2).fill('event:40'), ...Array(2).fill('event:50'), 'read:50'])
  expect(rows.series.at(-1)!.value).toBe(run.state.total)
  expect(rows.events).toEqual(run.bus.state().records.map(({ event: e, phase, position, sequence }) => {
    const { payload, ...identity } = e
    return { ...identity, phase, position, sequence, ...(e.type === 'draw'
      ? { class: 'economic', payload }
      : { class: 'other', payload_hash: fnv1a64(canonical(payload)) }) }
  }))
})

it('missing reads are null and counted; every read runs in declared order at later checkpoints', () => {
  const run = toy(), rows = memory(), order: string[] = [], value = ['technology/a']
  const status = attachObserver({ ...run, ...rows, checkpoint, classes, reads: [
    { ...run.reads[0], read() { order.push('throws'); throw new Error('unavailable') } },
    { ...run.reads[0], read() { order.push('null'); return null } },
    { ...run.reads[0], read() { order.push('ok'); return value } },
  ] })
  run.scheduler.runUntil(20)
  value.push('technology/b')
  expect(order).toEqual(['throws', 'null', 'ok', 'throws', 'null', 'ok'])
  expect(rows.series.map(o => o.value)).toEqual([null, null, ['technology/a'], null, null, ['technology/a']])
  expect(status).toMatchObject({ stopped: false, readFailures: 2, missingValues: 4 })
  expect(rows.writer.fail).not.toHaveBeenCalled()
})

it('a throwing writer marks the manifest non-reportable and engines still finish', () => {
  const dir = mkdtempSync(join(resolve('.'), '.observer-test-'))
  try {
    const run = toy(), writer = openRun(dir, header)
    const observe = vi.fn(() => { throw new Error('disk unavailable') })
    const status = attachObserver({ ...run, writer: { ...writer, observe }, checkpoint, classes })
    expect(() => run.scheduler.runUntil(1000)).not.toThrow()
    writer.close()
    expect(readRun(dir).header).toMatchObject({ reportable: false, non_reportable_reason: 'disk unavailable' })
    expect(status.stopped).toBe(true)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(run.state.ticks).toBe(100)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it.each(['bus', 'event', 'snapshot', 'fail'] as const)('G-inert contains %s failures and never retries recording', fault => {
  const run = toy(), rows = memory()
  const broken = vi.fn(() => { throw new Error('record fault') })
  if (fault === 'bus') vi.spyOn(run.bus, 'state').mockImplementation(broken)
  if (fault === 'event') rows.writer.event = broken
  if (fault === 'fail') rows.writer.fail = vi.fn(() => { throw new Error('failure reporter fault') })
  const snapshot = fault === 'snapshot' || fault === 'fail' ? broken : undefined
  const status = attachObserver({ ...run, ...rows, checkpoint, classes, snapshot })
  expect(() => run.scheduler.runUntil(1000)).not.toThrow()
  expect(status.stopped).toBe(true)
  expect(run.state.ticks).toBe(100)
  expect(rows.writer.fail).toHaveBeenCalledTimes(1)
})
