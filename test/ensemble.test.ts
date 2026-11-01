import { expect, it } from 'vitest'
import { fnv1a32, rng } from '@rex/kernel'
import { binomialTail, coverage, decompose, ensembleScore, scoreLog, seeds, signTest, validateScore, verdict } from '../src/index.ts'

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
  expect(signTest([0, 0, -1, -2, 1])).toEqual({ n: 3, k: 2, p: 1 })
  expect(signTest([0, 0])).toEqual({ n: 0, k: 0, p: 1 })
  expect(signTest([1, -1])).toEqual({ n: 2, k: 1, p: 1 })
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

it('V12 planted +20 percent bias is systematic while kernel-seeded zero-mean noise is stochastic', () => {
  const planted = seeds('H1', 30).map(seed => {
    const random = rng(seed)
    return Array.from({ length: 12 }, () => Math.log(1.2) + (random() - 0.5) * 0.02)
  })
  const noise = seeds('H1', 30).map(seed => {
    const random = rng(seed)
    return Array.from({ length: 12 }, () => (random() - 0.5) * 0.4)
  })
  expect(verdict(planted).verdict).toBe('systematic')
  expect(verdict(noise).verdict).toBe('stochastic')
  expect(verdict(planted.map(run => run.slice(0, 4))).verdict).toBe('insufficient')
  expect(verdict([[], []])).toMatchObject({ verdict: 'insufficient', alpha: 0.05, share: 0.5, minPoints: 5, systematicShare: null })
})

it('verdict requires a strict checkpoint majority and share above the echoed threshold', () => {
  const errors = Array.from({ length: 30 }, (_, i) => [1, 1, i < 15 ? 1 : -1, i < 15 ? 1 : -1])
  expect(verdict(errors, { minPoints: 4 }).verdict).toBe('stochastic')
  expect(verdict(errors.map(row => [...row, 1])).verdict).toBe('systematic')
  expect(verdict(Array.from({ length: 30 }, () => [1, 1, 1, 1, 1]), { share: 1 })).toMatchObject({ verdict: 'stochastic', share: 1 })
  expect(verdict([[null, null, null, null, 1]]).verdict).toBe('insufficient')
})

it('ensemble Score uses checkpoint decomposition and preserves the reference label', () => {
  const hist = [1, 1, 1, 1, 1]
  const runs = [1, 2].map(value => ({ ...scoreLog(hist.map(() => value), hist), data_label: 'fiction' as const }))
  const row = ensembleScore('H1', 'I1', runs)
  expect(validateScore(row)).toEqual([])
  expect(row).toMatchObject({ S: 0.5, mean_S: 0.5, sd_S: 0.5, n_points: 5, data_label: 'fiction', sign_consistency: 5, verdict: 'stochastic' })
  expect(row.bias).toBeCloseTo(Math.LN2 / 2)
  expect(row.variance).toBeCloseTo(Math.LN2 ** 2 / 4)
  const missing = ensembleScore('H1', 'I1', [{ ...scoreLog(null, hist), data_label: 'estimate' }])
  expect(validateScore(missing)).toEqual([])
  expect(missing).toMatchObject({ S: null, bias: null, variance: null, sd_S: null, sign_consistency: null, n_points: 0, verdict: 'insufficient' })
})

it('invalid numeric inputs and ambiguous reference labels are rejected', () => {
  for (const bad of [() => seeds('H1', -1), () => seeds('H1', 1.5), () => binomialTail(2.5, 1),
    () => signTest([NaN]), () => decompose([[Infinity]]), () => coverage([[1]], [2], 0.9, 0.1),
    () => coverage([[1]], [[3, 2]]), () => verdict([[1]], { minPoints: 0 }),
    () => verdict([[1]], { alpha: 2 }), () => ensembleScore('H1', 'I1', [])]) expect(bad).toThrow()
})
