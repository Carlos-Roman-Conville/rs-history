import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Scheduler, EventBus, streams, canonical, fnv1a64 } from '@rex/kernel'
import { INITIAL, attachObserver, openRun, readRun, type RunWriter, type EventEntry, type Observation, type SnapshotRef, type ObserverRead } from '../src/index.ts'
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

it('HI-1 required types retain whole payloads while unrequired event bytes stay unchanged', () => {
  const run = toy(), rows = memory()
  attachObserver({ ...run, ...rows, checkpoint, classes: { version: 1, map: [] }, required: ['total'] })
  run.scheduler.runUntil(20)
  for (const record of run.bus.state().records) {
    const { payload, ...identity } = record.event
    const expected = { ...identity, phase: record.phase, position: record.position, sequence: record.sequence, class: 'other',
      ...(identity.type === 'total' ? { payload } : { payload_hash: fnv1a64(canonical(payload)) }) }
    expect(canonical(rows.events.find(row => row.id === identity.id))).toBe(canonical(expected))
  }
})

it('HI-1 copies causal ids from payload or envelope without inferring absent ids', () => {
  const run = toy(), rows = memory()
  run.bus.emit({ t: 0, source: 'fixture', type: 'ids', phase: 0, position: 0,
    payload: { intention_id: 'intent', transaction_id: 'payload-tx', leg_id: 'leg' } })
  const records = run.bus.recordsSince(0)
  Object.assign(records[0].event, { transaction_id: 'envelope-tx' })
  vi.spyOn(run.bus, 'recordsSince').mockReturnValue(records)
  attachObserver({ ...run, ...rows, checkpoint, classes })
  expect(rows.events[0]).toMatchObject({ intention_id: 'intent', transaction_id: 'envelope-tx', leg_id: 'leg' })
  expect(rows.events[0].payload_hash).toBeDefined()
  expect(rows.events[0].cause).toBeUndefined()
})

it('V19 observer declares no RNG stream and preserves kernel stream positions', () => {
  const plain = toy(), recorded = toy(), rows = memory()
  const register = vi.spyOn(recorded.scheduler, 'register')
  attachObserver({ ...recorded, ...rows, checkpoint, classes, required: ['total'] })
  expect(register.mock.calls[0][0].mechanisms).toEqual([])
  for (let t = 0; t <= 100; t += 10) {
    plain.scheduler.runUntil(t); recorded.scheduler.runUntil(t)
    expect(recorded.random.state()).toEqual(plain.random.state())
  }
})

it('HI-1 stop boundary survives a failed event writer and round-trips through the manifest', () => {
  const dir = mkdtempSync(join(resolve('.'), '.observer-test-'))
  try {
    const run = toy(), writer = openRun(dir, header)
    const status = attachObserver({ ...run, writer: { ...writer, event() { throw new Error('event write failed') } }, checkpoint, classes })
    run.scheduler.runUntil(30)
    writer.close()
    expect(status.stopped).toBe(true)
    expect(readRun(dir).header.recording_boundaries).toEqual([
      { t: 10, status: 'stopped', reason: 'event write failed', readFailures: 0, missingValues: 0 },
    ])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('V1 G-inert preserves draws, events, RNG state and engine hashes at all 100 checkpoints', () => {
  const plain = toy(), recorded = toy(), rows = memory()
  const register = vi.spyOn(recorded.scheduler, 'register')
  attachObserver({ ...recorded, ...rows, checkpoint, classes,
    snapshot: () => ({ kernel_hash: recorded.hash(), participants: { toy: recorded.hash() } }),
  })
  expect(INITIAL).toBe('initial')
  expect(rows.series).toEqual([{ ...recorded.reads[0], read: undefined, t: 0, value: 0, mode: 'fine' }].map(({ read, ...row }) => row))
  expect(rows.snapshots).toEqual([{ t: 0, kernel_hash: plain.hash(), participants: { toy: plain.hash() } }])
  expect(recorded.random.state()).toEqual(plain.random.state())
  expect(recorded.bus.state()).toEqual(plain.bus.state())
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
  expect(rows.series).toHaveLength(101)
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
  expect(rows.series.map(o => o.t)).toEqual([0, 30, 50])
  expect(rows.series.every(o => o.mode === 'coarse')).toBe(true)
  expect(calls).toEqual(['read:0', ...Array(2).fill('event:10'), ...Array(2).fill('event:20'), ...Array(2).fill('event:30'), 'read:30', ...Array(2).fill('event:40'), ...Array(2).fill('event:50'), 'read:50'])
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
  expect(order).toEqual(Array(3).fill(['throws', 'null', 'ok']).flat())
  expect(rows.series.map(o => o.value)).toEqual(Array(3).fill([null, null, ['technology/a']]).flat())
  expect(status).toMatchObject({ stopped: false, readFailures: 3, missingValues: 6 })
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
  if (fault === 'bus') vi.spyOn(run.bus, 'recordsSince').mockImplementation(broken)
  if (fault === 'event') rows.writer.event = broken
  if (fault === 'fail') rows.writer.fail = vi.fn(() => { throw new Error('failure reporter fault') })
  const snapshot = fault === 'snapshot' || fault === 'fail' ? broken : undefined
  const status = attachObserver({ ...run, ...rows, checkpoint, classes, snapshot })
  expect(() => run.scheduler.runUntil(1000)).not.toThrow()
  expect(status.stopped).toBe(true)
  expect(run.state.ticks).toBe(100)
  expect(rows.writer.fail).toHaveBeenCalledTimes(1)
})

it('INITIAL samples the current attach time and drains only existing bus records once', () => {
  const run = toy(), rows = memory()
  run.scheduler.runUntil(20)
  const before = run.bus.state(), random = run.random.state(), hash = run.hash()
  attachObserver({ ...run, ...rows, checkpoint, classes })
  expect(run.scheduler.t).toBe(20)
  expect(run.hash()).toBe(hash)
  expect(run.random.state()).toEqual(random)
  expect(run.bus.state()).toEqual(before)
  expect(rows.series.map(o => o.t)).toEqual([20])
  expect(rows.events.map(e => e.id)).toEqual(before.records.map(r => r.event.id))
  run.scheduler.runUntil(30)
  expect(rows.series.map(o => o.t)).toEqual([20, 30])
  expect(new Set(rows.events.map(e => e.id)).size).toBe(rows.events.length)
  expect(rows.events).toHaveLength(run.bus.state().records.length)
})
