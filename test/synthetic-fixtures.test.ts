import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateEventEntry, validateObservation, validateRunHeader } from '../src/record.ts'
import { validateProtocol } from '../src/protocol.ts'

const root = join(import.meta.dirname, 'fixtures/synthetic')
const verdicts = new Set(['pass', 'fail', 'insufficient'])

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.json') ? [path] : []
  })
}

describe('synthetic defect fixtures (CP-1)', () => {
  const paths = files(root).sort()
  it('includes every check folder from the unit spec', () => {
    const checks = new Set(paths.map(path => path.slice(root.length + 1).split(/[/\\]/)[0]))
    for (const check of ['accounting', 'trace', 'step', 'matching', 'continuity', 'abandonment', 'ensemble', 'rg5']) {
      expect(checks.has(check), check).toBe(true)
    }
  })
  for (const path of paths) {
    const name = path.slice(root.length + 1).replace(/\\/g, '/')
    it(name, () => {
      const fixture = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      expect(fixture.label).toBe('fixture')
      expect(verdicts.has(fixture.expected as string)).toBe(true)
      expect(typeof fixture.case).toBe('string')
      expect(fixture.defect).toBeDefined()
      expect(validateRunHeader(fixture.header)).toEqual([])
      for (const [index, event] of (fixture.events as unknown[]).entries()) {
        expect(validateEventEntry(event), `${name} events[${index}]`).toEqual([])
      }
      for (const [index, observation] of (fixture.observations as unknown[]).entries()) {
        expect(validateObservation(observation), `${name} observations[${index}]`).toEqual([])
      }
      if (fixture.protocol !== undefined) expect(validateProtocol(fixture.protocol)).toEqual([])
    })
  }
})
