import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { fnv1a32, rng } from '@rex/kernel'
import { binomialTail, coverage, decompose, ensembleScore, scoreLog, seeds, signTest, validateScore, findings } from '../src/index.ts'

it('seeds derive every entry from target/index and remain stable and distinct', () => {
  const values = seeds('H1', 30)
  expect(values).toEqual(seeds('H1', 30))
  expect(values).toEqual(Array.from({ length: 30 }, (_, i) => fnv1a32(`H1/${i + 1}`)))
  expect(new Set(values).size).toBe(30)
  expect(seeds('H2', 30)).not.toEqual(values)
  expect(seeds('H1', 0)).toEqual([])
})

it('binomial tails match hand probabilities and the sign test is two sided', () => {
  expect(2 * binomialTail(30, 21)).toBeCloseTo(0.0427739453, 9)
  expect(binomialTail(10, 9)).toBeCloseTo(11 / 1024, 14)
  expect(signTest([...Array(21).fill(1), ...Array(9).fill(-1)]).p).toBeCloseTo(0.0427739453, 9)
  expect(signTest([0, 0, -1, -2, 1])).toEqual({ n: 3, k: 2, sidedness: 'two', p: 1 })
  expect(signTest([0, 0])).toEqual({ n: 0, k: 0, sidedness: 'two', p: 1 })
  expect(signTest([1, -1])).toEqual({ n: 2, k: 1, sidedness: 'two', p: 1 })
  expect(binomialTail(0, 0)).toBe(1)
  expect(binomialTail(10, 11)).toBe(0)
  expect(binomialTail(2000, 1001)).toBeGreaterThan(0.48)
})

it('decomposition uses population variance and preserves missing checkpoint positions', () => {
  expect(decompose([[1, 0, null, 2], [3, 0, null]])).toEqual([
    { n: 2, bias: 2, variance: 1, mse: 5, systematicShare: 0.8 },
    { n: 2, bias: 0, variance: 0, mse: 0, systematicShare: 0 },
    { n: 0, bias: null, variance: null, mse: null, systematicShare: null },
    { n: 1, bias: 2, variance: 0, mse: 4, systematicShare: 1 },
  ])
  expect(decompose([])).toEqual([])
})

it('coverage interpolates empirical quantiles and includes overlapping ranges and boundaries', () => {
  const values = [[0, 0, 0, 0, 0, null], [10, 10, 10, 10, 10, null]]
  expect(coverage(values, [0.5, 9.5, 0.49, [9, 12], [9.51, 12], 4])).toEqual([true, true, false, true, false, null])
  expect(coverage([[2]], [2])).toEqual([true])
  expect(coverage([], [2, null])).toEqual([null, null])
  expect(coverage([[0], [10]], [0], 0, 1)).toEqual([true])
  expect(values[0][0]).toBe(0)
})

