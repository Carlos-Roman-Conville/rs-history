import { expect, it } from 'vitest'
import { TROPICAL_YEAR } from '@rex/kernel'
import { matchCheckpoints, scoreLog, simDate, validateDataset } from '../src/index.ts'
import type { ComparisonDataset, DatasetCheckpoint } from '../src/index.ts'

const point = (date: number, value: DatasetCheckpoint['value'] = 10): DatasetCheckpoint => ({ date, value, label: 'fiction', source: 'synthetic fixture' })
const dataset = (checkpoints: DatasetCheckpoint[]): ComparisonDataset => ({ target: 'H1', indicator: 'I1', version: '1', checkpoints })

it('dataset preserves labelled sourced numbers, ranges, sets, events and explicit missing values', () => {
  expect(validateDataset(dataset([point(-1.5), point(0, [1, 2]), point(1, ['tech']), point(2, [{ date: 1, label: 'change' }]), point(3, null), point(4, [])]))).toEqual([])
  for (const label of ['researched', 'estimate', 'fiction'] as const) expect(validateDataset(dataset([{ ...point(0), label, note: 'derivation' }]))).toEqual([])
})

it('dataset rejects missing provenance, nonfinite dates, malformed values and duplicate checkpoints', () => {
  for (const p of [{ ...point(0), source: '' }, { ...point(0), label: 'guess' }, point(Infinity),
    { ...point(0), value: [2, 1] }, { ...point(0), value: [1, 2, 3] }, { ...point(0), value: ['x', 2] },
    { ...point(0), value: [{ date: NaN, label: 'event' }] }, { ...point(0), value: undefined }]) {
    expect(validateDataset({ ...dataset([]), checkpoints: [p] }).length).toBeGreaterThan(0)
  }
  expect(validateDataset(dataset([point(0), point(0)]))).toContain('checkpoints[1].date: duplicate year')
  expect(validateDataset({ ...dataset([]), version: '' })).toContain('version: expected non-empty string')
  expect(validateDataset(null).length).toBeGreaterThan(0)
})

it('simDate maps kernel milliseconds to decimal astronomical years including year zero', () => {
  expect(simDate(TROPICAL_YEAR / 2, -1)).toBe(-0.5)
  expect(simDate(TROPICAL_YEAR, -1)).toBe(0)
  expect(simDate(0, 1270)).toBe(1270)
})

it('comparison uses nearest record checkpoint, ties earlier, and includes the half-period boundary', () => {
  const reference = dataset([point(2, 20), point(1, 10), point(0, 10)])
  const series = [{ t: 2 * TROPICAL_YEAR, value: 20 }, { t: 0, value: 10 }]
  const before = JSON.stringify([reference, series])
  const matched = matchCheckpoints(reference, series, 0, 2 * TROPICAL_YEAR)
  expect(matched.matched.map(m => m.simulated.t)).toEqual([0, 0, 2 * TROPICAL_YEAR])
  expect(matched.n_excluded).toBe(0)
  expect(scoreLog(matched.matched.map(m => m.simulated.value), matched.matched.map(m => m.checkpoint.value as number)).S).toBe(1)
  expect(JSON.stringify([reference, series])).toBe(before)
})

it('comparison counts missing values and checkpoints outside half a period without substituting values', () => {
  const result = matchCheckpoints(dataset([point(4), point(0), point(1, null), point(2)]), [
    { t: 0, value: null }, { t: TROPICAL_YEAR, value: 9 },
  ], 0, TROPICAL_YEAR)
  expect(result.n_points).toBe(0)
  expect(result.n_excluded).toBe(4)
  expect(result.excluded.map(e => e.date)).toEqual([0, 1, 2, 4])
  expect(result.excluded[0].reason).toBe('missing simulated value')
  expect(result.excluded[1].reason).toBe('missing historical value')
  expect(matchCheckpoints(dataset([point(0)]), [], 0, 1).n_excluded).toBe(1)
})

it('comparison rejects ambiguous duplicate record times and invalid sampling periods', () => {
  expect(() => matchCheckpoints(dataset([]), [{ t: 0, value: 1 }, { t: 0, value: 2 }], 0, 1)).toThrow('duplicate')
  expect(() => matchCheckpoints(dataset([]), [], 0, 0)).toThrow('period')
})
