import { expect, it } from 'vitest'
import { classify, unmapped } from '../src/classes.ts'
import table from '../data/event-classes.json'
import { event } from './fixtures.ts'
it('classify uses source and type and falls back to other', () => {
  expect(table.version).toBe(1)
  expect(table.map.length).toBeGreaterThan(0)
  const configured = { version: 1 as const, map: [{ source: 'engine', type: 'birth', class: 'demographic' as const }] }
  expect(classify('engine', 'birth', configured)).toBe('demographic')
  expect(classify('unknown', 'birth', configured)).toBe('other')
  expect(classify('engine', 'unknown', configured)).toBe('other')
})
it('unmapped counts only other rows in sorted source/type order', () => {
  expect(unmapped([event, { ...event, source: 'z', class: 'other' }, { ...event, source: 'a', class: 'other' }, { ...event, source: 'z', class: 'other' }])).toEqual([{ key: 'a/birth', count: 1 }, { key: 'z/birth', count: 2 }])
})
