import { expect, it } from 'vitest'
import matchingFixture from './fixtures/synthetic/matching/window-two.json'
import { abandoned, combine, logError, scoreAdoption, scoreEvents, scoreJaccard, scoreLog, scoreShare, scoreTV } from '../src/index.ts'

it('V9 a perfect run scores 1.0 and a constant factor two scores zero', () => {
  expect(scoreLog([10, 20, 30], [10, 20, 30])).toEqual({ S: 1, signed: [0, 0, 0], n_points: 3 })
  expect(scoreLog([20, 40, 60], [10, 20, 30]).S).toBe(0)
  expect(scoreLog([5, 10, 15], [10, 20, 30]).S).toBe(0)
  expect(scoreLog([40], [10]).S).toBe(0)
})

it('Rex range rule has zero error inside and uses the closest endpoint outside', () => {
  for (const n of [10, 15, 20]) expect(logError(n, [10, 20])).toBe(0)
  expect(logError(40, [10, 20])).toBe(Math.LN2)
  expect(logError(5, [10, 20])).toBe(-Math.LN2)
  expect(logError(0, [0, 20])).toBe(0)
})

it('Rex zero rule keeps signed ln 2 for exactly one zero and scores that point zero', () => {
  expect(logError(0, 0)).toBe(0)
  expect(logError(1, 0)).toBe(Math.LN2)
  expect(logError(0, 1)).toBe(-Math.LN2)
  expect(scoreLog([0, 1], [1, 0])).toEqual({ S: 0, signed: [-Math.LN2, Math.LN2], n_points: 2 })
  expect(scoreLog([0, 0], [0, 1]).S).toBe(0.5)
})

it('V8 TV is half the sum of class share differences', () => {
  expect(scoreTV([0.5, 0.3, 0.2], [0.2, 0.3, 0.5]).S).toBeCloseTo(0.7)
  expect(scoreTV([1, 0], [0, 1]).S).toBe(0)
  expect(scoreTV([0.2, 0.8], [0.2, 0.8]).S).toBe(1)
})

it('V8 Jaccard uses unique intersection over union, with known empty sets agreeing', () => {
  expect(scoreJaccard(['a', 'a', 'b'], ['b', 'c']).S).toBeCloseTo(1 / 3)
  expect(scoreJaccard([], []).S).toBe(1)
  expect(scoreJaccard([], ['a']).S).toBe(0)
  expect(scoreJaccard(new Set(['a']), new Set(['a'])).S).toBe(1)
})

it('V8 adoption uses a fifty year scale and preserves signed date errors', () => {
  expect(scoreAdoption(-10, 0)).toEqual({ S: 0.8, signed: [-10], n_points: 1 })
  expect(scoreAdoption(10, 0).S).toBe(0.8)
  expect(scoreAdoption(50, 0).S).toBe(0)
  expect(scoreAdoption(100, 0).S).toBe(0)
  expect(scoreAdoption(0, 0).S).toBe(1)
})

const event = (date: number, label = 'change') => ({ date, label })
it('V8 events use same-label maximum-cardinality matching and F1', () => {
  const sim = [event(1), event(2), event(100, 'war')]
  const hist = [event(0), event(110, 'war')]
  expect(scoreEvents(sim, hist).S).toBe(4 / 5)
  expect(scoreEvents([event(0)], [event(25)]).S).toBe(1)
  expect(scoreEvents([event(0)], [event(26)]).S).toBe(0)
  expect(scoreEvents([event(0)], [event(0, 'other')]).S).toBe(0)
  expect(scoreEvents([], []).S).toBe(1)
  expect(scoreEvents([], hist).S).toBe(0)
  // HIST-17: closest-first lost a match; 0 -> 10 and 9 -> 20 both fit.
  expect(scoreEvents([event(0), event(9)], [event(10), event(20)], 11).S).toBe(1)
  expect(scoreEvents([...sim].reverse(), [...hist].reverse())).toEqual(scoreEvents(sim, hist))
})

it('events sort dates for matching without mutating inputs', () => {
  const sim = [event(10), event(30)], hist = [event(20), event(0)]
  const before = JSON.stringify([sim, hist])
  expect(scoreEvents(sim, hist, 10).S).toBe(1)
  expect(JSON.stringify([sim, hist])).toBe(before)
})

it('V17 synthetic window-two fixture gives two matches', () => {
  const { simulated, reference, window, expected_matches } = matchingFixture.matching
  const score = scoreEvents(simulated.map(date => event(date)), reference.map(date => event(date)), window)
  expect(score).toEqual({ S: 1, signed: null, n_points: 2 })
  expect(score.S! * (simulated.length + reference.length) / 2).toBe(expected_matches)
})

it('events preserve missing and empty-list rules in either input position', () => {
  expect(scoreEvents([], [])).toEqual({ S: 1, signed: null, n_points: 0 })
  for (const [sim, hist] of [[[], [event(0)]], [[event(0)], []]]) {
    expect(scoreEvents(sim, hist)).toEqual({ S: 0, signed: null, n_points: 1 })
  }
  for (const score of [scoreEvents(null, []), scoreEvents([], null)]) {
    expect(score).toEqual({ S: null, signed: null, n_points: 0, excluded: 'missing data' })
  }
})

it('V8 violent succession shares use absolute difference', () => {
  expect(scoreShare(0.2, 0.7).S).toBeCloseTo(0.5)
  expect(scoreShare(1, 0).S).toBe(0)
  expect(scoreShare(0, 0).S).toBe(1)
})

it('Rex abandonment starts at the first of two consecutive zero checkpoints', () => {
  expect(abandoned([2, 0, 1, 0, 0, 4])).toEqual([false, false, false, true, true, true])
  expect(abandoned([0, null, 0])).toEqual([false, false, false])
  expect(abandoned([1, 0])).toEqual([false, false])
  expect(abandoned([0, 0])).toEqual([true, true])
  expect(abandoned([])).toEqual([])
})

it('combine excludes missing indicators and averages indicators rather than points', () => {
  const scores = { I9: null, I3: scoreLog([], []), I2: scoreLog([2], [1]), I1: scoreLog([1, 2, 3], [1, 2, 3]) }
  expect(combine(scores)).toEqual({ S: 0.5, signed: null, n_points: 4, excluded: [
    { indicator: 'I3', reason: 'missing data' }, { indicator: 'I9', reason: 'missing data' },
  ] })
  expect(combine(scores, { I1: 3, I2: 1 }).S).toBe(0.75)
  expect(combine({ I1: null }).S).toBeNull()
  expect(combine({}).S).toBeNull()
  expect(combine(scores, { I1: 0, I2: 0 }).S).toBeNull()
})

it('missing inputs are excluded while invalid arithmetic inputs are rejected', () => {
  for (const score of [scoreLog(null, [1]), scoreTV(null, [1]), scoreJaccard(null, []), scoreEvents(null, []), scoreShare(null, 0), scoreAdoption(null, 0)]) {
    expect(score.S).toBeNull(); expect(score.excluded).toBe('missing data')
  }
  for (const bad of [() => logError(-1, 1), () => logError(1, [2, 1]), () => logError(NaN, 1),
    () => scoreLog([1], []), () => scoreTV([0.2], [1]), () => scoreTV([1], [1, 0]),
    () => scoreShare(2, 0), () => scoreEvents([], [], -1), () => abandoned([-1]),
    () => combine({}, { I1: -1 })]) expect(bad).toThrow()
  expect(Number.isFinite(logError(Number.MAX_VALUE, Number.MIN_VALUE))).toBe(true)
})
