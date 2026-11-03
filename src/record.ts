import { canonical } from '@rex/kernel'

export const eventClasses = ['demographic', 'economic', 'land', 'technology', 'institution', 'conflict', 'succession', 'migration', 'culture', 'other'] as const
export type EventClass = typeof eventClasses[number]
export type Mode = 'fine' | 'coarse'
export type Value = number | string[] | null
export type DataLabel = 'researched' | 'estimate' | 'fiction'
export interface BoundaryInput {
  id: string; kind: 'pathogen' | 'arrival' | 'forcing' | 'other'
  target: string; port: string; region_edge: string
  schedule: { t: number; value: number; unit: string }[] | { series: string; unit: string }
  label: DataLabel; source: string; note?: string
}
export interface Scope { kind: 'person' | 'household' | 'settlement' | 'polity' | 'region' | 'world'; id: string }
/** Persisted in the manifest, independently of the event/observation writers. */
export interface RecordingBoundary { t: number; status: 'stopped'; reason: string; readFailures: number; missingValues: number }
export interface RunHeader {
  /** Absent only on legacy, unsealed runs. */
  input_seal_hash?: string
  run_id: string; target: string; seed: number
  engines: { id: string; package: string; version: string; commit: string }[]
  config_hash: string; init_bundle: string; boundary: BoundaryInput[]
  epoch: { sim_t0: 0; date: number; calendar_note: string }
  checkpoints: { period_ms: number; first_ms: number }
  resolution_plan: { entity: string; mode: Mode; from_t: number }[]
  reportable: boolean; non_reportable_reason?: string
  recording_boundaries?: RecordingBoundary[]
}
export type EventEntry = {
  id: string; t: number; source: string; type: string; cause?: string
  intention_id?: string; transaction_id?: string; leg_id?: string
  phase: number; position: number; sequence: number; class: EventClass
} & ({ payload: unknown; payload_hash?: never } | { payload?: never; payload_hash: string })
export interface Observation { t: number; quantity: string; unit: string; scope: Scope; value: Value; mode: Mode; port: string }
export interface Aggregate { t: number; measure: string; scope: Scope; value: Value; unit: string; fn: string; inputs: string[] }
export interface SnapshotRef { t: number; kernel_hash: string; participants: Record<string, string> }
interface ScoreBase { target: string; indicator: string; run_id: string; checkpoint: number | 'all'; S: number | null; signed_error: number | null; n_points: number; data_label: DataLabel }
export type Score = ScoreBase & {
  mean_S?: number | null; sd_S?: number | null; bias?: number | null; variance?: number | null
  sign_consistency?: number | null; verdict?: 'systematic' | 'stochastic' | 'insufficient'
}

type Check = (value: unknown) => boolean
type Fields = Record<string, Check>
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v))
const str: Check = v => typeof v === 'string' && v.trim().length > 0
const finite: Check = v => typeof v === 'number' && Number.isFinite(v)
const natural: Check = v => Number.isSafeInteger(v) && (v as number) >= 0
const integer: Check = v => Number.isSafeInteger(v)
const hash: Check = v => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v)
const choice = (values: readonly unknown[]): Check => v => values.includes(v)
const array = (check: Check): Check => v => Array.isArray(v) && Array.from(v).every(check)
const optional = (check: Check): Check => v => v === undefined || check(v)
const nullable = (check: Check): Check => v => v === null || check(v)
const json: Check = v => { try { canonical(v); return true } catch { return false } }
const shape = (fields: Fields): Check => v => validate(v, fields).length === 0
const mode = choice(['fine', 'coarse'])
const label = choice(['researched', 'estimate', 'fiction'])
const scope = shape({ kind: choice(['person', 'household', 'settlement', 'polity', 'region', 'world']), id: str })
const value: Check = v => v === null || finite(v) || array(v => typeof v === 'string')(v)
const target: Check = v => typeof v === 'string' && /^(H[1-5]|X1|[GC]-[^/\s]+)$/.test(v)
const runId: Check = v => typeof v === 'string' && v.split('/').length === 3 && target(v.split('/')[0]) && /^-?\d+$/.test(v.split('/')[1]) && integer(Number(v.split('/')[1])) && hash(v.split('/')[2])

