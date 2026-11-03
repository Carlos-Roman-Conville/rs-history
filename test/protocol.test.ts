import { describe, expect, it } from 'vitest'
import { runnableArms, validateProtocol } from '../src/protocol.ts'
import { fixture } from './protocol.fixture.ts'

describe('milestone protocol', () => {
  it('accepts derived pilot seeds and explicitly missing owner quantities', () => {
    const p = fixture(); p.checks[0].tolerance = null; p.checks[0].margin = null
    expect(validateProtocol(p)).toEqual([])
  })
  it('refuses two differences, including an undeclared configuration change', () => {
    const p = fixture(); p.arms[1].configuration.learning = false
    expect(validateProtocol(p).length).toBeGreaterThan(0)
    p.differences.push('learning')
    expect(validateProtocol(p)).toContain('differences: invalid or missing')
  })
  it('does not select a pending arm for execution', () => {
    const p = fixture(); p.arms.push({ id: 'no-learning', owner: 'Cognition', pending: 'CN-7', configuration: { learning: false } })
    expect(runnableArms(p).map(a => a.id)).toEqual(['deprived', 'provisioned'])
    expect(p.arms).toHaveLength(3)
  })
  it('refuses wrong seeds, duplicate streams and undeclared required payloads', () => {
    const p = fixture(); p.seeds[0]++
    p.streams.push({ ...p.streams[0], id: 'another' }); p.checks[0].needs_types.push('death')
    expect(validateProtocol(p)).toEqual(expect.arrayContaining([
      'seeds: invalid or missing', 'streams: duplicate mechanism/person class: invalid or missing',
      'checks[0].needs_types: invalid or missing',
    ]))
  })
  it('validates JSON shape, positive periods, sources and confidence bounds', () => {
    expect(validateProtocol(null)).toHaveLength(1)
    const p = fixture(); p.samples[0].every_ms = 0; p.checks[0].margin!.confidence = 1
    p.checks[0].tolerance!.source = ''; p.streams[0].note = ''
    expect(validateProtocol(p)).toHaveLength(4)
    expect(() => runnableArms(p)).toThrow()
  })
})