const method = { name: 'sign_test', sidedness: 'one' } as const
const criterion = { abs: 0.1, rel: 0, scale: 1, source: 'labelled test fixture' }
it('V12 planted offset fails the declared mean criterion', () => {
  const planted = seeds('H1', 30).map(seed => {
    const random = rng(seed)
    return Array.from({ length: 12 }, () => Math.log(1.2) + (random() - 0.5) * 0.02)
  })
  // HIST-20: report criterion findings instead of the removed automatic class.
  expect(findings(planted, { criterion, method }).status).toBe('not_met')
  expect(findings(planted, { criterion: null, method }).status).toBe('insufficient')
})
it('9 of 10 reports exact sidedness and follows either majority direction', () => {
  for (const direction of [1, -1]) {
    const errors = [...Array(9).fill(direction), -direction]
    expect(signTest(errors, 'one')).toMatchObject({ n: 10, k: 9, sidedness: 'one' })
    expect(signTest(errors, 'one').p).toBeCloseTo(11 / 1024, 14)
    expect(signTest(errors)).toMatchObject({ n: 10, k: 9, sidedness: 'two' })
    expect(signTest(errors).p).toBeCloseTo(22 / 1024, 14)
  }
})
it('findings preserve missing checkpoints and use population MSE without pooling', () => {
  const report = findings([[1, null, 2], [3, null]], { criterion, method })
  expect(report.repetitions_per_checkpoint).toEqual([2, 0, 1])
  expect(report.checkpoints[0]).toMatchObject({ n_runs: 2, mean_discrepancy: 2, variance: 1, mse: 5, criterion_met: false })
  expect(report.checkpoints[1]).toMatchObject({ criterion_met: null, status: 'insufficient', uncertainty: null })
  expect(report.checkpoints[2].missing).toEqual(['repetitions', 'run_discrepancies'])
  expect(findings([], { criterion: null, method: null })).toMatchObject({ status: 'insufficient', missing: ['checkpoints', 'criterion', 'method'] })
})
for (const name of ['criterion-null', 'five-checkpoints-one-run', 'planted-offset']) {
  it(`synthetic ensemble ${name} meets its expected result`, () => {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/synthetic/ensemble/${name}.json`, import.meta.url), 'utf8'))
    const check = fixture.protocol.checks[0]
    // This fixture alone stores checkpoint-major rows; the API is run-major.
    const errors = name === 'five-checkpoints-one-run'
      ? [fixture.ensemble.discrepancies.map((row: number[]) => row[0])]
      : fixture.ensemble.discrepancies
    const report = findings(errors, { criterion: check.tolerance, method: { name: 'sign_test', sidedness: check.sidedness } })
    expect({ met: 'pass', not_met: 'fail', insufficient: 'insufficient' }[report.status]).toBe(fixture.expected)
    expect(report.n_checkpoints).toBe(fixture.ensemble.checkpoints)
    if (name === 'five-checkpoints-one-run') expect(report.repetitions_per_checkpoint).toEqual([1, 1, 1, 1, 1])
    if (name === 'criterion-null') {
      // Metadata says ten repetitions but only one row is supplied; do not invent nine runs.
      expect(report.repetitions_per_checkpoint).toEqual([1, 1, 1])
      expect(report.checkpoints.every(p => p.criterion_met === null)).toBe(true)
    }
  })
}

it('ensemble Score uses checkpoint decomposition and preserves the reference label', () => {
  const hist = [1, 1, 1, 1, 1]
  const runs = [1, 2].map(value => ({ ...scoreLog(hist.map(() => value), hist), data_label: 'fiction' as const }))
  const row = ensembleScore('H1', 'I1', runs)
  expect(validateScore(row)).toEqual([])
  expect(row).toMatchObject({ S: 0.5, mean_S: 0.5, sd_S: 0.5, n_points: 5, data_label: 'fiction', sign_consistency: 5, ensemble: { status: 'insufficient' } })
  expect(row.bias).toBeCloseTo(Math.LN2 / 2)
  expect(row.variance).toBeCloseTo(Math.LN2 ** 2 / 4)
  const missing = ensembleScore('H1', 'I1', [{ ...scoreLog(null, hist), data_label: 'estimate' }])
  expect(validateScore(missing)).toEqual([])
  expect(missing).toMatchObject({ S: null, bias: null, variance: null, sd_S: null, sign_consistency: null, n_points: 0, ensemble: { status: 'insufficient' } })
})

it('invalid numeric inputs and ambiguous reference labels are rejected', () => {
  for (const bad of [() => seeds('H1', -1), () => seeds('H1', 1.5), () => binomialTail(2.5, 1),
    () => signTest([NaN]), () => decompose([[Infinity]]), () => coverage([[1]], [2], 0.9, 0.1),
    () => coverage([[1]], [[3, 2]]), () => findings([[1]], { criterion: { ...criterion, abs: -1 }, method }),
    () => findings([[1]], { criterion: { ...criterion, scale: Infinity }, method }), () => ensembleScore('H1', 'I1', [])]) expect(bad).toThrow()
})

it('ensemble findings use signed evidence independently of the display score', () => {
  const row = ensembleScore('H1', 'I1', [{ S: null, signed: [2], n_points: 1, raw: [], conventions: [], data_label: 'fiction' }], { criterion, method })
  expect(row.ensemble?.status).toBe('not_met')
  expect(row.S).toBeNull()
  expect(validateScore(row)).toEqual([])
})
