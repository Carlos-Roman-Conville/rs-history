import { describe, expect, it } from 'vitest'
import { validateBoundaryInput, validateRunHeader, validateEventEntry, validateObservation, validateAggregate, validateSnapshotRef, validateScore } from '../src/record.ts'
import { header, event, observation, aggregate, snapshot, score, ensemble } from './fixtures.ts'

it('HI-1 causal ids are optional explicit nonempty strings', () => {
  expect(validateEventEntry(event)).toEqual([])
  for (const key of ['intention_id', 'transaction_id', 'leg_id']) {
    expect(validateEventEntry({ ...event, [key]: 'fixture/id' })).toEqual([])
    for (const value of [null, 1, '', false]) expect(validateEventEntry({ ...event, [key]: value })).toContain(`${key}: invalid value`)
  }
})

const cases = [
  ['BoundaryInput', { ...header.boundary[0], note: 'documented input' }, validateBoundaryInput],
  ['RunHeader', header, validateRunHeader], ['EventEntry', event, validateEventEntry],
  ['Observation', observation, validateObservation], ['Aggregate', aggregate, validateAggregate],
  ['SnapshotRef', snapshot, validateSnapshotRef], ['Score', score, validateScore], ['ensemble Score', ensemble, validateScore],
] as const
for (const [name, valid, validator] of cases) describe(name, () => {
  it('accepts the DESIGN record fields and rejects non-record roots', () => {
    expect(validator(valid)).toEqual([])
    for (const bad of [null, [], 1, 'row']) expect(validator(bad).length).toBeGreaterThan(0)
  })
  for (const key of Object.keys(valid)) it(`rejects invalid ${key} and sorts failures`, () => {
    const errors = validator({ ...valid, [key]: Symbol('bad'), unexpected: true })
    expect(errors.some(error => error.startsWith(`${key}:`))).toBe(true)
    expect(errors).toEqual([...errors].sort())
  })
  for (const [key, value] of Object.entries(valid)) {
    const nested = Array.isArray(value) ? value[0] : value
    if (nested && typeof nested === 'object') for (const field of Object.keys(nested)) it(`rejects invalid nested ${key}.${field}`, () => {
      const bad = { ...nested, [field]: Symbol('bad') }
      expect(validator({ ...valid, [key]: Array.isArray(value) ? [bad] : bad }).length).toBeGreaterThan(0)
    })
  }
})
it('kernel time is a non-negative safe integer', () => {
  for (const t of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    for (const [row, validate] of [[event, validateEventEntry], [observation, validateObservation], [aggregate, validateAggregate], [snapshot, validateSnapshotRef]] as const) expect(validate({ ...row, t }).length).toBeGreaterThan(0)
  }
})
it('values preserve missing data and sets but reject non-finite numbers', () => {
  for (const value of [null, [], ['technology'], 0]) expect(validateObservation({ ...observation, value })).toEqual([])
  for (const value of [undefined, NaN, Infinity, [1], {}]) expect(validateObservation({ ...observation, value }).length).toBeGreaterThan(0)
})
it('payload has exactly one canonical JSON representation or hash', () => {
  const { payload: _, ...rest } = event
  expect(validateEventEntry({ ...rest, payload_hash: header.config_hash })).toEqual([])
  for (const bad of [rest, { ...event, payload_hash: header.config_hash }, { ...event, payload: new Date() }]) expect(validateEventEntry(bad).length).toBeGreaterThan(0)
})
it('header identity matches its components and dirty engines cannot be reportable', () => {
  expect(validateRunHeader({ ...header, seed: 2 })).toContain('run_id: must match target/seed/config_hash')
  expect(validateRunHeader({ ...header, engines: [{ ...header.engines[0], commit: 'abc+dirty' }] }).length).toBeGreaterThan(0)
  expect(validateRunHeader({ ...header, reportable: false, non_reportable_reason: 'failed' })).toEqual([])
  expect(validateRunHeader({ ...header, non_reportable_reason: 1 }).length).toBeGreaterThan(0)
})
it('ensemble scores require every ensemble statistic and verdict', () => {
  for (const key of ['mean_S', 'sd_S', 'bias', 'variance', 'sign_consistency', 'verdict']) {
    const row = { ...ensemble } as Record<string, unknown>
    delete row[key]
    expect(validateScore(row).length).toBeGreaterThan(0)
  }
})

it('BoundaryInput accepts both schedule forms and rejects invalid schedule fields', () => {
  const boundary = header.boundary[0]
  for (const kind of ['pathogen', 'arrival', 'forcing', 'other']) {
    expect(validateBoundaryInput({ ...boundary, kind })).toEqual([])
  }
  expect(validateBoundaryInput({ ...boundary, schedule: { series: 'catalogue/rain.json', unit: 'mm' } })).toEqual([])
  for (const schedule of [
    [{ t: -1, value: 1, unit: 'mm' }], [{ t: 0.5, value: 1, unit: 'mm' }],
    [{ t: 0, value: Infinity, unit: 'mm' }], [{ t: 0, value: null, unit: 'mm' }],
    [{ t: 0, value: 1, unit: '' }], [{ t: 0, value: 1 }],
    { series: '', unit: 'mm' }, { series: 'data', unit: '' }, { series: 'data' },
    { series: 'data', unit: 'mm', t: 0 }, null,
  ]) expect(validateBoundaryInput({ ...boundary, schedule })).toContain('schedule: invalid value')
  for (const key of Object.keys(boundary)) {
    const missing = { ...boundary } as Record<string, unknown>
    delete missing[key]
    expect(validateBoundaryInput(missing)).toContain(`${key}: invalid value`)
    expect(validateRunHeader({ ...header, boundary: [missing] })).toContain('boundary: invalid value')
  }
})
