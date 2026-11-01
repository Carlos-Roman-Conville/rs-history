import type { Aggregate, Observation, Scope } from './record.ts'

type RecordInput = { series: readonly Observation[]; snapshots?: readonly { t: number }[] }
export type MembersOf = (scope: Scope, t: number) => readonly Scope[] | null | undefined
export type AggregateOptions = {
  measure: string; targets: readonly Scope[]; membersOf: MembersOf
} & ({ fn: 'sum' | 'count' | 'max'; quantity: string } | { fn: 'share'; quantity: readonly [part: string, whole: string] })
export interface ResolutionSwitch { entity: string; from_t: number }

export const observationId = (o: Observation): string => `${o.t}/${o.quantity}/${o.scope.kind}/${o.scope.id}`
const scopeKey = (s: Scope): string => `${s.kind}/${s.id}`
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

function index(run: RecordInput): Map<string, Observation> {
  const rows = new Map<string, Observation>()
  for (const o of run.series) {
    const id = observationId(o)
    if (rows.has(id)) throw new Error(`duplicate observation: ${id}`)
    rows.set(id, o)
  }
  return rows
}

/** Null membership means an unknown link; [] means a known empty scope.
 * Fine person rows are leaves; coarse rows replace their entire subtree.
 * Shares sum [part, whole] independently. Count counts non-null resolved rows.
 * Output order is numeric t, then lexical scope kind/id; inputs are lexical IDs.
 */
export function aggregateSeries(run: RecordInput, options: AggregateOptions): Aggregate[] {
  const rows = index(run)
  const times = [...new Set([...run.series, ...(run.snapshots ?? [])].map(o => o.t))].sort((a, b) => a - b)
  const targets = [...new Map(options.targets.map(s => [scopeKey(s), s])).values()].sort((a, b) => lexical(scopeKey(a), scopeKey(b)))
  return times.flatMap(t => targets.map(scope => {
    function resolve(quantity: string): { rows: Observation[]; missing: boolean } {
      const selected = new Map<string, Observation>()
      let missing = false
      function visit(s: Scope, ancestors: Set<string>): void {
        const key = scopeKey(s)
        if (ancestors.has(key)) throw new Error(`cyclic scope membership: ${key}`)
        const own = rows.get(`${t}/${quantity}/${key}`)
        if (own?.mode === 'coarse' || s.kind === 'person') {
          if (own) selected.set(observationId(own), own)
          else missing = true
          return
        }
        const children = options.membersOf(s, t)
        if (children == null) { missing = true; return }
        for (const child of children) visit(child, new Set([...ancestors, key]))
      }
      visit(scope, new Set())
      return { rows: [...selected.values()].sort((a, b) => lexical(observationId(a), observationId(b))), missing }
    }
    function numeric(part: ReturnType<typeof resolve>, fn: 'sum' | 'max'): number | null {
      if (part.missing || part.rows.some(o => typeof o.value !== 'number')) return null
      const values = part.rows.map(o => o.value as number)
      return fn === 'max' ? (values.length ? values.reduce((a, b) => Math.max(a, b)) : null) : values.reduce((a, b) => a + b, 0)
    }
    const part = resolve(options.fn === 'share' ? options.quantity[0] : options.quantity)
    const whole = options.fn === 'share' ? resolve(options.quantity[1]) : undefined
    const used = [...new Map([...part.rows, ...(whole?.rows ?? [])].map(o => [observationId(o), o])).values()]
    const units = new Set(used.map(o => o.unit))
    if (units.size > 1) throw new Error(`incompatible units: ${t}/${options.measure}/${scopeKey(scope)}`)
    let value: number | null
    if (whole) {
      const a = numeric(part, 'sum'), b = numeric(whole, 'sum')
      value = a === null || b === null || b === 0 ? null : a / b
    } else if (options.fn === 'count') value = part.missing ? null : part.rows.filter(o => o.value !== null).length
    else value = numeric(part, options.fn === 'max' ? 'max' : 'sum')
    return { t, measure: options.measure, scope: { ...scope }, value,
      unit: options.fn === 'count' || options.fn === 'share' ? '1' : (used[0]?.unit ?? run.series.find(o => o.quantity === options.quantity)?.unit ?? '1'),
      fn: options.fn, inputs: used.map(observationId).sort() }
  }))
}

/** V5 checks sum rows only; other functions do not assert a sum identity. */
export function sumIdentity(aggregates: readonly Aggregate[], run: RecordInput): string[] {
  const rows = index(run)
  const failures: string[] = []
  for (const a of aggregates) {
    if (a.fn !== 'sum') continue
    const label = `V5 ${a.t}/${a.measure}/${scopeKey(a.scope)}`
    const inputs = a.inputs.map(id => rows.get(id))
    if (new Set(a.inputs).size !== a.inputs.length || inputs.some(o => !o || o.t !== a.t || o.unit !== a.unit)) {
      failures.push(`${label}: invalid inputs`); continue
    }
    const values = inputs.map(o => o!.value)
    if (values.some(v => v === null)) {
      if (a.value !== null) failures.push(`${label}: expected null`)
      continue
    }
    if (typeof a.value !== 'number' || values.some(v => typeof v !== 'number')) {
      failures.push(`${label}: non-numeric sum`); continue
    }
    const numbers = values as number[]
    const expected = numbers.reduce((sum, v) => sum + v, 0)
    const matches = Number.isInteger(a.value) && numbers.every(Number.isInteger)
      ? BigInt(a.value) === numbers.reduce((sum, v) => sum + BigInt(v), 0n)
      : Math.abs(a.value - expected) <= 1e-9 * Math.max(1, Math.abs(a.value))
    if (!matches) failures.push(`${label}: expected ${expected}, got ${a.value}`)
  }
  return failures.sort()
}

/** V6 compares t < from_t with t >= from_t, separately by measure and scope.
 * Missing endpoints/null values are failures: continuity cannot be established.
 * Tolerance is an absolute difference in the series' units.
 */
export function continuity(series: readonly Aggregate[], switches: readonly ResolutionSwitch[], tolerance: number): string[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('tolerance must be finite and non-negative')
  const failures: string[] = []
  for (const change of switches) {
    const groups = new Map<string, Aggregate[]>()
    for (const row of series) if (row.scope.id === change.entity) {
      const key = `${row.measure}/${scopeKey(row.scope)}`
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    if (!groups.size) failures.push(`V6 ${change.from_t}/${change.entity}: missing series`)
    for (const [key, rows] of groups) {
      rows.sort((a, b) => a.t - b.t)
      const before = rows.filter(a => a.t < change.from_t).at(-1)
      const after = rows.find(a => a.t >= change.from_t)
      const label = `V6 ${change.from_t}/${key}`
      if (typeof before?.value !== 'number' || typeof after?.value !== 'number') failures.push(`${label}: missing numeric endpoints`)
      else if (Math.abs(after.value - before.value) > tolerance) failures.push(`${label}: jump ${Math.abs(after.value - before.value)} exceeds ${tolerance}`)
    }
  }
  return failures.sort()
}
