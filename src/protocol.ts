import { canonical } from '@rex/kernel'
import { seeds } from './ensemble.ts'
import type { SealValue } from './seal.ts'

export interface ProtocolArm {
  id: string
  owner: string
  pending?: string
  /** Flat, named configuration factors; the first two arms form the pair. */
  configuration: Record<string, SealValue>
}
export interface ProtocolCheck {
  id: string
  owner: string
  needs_types: string[]
  /** A fixed scale or a named rule interpreted by the check's evaluator. */
  tolerance: { abs: number; rel: number; scale: number | string; source: string } | null
  margin: { value: number; confidence: number; source: string } | null
  sidedness: 'one' | 'two' | null
  t_vacancy_ms?: number | null
}
export interface Protocol {
  milestone: string
  scenario: string
  self_feeding: boolean
  arms: ProtocolArm[]
  differences: string[]
  seeds: number[]
  streams: { id: string; mechanism: string; person_class: string; coupling: 'coupled' | 'not_feasible'; note: string }[]
  steps: { owner: string; reference_ms: number; second_ms: number | null }[]
  /** Every listed check is required. */
  checks: ProtocolCheck[]
  required_event_types: string[]
  samples: { measure: string; every_ms: number }[]
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const positive = (v: unknown): v is number => nonnegative(v) && v > 0
const strings = (v: unknown): v is string[] => Array.isArray(v) && Array.from(v).every(text) && new Set(v).size === v.length
const json = (v: unknown): boolean => v === null || typeof v === 'boolean' || typeof v === 'string'
  || (typeof v === 'number' && Number.isFinite(v)) || (Array.isArray(v) ? Array.from(v).every(json) : object(v) && Object.values(v).every(json))

/** Diagnostics sorted by path. Seed count is explicit: ten is a pilot, not a universal requirement. */
export function validateProtocol(input: unknown): string[] {
  if (!object(input)) return ['protocol: expected object']
  const errors: string[] = []
  const require = (ok: boolean, path: string) => { if (!ok) errors.push(`${path}: invalid or missing`) }
  const rows = (key: string, min: number, visit: (row: Record<string, unknown>, path: string) => void) => {
    const values = input[key]
    if (!Array.isArray(values)) { require(false, key); return }
    require(values.length >= min, key)
    Array.from(values).forEach((row, i) => {
      if (!object(row)) require(false, `${key}[${i}]`)
      else visit(row, `${key}[${i}]`)
    })
  }
  const unique = (key: string, field: string) => {
    if (!Array.isArray(input[key])) return
    const values = input[key].filter(object).map(row => row[field])
    require(new Set(values).size === values.length, `${key}.${field}: duplicates`)
  }
  require(text(input.milestone), 'milestone'); require(text(input.scenario), 'scenario')
  require(typeof input.self_feeding === 'boolean', 'self_feeding')
  rows('arms', 2, (r, p) => {
    require(text(r.id), `${p}.id`); require(text(r.owner), `${p}.owner`)
    require(r.pending === undefined || text(r.pending), `${p}.pending`)
    require(object(r.configuration) && json(r.configuration), `${p}.configuration`)
  })
  unique('arms', 'id')
  require(strings(input.differences) && input.differences.length === 1, 'differences')
  if (Array.isArray(input.arms)) {
    const [a, b] = input.arms
    if (object(a) && object(b) && object(a.configuration) && object(b.configuration) && json(a.configuration) && json(b.configuration)) {
      const left = a.configuration, right = b.configuration
      const changed = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(k =>
        !Object.hasOwn(left, k) || !Object.hasOwn(right, k) || canonical(left[k]) !== canonical(right[k])).sort()
      require(changed.length === 1 && strings(input.differences) && changed[0] === input.differences[0], 'arms: exactly one declared configuration difference')
    }
  }
  require(Array.isArray(input.seeds) && input.seeds.length > 0 && Array.from(input.seeds).every(nonnegative) && text(input.milestone)
    && canonical(input.seeds) === canonical(seeds(input.milestone, input.seeds.length)), 'seeds')
  rows('streams', 1, (r, p) => {
    for (const k of ['id', 'mechanism', 'person_class', 'note']) require(text(r[k]), `${p}.${k}`)
    require(r.coupling === 'coupled' || r.coupling === 'not_feasible', `${p}.coupling`)
  })
  unique('streams', 'id')
  if (Array.isArray(input.streams)) {
    const keys = input.streams.filter(object).map(r => JSON.stringify([r.mechanism, r.person_class]))
    require(new Set(keys).size === keys.length, 'streams: duplicate mechanism/person class')
  }
  rows('steps', 1, (r, p) => {
    require(text(r.owner), `${p}.owner`); require(positive(r.reference_ms), `${p}.reference_ms`)
    require(r.second_ms === null || positive(r.second_ms) && r.second_ms !== r.reference_ms, `${p}.second_ms`)
  })
  unique('steps', 'owner')
  require(strings(input.required_event_types), 'required_event_types')
  rows('checks', 1, (r, p) => {
    require(text(r.id), `${p}.id`); require(text(r.owner), `${p}.owner`)
    const required = input.required_event_types, tolerance = r.tolerance
    require(strings(r.needs_types) && strings(required) && r.needs_types.every(t => required.includes(t)), `${p}.needs_types`)
    require(tolerance === null || object(tolerance) && ['abs', 'rel'].every(k => nonnegative(tolerance[k]))
      && (nonnegative(tolerance.scale) || text(tolerance.scale)) && text(tolerance.source), `${p}.tolerance`)
    require(r.margin === null || object(r.margin) && nonnegative(r.margin.value) && positive(r.margin.confidence) && r.margin.confidence < 1 && text(r.margin.source), `${p}.margin`)
    require(r.sidedness === null || r.sidedness === 'one' || r.sidedness === 'two', `${p}.sidedness`)
    require(r.t_vacancy_ms === undefined || r.t_vacancy_ms === null || positive(r.t_vacancy_ms), `${p}.t_vacancy_ms`)
  })
  unique('checks', 'id')
  rows('samples', 0, (r, p) => { require(text(r.measure), `${p}.measure`); require(positive(r.every_ms), `${p}.every_ms`) })
  unique('samples', 'measure')
  return errors.sort()
}

/** Planning only: History never executes an arm. Output sorted by arm id. */
export function runnableArms(protocol: Protocol): ProtocolArm[] {
  const errors = validateProtocol(protocol)
  if (errors.length) throw new Error(errors.join('; '))
  return protocol.arms.filter(arm => arm.pending === undefined).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
