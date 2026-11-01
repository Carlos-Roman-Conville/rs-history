import { expect, it } from 'vitest'
import { aggregateSeries, observationId, sumIdentity, continuity } from '../src/index.ts'
import type { Aggregate, MembersOf, Observation, Scope } from '../src/index.ts'

const scope = (kind: Scope['kind'], id: string): Scope => ({ kind, id })
const region = scope('region', 'r'), village = scope('settlement', 'v'), coarse = scope('settlement', 'c')
const household = scope('household', 'h'), p = scope('person', 'p'), q = scope('person', 'q')
const row = (scope: Scope, value: number | null, t = 0, mode: Observation['mode'] = 'fine', quantity = 'food'): Observation =>
  ({ t, quantity, scope, value, mode, unit: 'kg', port: 'owner.food' })
const membersOf: MembersOf = s => ({ r: [village, coarse], v: [household], h: [q, p] })[s.id]
const sum = (series: Observation[], targets: Scope[] = [village]) => aggregateSeries({ series }, { measure: 'food', quantity: 'food', fn: 'sum', targets, membersOf })

it('V5 sums two levels with sorted leaf provenance and no mutation', () => {
  const series = [row(q, 3), row(p, 2), row(household, 999)]
  const original = JSON.stringify(series)
  const result = sum(series, [village, household])
  expect(result.map(a => a.value)).toEqual([5, 5])
  expect(result[1].inputs).toEqual([observationId(series[1]), observationId(series[0])])
  expect(sumIdentity(result, { series })).toEqual([])
  expect(sum([...series].reverse(), [household, village])).toEqual(result)
  expect(JSON.stringify(series)).toBe(original)
})

it('resolution uses a coarse village and fine village once in a region', () => {
  const series = [row(p, 2), row(q, 3), row(coarse, 7, 0, 'coarse'), row(scope('person', 'hidden'), 90)]
  const result = sum(series, [region])
  expect(result[0].value).toBe(12)
  expect(result[0].inputs).toHaveLength(3)
  expect(sumIdentity(result, { series })).toEqual([])
  expect(sum([row(village, null, 0, 'coarse'), ...series])[0].value).toBeNull()
})

it('nulls propagate through sum and max and count counts non-null rows', () => {
  const series = [row(p, 2), row(q, null)]
  for (const fn of ['sum', 'max', 'count'] as const) {
    const [a] = aggregateSeries({ series }, { measure: 'food', quantity: 'food', fn, targets: [village], membersOf })
    expect(a.value).toBe(fn === 'count' ? 1 : null)
    expect(a.inputs).toHaveLength(2)
  }
  expect(sumIdentity(sum(series), { series })).toEqual([])
  expect(aggregateSeries({ series: [row(p, -3), row(q, -2)] }, { measure: 'food', quantity: 'food', fn: 'max', targets: [village], membersOf })[0].value).toBe(-2)
})

it('share sums the part and whole and rejects null or zero denominators', () => {
  for (const [part, whole, expected] of [[2, 8, 0.25], [null, 8, null], [2, null, null], [2, 0, null]] as const) {
    const series = [row(village, part, 0, 'coarse', 'part'), row(village, whole, 0, 'coarse', 'whole')]
    const [a] = aggregateSeries({ series }, { measure: 'share', quantity: ['part', 'whole'], fn: 'share', targets: [village], membersOf })
    expect(a.value).toBe(expected)
    expect(a.unit).toBe('1')
    expect(a.inputs).toEqual(series.map(observationId).sort())
  }
})

it('missing links and missing leaf rows yield null while known empty scopes sum to zero', () => {
  expect(sum([row(p, 2)])[0].value).toBeNull()
  expect(sum([row(p, 2)], [coarse])[0].value).toBeNull()
  expect(aggregateSeries({ series: [row(p, 2)] }, { measure: 'count', quantity: 'food', fn: 'count', targets: [coarse], membersOf })[0].value).toBeNull()
  const [empty] = aggregateSeries({ series: [], snapshots: [{ t: 10 }] }, { measure: 'food', quantity: 'food', fn: 'sum', targets: [region], membersOf: () => [] })
  expect(empty.value).toBe(0)
  expect(empty.t).toBe(10)
})

it('membership is resolved at each checkpoint and output is time sorted', () => {
  const series = [row(q, 7, 10), row(p, 2)]
  const result = aggregateSeries({ series }, { measure: 'food', quantity: 'food', fn: 'sum', targets: [village], membersOf: (_, t) => [t === 0 ? p : q] })
  expect(result.map(a => [a.t, a.value])).toEqual([[0, 2], [10, 7]])
})

it('V5 detects broken sums, null mismatches, wrong instants and unknown inputs', () => {
  const series = [row(p, 2), row(q, 3), row(p, 8, 10)]
  const a = sum(series)[0]
  for (const broken of [{ ...a, value: 6 }, { ...a, value: null }, { ...a, inputs: ['absent'] }, { ...a, inputs: [observationId(series[2])] }, { ...a, inputs: [a.inputs[0], a.inputs[0]] }]) {
    expect(sumIdentity([broken], { series })).toHaveLength(1)
  }
  const failures = sumIdentity([{ ...a, measure: 'z', value: 9 }, { ...a, measure: 'a', value: 9 }], { series })
  expect(failures).toEqual([...failures].sort())
})

it('V5 requires exact integer sums and permits the specified floating tolerance', () => {
  const integers = [row(p, 1e12), row(q, 1)]
  expect(sumIdentity([{ ...sum(integers)[0], value: 1e12 }], { series: integers })).toHaveLength(1)
  const series = [row(p, 0.1), row(q, 0.2)]
  expect(sumIdentity([{ ...sum(series)[0], value: 0.3 }], { series })).toEqual([])
  expect(sumIdentity([{ ...sum(series)[0], value: 0.30001 }], { series })).toHaveLength(1)
})

it('V6 compares the nearest points around the switch using absolute owner tolerance', () => {
  const series = [row(p, 2), row(q, 3), row(village, 5.25, 10, 'coarse'), row(village, 99, 20, 'coarse')]
  const values = sum(series).reverse()
  const switches = [{ entity: village.id, from_t: 10 }]
  expect(continuity(values, switches, 0.25)).toEqual([])
  expect(continuity(values, switches, 0.2)[0]).toContain('jump 0.25 exceeds 0.2')
  expect(continuity(values, [{ entity: village.id, from_t: 0 }], 1)[0]).toContain('missing numeric endpoints')
  expect(continuity(values.map(a => ({ ...a, value: null })), switches, 1)).toHaveLength(1)
  expect(() => continuity(values, switches, -1)).toThrow('tolerance')
})

it('rejects ambiguous observation IDs and cyclic membership', () => {
  expect(() => sum([row(p, 1), row(p, 2)])).toThrow('duplicate observation')
  expect(() => aggregateSeries({ series: [row(p, 1)] }, { measure: 'food', quantity: 'food', fn: 'sum', targets: [village], membersOf: () => [village] })).toThrow('cyclic')
})

it('V6 keeps measures separate and sorts failures', () => {
  const a = sum([row(p, 2), row(q, 3)])[0]
  const series: Aggregate[] = [{ ...a, measure: 'z' }, { ...a, measure: 'a' }]
  const failures = continuity(series, [{ entity: village.id, from_t: 10 }], 0)
  expect(failures).toHaveLength(2)
  expect(failures).toEqual([...failures].sort())
})
