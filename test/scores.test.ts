import { expect, it } from 'vitest'
import matchingFixture from './fixtures/synthetic/matching/window-two.json'
import { abandoned, combine, logError, scoreAdoption, scoreEvents, scoreJaccard, scoreLog, scoreShare, scoreTV } from '../src/index.ts'

it('V9 a perfect run scores 1.0 and a constant factor two scores zero', () => {
  expect(scoreLog([10, 20, 30], [10, 20, 30])).toMatchObject({ S: 1, signed: [0, 0, 0], n_points: 3 })
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
  expect(scoreLog([0, 1], [1, 0])).toMatchObject({ S: 0, signed: [-Math.LN2, Math.LN2], n_points: 2 })
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
  expect(scoreAdoption(-10, 0)).toMatchObject({ S: 0.8, signed: [-10], n_points: 1 })
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
  expect(score).toMatchObject({ S: 1, signed: null, n_points: 2 })
  expect(score.S! * (simulated.length + reference.length) / 2).toBe(expected_matches)
})

it('events preserve missing and empty-list rules in either input position', () => {
  expect(scoreEvents([], [])).toMatchObject({ S: 1, signed: null, n_points: 0 })
  for (const [sim, hist] of [[[], [event(0)]], [[event(0)], []]]) {
    expect(scoreEvents(sim, hist)).toMatchObject({ S: 0, signed: null, n_points: 1 })
  }
  for (const score of [scoreEvents(null, []), scoreEvents([], null)]) {
    expect(score).toMatchObject({ S: null, signed: null, n_points: 0, excluded: 'missing data' })
  }
})

it('V8 violent succession shares use absolute difference', () => {
  expect(scoreShare(0.2, 0.7).S).toBeCloseTo(0.5)
  expect(scoreShare(1, 0).S).toBe(0)
  expect(scoreShare(0, 0).S).toBe(1)
})

it('HIST-20 abandonment uses duration and preserves a confirmed event after reoccupation', () => {
  const samples = [2, 0, 1, 0, 0, 4].map((residents, t) => ({ t, residents }))
  expect(abandoned(samples, [], 1).map(r => r.status)).toEqual(['occupied', 'insufficient', 'occupied', 'abandoned', 'abandoned', 'abandoned'])
  expect(abandoned([{ t: 0, residents: 0 }, { t: 10, residents: 0 }], null, 1).every(r => r.status === 'insufficient')).toBe(true)
  expect(abandoned(samples, [], null).every(r => r.status === 'insufficient')).toBe(true)
  expect(abandoned([], [], 1)).toEqual([])
})

it('combine excludes missing indicators and averages indicators rather than points', () => {
  const scores = { I9: null, I3: scoreLog([], []), I2: scoreLog([2], [1]), I1: scoreLog([1, 2, 3], [1, 2, 3]) }
  expect(combine(scores)).toMatchObject({ S: 0.5, signed: null, n_points: 4, excluded: [
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
    () => scoreShare(2, 0), () => scoreEvents([], [], -1), () => abandoned([{ t: 0, residents: -1 }], [], 1),
    () => combine({}, { I1: -1 })]) expect(bad).toThrow()
  expect(Number.isFinite(logError(Number.MAX_VALUE, Number.MIN_VALUE))).toBe(true)
})
import { readFileSync, readdirSync } from 'node:fs'

it('raw discrepancies preserve units, ranges and labelled display conventions', () => {
  expect(scoreLog([0, 20], [1, 10], 'kg').raw).toEqual([
    { sim: 0, ref: 1, e: -1, e_log: null, unit: 'kg' },
    { sim: 20, ref: 10, e: 10, e_log: Math.LN2, unit: 'kg' },
  ])
  expect(scoreLog([0], [1]).conventions).toContain('zero_rule_ln2')
  expect(scoreLog([15], [[10, 20]]).raw[0]).toEqual({ sim: 15, ref: [10, 20], e: 0, e_log: 0, unit: null })
  expect(scoreLog([15], [[10, 20]]).conventions).toContain('interval_compatibility')
  expect(scoreAdoption(-10, 0).raw).toEqual([{ sim: -10, ref: 0, e: -10, e_log: null, unit: 'year' }])
  expect(scoreAdoption(1, 0).conventions).toEqual(['adoption_normaliser_50'])
  for (const score of [scoreTV([0.2, 0.8], [0.5, 0.5]), scoreJaccard(['a'], ['b']), scoreShare(0.2, 0.7),
    scoreEvents([event(1)], [event(0)]), scoreEvents([], [event(0)]), scoreLog(null, null)]) {
    expect(score.raw).toHaveLength(score.n_points)
  }
})

it('HIST-20 arrivals and missing samples break vacancy evidence; exact duration qualifies', () => {
  const samples = [0, 10, 20, 30].map(t => ({ t, residents: 0 }))
  expect(abandoned(samples, [{ t: 5, kind: 'arrive' }, { t: 6, kind: 'leave' }], 20).map(r => r.status))
    .toEqual(['insufficient', 'abandoned', 'abandoned', 'abandoned'])
  expect(abandoned([{ t: 0, residents: 0 }, { t: 10, residents: null }, { t: 20, residents: 0 }], [], 20)
    .every(r => r.status === 'insufficient')).toBe(true)
  expect(abandoned(samples, [], 31).every(r => r.status === 'insufficient')).toBe(true)
})

for (const file of readdirSync(new URL('./fixtures/synthetic/abandonment/', import.meta.url)).filter(f => f.endsWith('.json')).sort()) {
  it(`V23 abandonment fixture ${file} gives its expected result`, () => {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/synthetic/abandonment/${file}`, import.meta.url), 'utf8'))
    const samples = fixture.observations.map((o: { t: number; value: number }) => ({ t: o.t, residents: o.value }))
    const events = fixture.events.length ? fixture.events.map((e: { t: number; type: string }) =>
      ({ t: e.t, kind: e.type === 'settlement.departure' ? 'leave' as const : 'arrive' as const })) : null
    const rows = abandoned(samples, events, fixture.protocol.checks[0].t_vacancy_ms)
    const actual = rows.some(r => r.status === 'abandoned') || rows.every(r => r.status === 'occupied') ? 'pass' : 'insufficient'
    expect(actual).toBe(fixture.expected)
    if (fixture.case === 'vacancy-long-enough') expect(rows.map(r => r.status)).toEqual(['occupied', 'abandoned', 'abandoned'])
    if (fixture.case === 'vacancy-too-short') expect(rows.every(r => r.status === 'occupied')).toBe(true)
  })
}
