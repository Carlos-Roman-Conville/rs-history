import { describe, expect, it, vi } from 'vitest'
import { buildVerdict, combineChecks } from '../src/verdict.ts'
import type { CheckResult, Discrepancy } from '../src/verdict.ts'
import type { Protocol, ProtocolCheck } from '../src/protocol.ts'
import { fixture } from './protocol.fixture.ts'

const result = (id = 'hard'): CheckResult => ({ id, e: 0, unit: 'J', reference_uncertainty: { low: 0, high: 0, source: 'synthetic exact reference' }, evidence: ['row-1'], available_types: ['eat'] })
const findings = { implementation: [{ status: 'pass' as const, evidence: ['impl'] }], integration: [{ status: 'pass' as const, evidence: ['integration'] }] }
const seals = { input_seal_hash: 'fixture-input', output_seal_hash: 'fixture-output' }
// Labelled fixture criterion; production owners supply their own statistical method.
const judge = (c: ProtocolCheck, d: Discrepancy) => Math.abs(d.e!) <= c.tolerance!.abs ? 'pass' as const : 'fail' as const
const build = (p: Protocol, r: CheckResult[]) => buildVerdict(p, r, findings, seals, judge)

describe('three verdicts', () => {
  it('never upgrades failure or missing evidence, including an empty set', () => {
    expect(combineChecks([]).status).toBe('insufficient')
    expect(combineChecks([{ status: 'pass', evidence: [] }]).status).toBe('insufficient')
    expect(combineChecks([{ status: 'fail', evidence: ['x'] }, { status: 'insufficient', evidence: [] }]).status).toBe('fail')
  })
  it.each(['tolerance', 'margin'] as const)('keeps null %s insufficient and reports three verdicts separately', key => {
    const p = fixture(); p.checks[0][key] = null
    const v = build(p, [result()])
    expect([v.implementation.status, v.integration.status, v.validation.status]).toEqual(['pass', 'pass', 'insufficient'])
    expect(v.input_seal_hash).toBe(seals.input_seal_hash); expect(v.output_seal_hash).toBe(seals.output_seal_hash)
  })
  it('V21 missing hard indicator stays insufficient even with a high score elsewhere', () => {
    const p = fixture(); p.checks.push({ ...p.checks[0], id: 'other' })
    const other = { ...result('other'), S: 1, combined_score: 1 }
    expect(build(p, [other])).toEqual(build(p, [result('other')]))
    expect(build(p, [other]).validation.status).toBe('insufficient')
    expect(build(p, [result(), other]).validation.status).toBe('pass')
  })
  it('judges raw discrepancy, strips scores and preserves uncertainty and criterion', () => {
    const r = { ...result(), e: 2, e_log: 0.5, S: 1 }
    const spy = vi.fn(judge)
    const v = buildVerdict(fixture(), [r], findings, seals, spy)
    expect(v.validation.status).toBe('fail')
    expect(spy.mock.calls[0][1]).not.toHaveProperty('S')
    expect(v.checks[0].discrepancy?.e).toBe(2)
    expect(v.checks[0].criterion.tolerance?.source).toBe('synthetic fixture')
  })
  it('missing rows, payloads, uncertainty or discrepancy cannot reach the judge', () => {
    for (const r of [{ ...result(), evidence: [] }, { ...result(), available_types: [] }, { ...result(), reference_uncertainty: null }, { ...result(), e: null }]) {
      const spy = vi.fn(judge)
      expect(buildVerdict(fixture(), [r], findings, seals, spy).validation.status).toBe('insufficient')
      expect(spy).not.toHaveBeenCalled()
    }
  })
  it('rejects duplicate and undeclared results', () => {
    expect(() => build(fixture(), [result(), result()])).toThrow('duplicate')
    expect(() => build(fixture(), [result('unknown')])).toThrow('unexpected')
  })
})

