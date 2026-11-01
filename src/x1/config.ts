import type { BoundaryInput } from '../record.ts'

export const DAY_MS = 86_400_000
export type X1Arm = 'control' | 'dry'
export interface X1Config {
  duration_days: 730
  checkpoint_ms: 86400000
  seeds: 10
  arms: ['control', 'dry']
  init_bundle: string | null
  food_plant: string | null
  dry_input: BoundaryInput | null
  tolerances: Record<string, number | null>
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
/** Reports readiness without supplying any owner-owned value. Errors are lexical. */
export function validateX1Config(value: unknown): string[] {
  if (!object(value)) return ['config: expected object']
  const failures: string[] = []
  for (const [key, expected] of Object.entries({ duration_days: 730, checkpoint_ms: DAY_MS, seeds: 10 })) {
    if (value[key] !== expected) failures.push(`${key}: expected ${expected}`)
  }
  if (!Array.isArray(value.arms) || value.arms.join(',') !== 'control,dry') failures.push('arms: expected control,dry')
  for (const key of ['init_bundle', 'food_plant', 'dry_input']) {
    if (value[key] == null) failures.push(`missing: ${key}`)
    else if (key !== 'dry_input' && !text(value[key])) failures.push(`${key}: expected non-empty reference`)
  }
  const boundary = value.dry_input
  if (boundary != null && (!object(boundary) || !['researched', 'estimate', 'fiction'].includes(String(boundary.label)) || !text(boundary.source))) failures.push('dry_input: expected labelled boundary input with source')
  if (!object(value.tolerances)) failures.push('tolerances: expected object')
  else {
    if (!Object.keys(value.tolerances).length) failures.push('missing: tolerances')
    for (const [key, tolerance] of Object.entries(value.tolerances)) {
      if (tolerance === null) failures.push(`missing: tolerances.${key}`)
      else if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) failures.push(`tolerances.${key}: expected finite non-negative number`)
    }
  }
  const fields = ['duration_days', 'checkpoint_ms', 'seeds', 'arms', 'init_bundle', 'food_plant', 'dry_input', 'tolerances']
  for (const key of Object.keys(value)) if (!fields.includes(key)) failures.push(`${key}: unknown field`)
  return failures.sort()
}
