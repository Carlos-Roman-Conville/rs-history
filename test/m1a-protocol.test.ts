import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateProtocol } from '../src/protocol.ts'
import type { Protocol } from '../src/protocol.ts'
import table from '../data/event-classes.json'

const protocol = JSON.parse(
  readFileSync(join(import.meta.dirname, '../data/protocols/M1a.json'), 'utf8'),
) as Protocol

describe('M1a protocol file (PLAN §7.1)', () => {
  it('validates under validateProtocol', () => {
    expect(validateProtocol(protocol)).toEqual([])
  })

  it('gives every non-null tolerance a source', () => {
    for (const check of protocol.checks) {
      if (check.tolerance !== null) {
        expect(check.tolerance.source.trim().length, check.id).toBeGreaterThan(0)
      }
      if (check.margin !== null) {
        expect(check.margin.source.trim().length, check.id).toBeGreaterThan(0)
      }
    }
  })

  it('lists checks insufficient for want of a tolerance', () => {
    const insufficient = protocol.checks.filter(c => c.tolerance === null).map(c => c.id)
    expect(insufficient.sort()).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'E7',
      'E8',
      'E9',
      'learning',
      'step',
      'trace',
    ])
    expect(protocol.checks.find(c => c.id === 'accounting')!.tolerance).not.toBeNull()
  })

  it('maps required M1a event types for whole-payload storage', () => {
    const mapped = new Set(table.map.map(row => row.type))
    for (const type of protocol.required_event_types) expect(mapped.has(type), type).toBe(true)
    expect(table.map.find(r => r.type === 'shared.action.outcome')!.class).toBe('economic')
  })
})