function validate(input: unknown, fields: Fields): string[] {
  if (!object(input)) return ['record must be a plain object']
  const errors = Object.keys(fields).filter(key => !fields[key](input[key])).map(key => `${key}: invalid value`)
  for (const key of Object.keys(input)) if (!Object.hasOwn(fields, key)) errors.push(`${key}: unknown field`)
  return errors.sort()
}
export const validateBoundaryInput = (input: unknown): string[] => validate(input, {
  id: str, kind: choice(['pathogen', 'arrival', 'forcing', 'other']),
  target: str, port: str, region_edge: str,
  schedule: v => Array.isArray(v)
    ? array(shape({ t: natural, value: finite, unit: str }))(v)
    : shape({ series: str, unit: str })(v),
  label, source: str, note: optional(str),
})
export function validateRunHeader(input: unknown): string[] {
  const errors = validate(input, {
    input_seal_hash: optional(hash),
    run_id: runId, target, seed: integer,
    engines: array(shape({ id: str, package: str, version: str, commit: str })), config_hash: hash, init_bundle: str,
    boundary: array(v => validateBoundaryInput(v).length === 0),
    epoch: shape({ sim_t0: choice([0]), date: finite, calendar_note: str }),
    checkpoints: shape({ period_ms: v => natural(v) && v !== 0, first_ms: natural }),
    resolution_plan: array(shape({ entity: str, mode, from_t: natural })),
    reportable: v => typeof v === 'boolean', non_reportable_reason: optional(str),
    recording_boundaries: optional(array(shape({ t: natural, status: choice(['stopped']), reason: str, readFailures: natural, missingValues: natural }))),
  })
  if (object(input)) {
    if (target(input.target) && integer(input.seed) && hash(input.config_hash) && input.run_id !== `${input.target}/${input.seed}/${input.config_hash}`) errors.push('run_id: must match target/seed/config_hash')
    if (input.reportable === true && Array.isArray(input.engines) && input.engines.some(e => object(e) && typeof e.commit === 'string' && e.commit.endsWith('+dirty'))) errors.push('reportable: dirty engines are non-reportable')
  }
  return errors.sort()
}
export function validateEventEntry(input: unknown): string[] {
  const errors = validate(input, { id: str, t: natural, source: str, type: str, cause: optional(str), intention_id: optional(str), transaction_id: optional(str), leg_id: optional(str), phase: natural, position: natural, sequence: natural, class: choice(eventClasses), payload: optional(json), payload_hash: optional(hash) })
  if (object(input) && (input.payload !== undefined) === (input.payload_hash !== undefined)) errors.push('payload: require exactly one of payload or payload_hash')
  return errors.sort()
}
export const validateObservation = (input: unknown): string[] => validate(input, { t: natural, quantity: str, unit: str, scope, value, mode, port: str })
export const validateAggregate = (input: unknown): string[] => validate(input, { t: natural, measure: str, scope, value, unit: str, fn: v => typeof v === 'string' && /^(sum|count|max|share|classify@[^\s]+)$/.test(v), inputs: array(str) })
export const validateSnapshotRef = (input: unknown): string[] => validate(input, { t: natural, kernel_hash: hash, participants: v => object(v) && Object.entries(v).every(([id, h]) => str(id) && hash(h)) })
export function validateScore(input: unknown): string[] {
  const ensemble = object(input) && input.run_id === 'ensemble'
  const extra: Fields = { mean_S: nullable(v => finite(v) && (v as number) >= 0 && (v as number) <= 1), sd_S: nullable(v => finite(v) && (v as number) >= 0), bias: nullable(finite), variance: nullable(v => finite(v) && (v as number) >= 0), sign_consistency: nullable(natural), verdict: choice(['systematic', 'stochastic', 'insufficient']) }
  return validate(input, { target, indicator: str, run_id: v => v === 'ensemble' || runId(v), checkpoint: v => v === 'all' || natural(v), S: nullable(v => finite(v) && (v as number) >= 0 && (v as number) <= 1), signed_error: nullable(finite), n_points: natural, data_label: label, ...(ensemble ? extra : {}) })
}

/** Lexicographic scheduler order; individual coordinates may reset. */
export function compareEvents(a: EventEntry, b: EventEntry): number {
  return a.t - b.t || a.phase - b.phase || a.position - b.position || a.sequence - b.sequence
}
