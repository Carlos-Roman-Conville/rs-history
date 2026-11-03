import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkStep } from '../src/checks/step.ts'
import type { StepInput, StepRun } from '../src/checks/step.ts'
import type { Protocol } from '../src/protocol.ts'
interface Fixture { expected: string; protocol: Protocol; observations: { t: number; value: number }[] }
const fixture = (name: string): Fixture => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/synthetic/step', `${name}.json`), 'utf8'))
/** Labelled test-only extension: JSON contains two terminal measurements, not
 * independent seed runs. Repeat that contrast across declared seeds, adding
 * alternating +/-0.01 J synthetic noise. Stream identities and a fixed 1000 ms
 * decision period are fixture declarations, never inferred production evidence.
 * Weak evidence retains zero complete pairs. Original JSON remains read-only.
 */
function inputFor(name = 'noise-only'): StepInput {
  const f = fixture(name), step = f.protocol.steps[0]
  const a = f.observations.find(o => o.t === step.reference_ms)
  const b = f.observations.find(o => o.t === step.second_ms)
  const runs = (second: boolean): StepRun[] => !a || !b ? [] : f.protocol.seeds.map((seed, i) => ({
    id: `fixture:${name}:${seed}:${second}`, seed, step_ms: second ? step.second_ms! : step.reference_ms,
    streams: f.protocol.streams.map(s => s.id), decision_every_ms: 1000,
    value: second ? b.value + (i % 2 ? 0.01 : -0.01) : a.value,
  }))
  return { protocol: f.protocol, check_id: 'step', unit: 'J', kind: 'continuous', reference: runs(false), second: runs(true) }
}
function differences(values: number[]): StepInput {
  const input = inputFor()
  input.protocol.seeds = input.protocol.seeds.slice(0, values.length)
  input.reference = input.reference.slice(0, values.length).map(r => ({ ...r, value: 0 }))
  input.second = input.second.slice(0, values.length).map((r, i) => ({ ...r, value: values[i] }))
  return input
}
describe('HI-7 paired step equivalence', () => {
  for (const name of ['noise-only', 'planted-defect', 'weak-evidence']) {
    it(`${name}: labelled seed extension meets fixture expected`, () => {
      expect(checkStep(inputFor(name)).status).toBe(fixture(name).expected)
    })
  }
  it('one original measurement pair cannot establish a t interval', () => {
    const input = differences([-50])
    expect(checkStep(input)).toMatchObject({ status: 'insufficient', mean: -50, interval: null })
  })
  it('Student t df=1 uses the analytic Cauchy quantile at declared confidence', () => {
    for (const confidence of [0.8, 0.9, 0.95, 0.99]) {
      const input = differences([-1, 1])
      input.protocol.checks[0].margin!.confidence = confidence
      const report = checkStep(input)
      expect(report.interval!.high).toBeCloseTo(Math.tan(Math.PI * confidence / 2), 9)
      expect(report.interval!.low).toBeCloseTo(-Math.tan(Math.PI * confidence / 2), 9)
    }
  })
  it('Student t df=9 matches the standard 95 percent critical value', () => {
    const input = differences([-1, 1, -1, 1, -1, 1, -1, 1, -1, 1])
    expect(checkStep(input).interval!.high).toBeCloseTo(2.2621571628540993 / 3, 10)
  })
  it('an interval straddling a margin is insufficient, not a defect', () => {
    const input = differences([-1, 1])
    expect(checkStep(input).status).toBe('insufficient')
  })
  it('null margin and absent confidence never acquire defaults', () => {
    const input = inputFor()
    input.protocol.checks[0].margin = null
    expect(checkStep(input)).toMatchObject({ status: 'insufficient', confidence: null, interval: null })
    input.protocol.checks[0].margin = { value: 5, source: 'fixture' } as Protocol['checks'][number]['margin']
    expect(checkStep(input)).toMatchObject({ status: 'insufficient', confidence: null, interval: null })
  })
  it('zero variance and exact margin boundaries are handled inclusively', () => {
    for (const value of [-5, 0, 5]) expect(checkStep(differences([value, value])).status).toBe('pass')
    for (const value of [-6, 6]) expect(checkStep(differences([value, value])).status).toBe('fail')
  })
  it('missing seeds, duplicate seeds, stream mismatches and changed decisions are insufficient', () => {
    const mutations: ((i: StepInput) => void)[] = [
      i => { i.second = i.second.slice(1) },
      i => { i.second = [...i.second, i.second[0]] },
      i => { i.second[0].streams = ['wrong/person'] },
      i => { i.second[0].decision_every_ms = 6000 },
      i => { i.second[0].decision_every_ms = null },
      i => { i.second[0].step_ms = 2000 },
      i => { i.second[0].value = null },
      i => { i.second[0].value = NaN },
    ]
    for (const mutate of mutations) {
      const input = inputFor(); mutate(input)
      expect(checkStep(input).status).toBe('insufficient')
    }
  })
  it('pairs by seed rather than array order and never mutates input', () => {
    const input = inputFor(), original = structuredClone(input)
    const result = checkStep(input)
    expect(input).toEqual(original)
    input.second = [...input.second].reverse()
    input.reference = [...input.reference].reverse()
    expect(checkStep(input)).toEqual(result)
  })
  it('categorical outcomes report sorted paired person counts without inventing a test', () => {
    const input = differences([0, 0]); input.kind = 'outcome'
    for (const r of input.reference) r.outcomes = { a: 'alive', b: 'dead' }
    for (const r of input.second) r.outcomes = { a: 'dead', b: 'dead' }
    expect(checkStep(input)).toMatchObject({ status: 'insufficient', interval: null, contingency: [
      { reference: 'alive', second: 'dead', count: 2 }, { reference: 'dead', second: 'dead', count: 2 },
    ] })
    input.second[0].outcomes = { a: 'alive' }
    expect(checkStep(input).reasons).toContain('Missing paired person outcomes')
  })
})
