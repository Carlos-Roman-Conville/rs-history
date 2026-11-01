import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canonical } from '@rex/kernel'
import { x1 } from '../src/index.ts'

const config = JSON.parse(readFileSync(new URL('../data/x1.json', import.meta.url), 'utf8'))
it('X1 config preserves owner-owned nulls and reports every missing input', () => {
  const before = canonical(config)
  expect(x1.validateX1Config(config)).toEqual(['missing: dry_input', 'missing: food_plant', 'missing: init_bundle', 'missing: tolerances'])
  expect(canonical(config)).toBe(before)
  expect(config).toMatchObject({ duration_days: 730, checkpoint_ms: 86400000, seeds: 10, arms: ['control', 'dry'] })
})
it('X1 config validates supplied references, labelled boundary inputs and tolerances', () => {
  const ready: x1.X1Config = { ...config, init_bundle: 'catalogue/village', food_plant: 'life/cassava', dry_input: { label: 'fiction', source: 'synthetic fixture', precipitation: 1 }, tolerances: { N: 0.01 } }
  expect(x1.validateX1Config(ready)).toEqual([])
  expect(x1.validateX1Config({ ...ready, seeds: 9, duration_days: 2, checkpoint_ms: 1, arms: ['dry', 'control'], tolerances: { N: null, C: -1 } })).toEqual([
    'arms: expected control,dry', 'checkpoint_ms: expected 86400000', 'duration_days: expected 730', 'missing: tolerances.N', 'seeds: expected 10', 'tolerances.C: expected finite non-negative number',
  ])
  expect(x1.validateX1Config(null)).toEqual(['config: expected object'])
  expect(x1.validateX1Config({ ...ready, dry_input: {} })).toContain('dry_input: expected labelled boundary input with source')
})
