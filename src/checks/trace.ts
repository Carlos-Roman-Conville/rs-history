import { canonical } from '@rex/kernel'
import defaultConditions from '../../data/trace-conditions.json' with { type: 'json' }
import { compareEvents } from '../record.ts'
import type { EventEntry, Observation, RunHeader } from '../record.ts'
import type { Protocol } from '../protocol.ts'
import { checkRequired, requiredTypes } from '../requirements.ts'
import type { ObserverStatus } from '../observer.ts'

export interface TraceConditionTable {
  version: string
  measurement_level: number
  rows: { id: string; rule: { type: string; all: {
    field: string; op: string; value?: unknown; other?: string
  }[] } }[]
}
export interface TraceInput {
  header: RunHeader
  events: readonly EventEntry[]
  /** In file order; observations without ids are addressed as series.jsonl:<1-based line>. */
  observations: readonly (Observation & { id?: string })[]
  protocol: Pick<Protocol, 'self_feeding' | 'required_event_types'>
  observer?: ObserverStatus
}
export interface TraceCrossing {
  quantity: string
  t: number
  direction: 'crossing' | 'recovery'
  floor: number | null
  unit: string | null
  evidence: string[]
}
export interface TraceStep { id: string; t: number; type: string; cause: string | null }
export interface FateRow {
  run_id: string
  person: string
  status: 'pass' | 'insufficient'
  outcome: 'alive' | 'incapacitated' | 'dead' | 'terminal_state_reached' | null
  /** Last observed outcome time, never silently extrapolated to run end. */
  outcome_at: number | null
  left_scope_at: number | null
  condition_version: string
  crossings: TraceCrossing[]
  evidence: string[]
  missing: string[]
  explanation: { steps: TraceStep[]; conditions: { id: string; evidence: string[] }[]; causal_proof: false } | null
}
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const sorted = (values: readonly string[]) => [...new Set(values)].sort()
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const personOf = (event: EventEntry) => {
  const p = object(event.payload)
  return text(p.person) ? p.person : text(p.body) ? p.body : null
}
const eventOrder = (a: EventEntry, b: EventEntry) => compareEvents(a, b) || order(a.id, b.id)
const changed = (previous: { active: boolean } | null, active: boolean) => previous === null ? active : previous.active !== active

function conditions(events: readonly EventEntry[], table: TraceConditionTable) {
  return [...table.rows].sort((a, b) => order(a.id, b.id)).flatMap(row => {
    const evidence = events.filter(event => event.type === row.rule.type && row.rule.all.every(test => {
      const p = object(event.payload), value = p[test.field]
      if (value === undefined || value === null) return false
      switch (test.op) {
        case 'eq': return value === test.value
        case 'neq': return text(value) && value !== test.value
        case 'nonempty': return text(value)
        case 'contains': return Array.isArray(value) && value.includes(test.value)
        case 'lt_field': return finite(value) && finite(p[test.other!]) && value < (p[test.other!] as number)
        default: throw new Error(`unsupported condition operator: ${test.op}`)
      }
    })).map(event => event.id)
    return evidence.length ? [{ id: row.id, evidence: sorted(evidence) }] : []
  })
}

/** PLAN §3.6, HI-5. Pure, post-run measurement; no state writes, draws or events.
 * Adapter contract (all values must come from recorded owner payloads):
 * - life.threshold: person, quantity, floor, unit, comparison ('lt'/'lte'),
 *   role ('incapacity'/'terminal'), validity ('sourced'/'open'/'fixture'), source (string/null).
 * - body.crisis: person/body, quantity, window_start; cause is an actual reserve row id.
 * - life.energy: person, intake_J, expenditure_J, intake_ids (kernel.transfer row ids).
 * - kernel.transfer intake rows: person, amount, unit, to (body account).
 * - body.death cause is the crisis event id; payload retains ledger cause, source,
 *   crisisStartedAt and person/body. Payload t, when present, must equal event t.
 * - cognition.intention cause leads to life.need; subsequent rows retain cause ancestry.
 * No identifier aliases, missing floors, ownership or budgets are inferred.
 * Event steps are in scheduler order, samples in time/id order, people/conditions/diagnostics
 * in lexical order. Evidence sets are sorted by row id. This is not empirical validation.
 */
export function traceFates(input: TraceInput, table: TraceConditionTable = defaultConditions): FateRow[] {
  if (!text(table.version) || table.measurement_level !== 4 || new Set(table.rows.map(r => r.id)).size !== table.rows.length
    || table.rows.some(r => !text(r.id) || !text(r.rule.type) || !r.rule.all.length || r.rule.all.some(t =>
      !text(t.field) || !['eq', 'neq', 'contains', 'nonempty', 'lt_field'].includes(t.op)
      || (t.op === 'lt_field' ? !text(t.other) : t.op !== 'nonempty' && t.value === undefined)))) {
    throw new Error('invalid trace condition table')
  }
  const events = [...input.events].sort(eventOrder)
  const samples = input.observations.map((o, i) => ({ ...o, id: o.id ?? `series.jsonl:${i + 1}` }))
  const byId = new Map(events.map(e => [e.id, e]))
  const sampleById = new Map(samples.map(o => [o.id, o]))
  const ids = [...events.map(e => e.id), ...samples.map(o => o.id)]
  const duplicateIds = ids.length !== new Set(ids).size
  const required = checkRequired(events, requiredTypes(input.protocol), input.observer ?? {
    stopped: !input.header.reportable || !!input.header.recording_boundaries?.length, readFailures: 0, missingValues: 0,
  })
  // Ownership of anonymous outcomes is established only through actual ancestry.
  function owner(event: EventEntry, visited = new Set<string>()): string | null {
    if (visited.has(event.id)) return null
    visited.add(event.id)
    const direct = personOf(event)
    if (direct) return direct
    const parent = event.cause ? byId.get(event.cause) : undefined
    return parent ? owner(parent, visited) : null
  }
  const people = sorted([...events.flatMap(e => owner(e) ?? []), ...samples.filter(o => o.scope.kind === 'person').map(o => o.scope.id)])
  return people.flatMap(person => {
    const own = events.filter(e => owner(e) === person)
    const observed = samples.filter(o => o.scope.kind === 'person' && o.scope.id === person).sort((a, b) => a.t - b.t || order(a.id, b.id))
    const membership = own.filter(e => e.type === 'life.membership')
    const initiallyObserved = observed.some(o => o.t <= (membership[0]?.t ?? Infinity)
      && (o.quantity !== 'life.in_scope' || o.value === 1))
    if (membership.length && !membership.some(e => object(e.payload).in_scope === true) && !initiallyObserved) return []
    if (!membership.length && !own.length && observed.every(o => o.quantity === 'life.in_scope' && o.value !== 1)) return []
    const missing: string[] = []
    if (duplicateIds) missing.push('duplicate row ids')
    if (required.status === 'insufficient' || !input.header.reportable || input.header.recording_boundaries?.length) missing.push('required recording evidence unavailable')
    if (typeof input.protocol.self_feeding !== 'boolean') missing.push('self_feeding declaration unavailable')
    const evidence = new Set([...own.map(e => e.id), ...observed.map(o => o.id)])
    // An unidentified mandatory row could belong to this person; never silently discard it.
    for (const event of events) if (input.protocol.required_event_types.includes(event.type) && !owner(event)) missing.push(`unattributed required row: ${event.id}`)
    function ancestry(start: EventEntry): EventEntry[] {
      const chain: EventEntry[] = [], visited = new Set<string>()
      let current: EventEntry | undefined = start
      while (current) {
        if (visited.has(current.id)) { missing.push(`cause cycle: ${start.id}`); break }
        visited.add(current.id); evidence.add(current.id); chain.push(current)
        if (current.payload === undefined || current.payload === null || typeof current.payload !== 'object' || Array.isArray(current.payload)) missing.push(`missing payload: ${current.id}`)
        if (owner(current) !== person) missing.push(`foreign or unowned cause: ${current.id}`)
        if (!current.cause) break
        const sample = sampleById.get(current.cause)
        if (sample) {
          evidence.add(sample.id)
          if (sample.scope.kind !== 'person' || sample.scope.id !== person || sample.t > current.t || sample.value === null) missing.push(`invalid reserve cause: ${sample.id}`)
          break
        }
        const parent = byId.get(current.cause)
        if (!parent || compareEvents(parent, current) >= 0) { missing.push(`broken cause: ${current.id} -> ${current.cause}`); break }
        current = parent
      }
      return chain
    }
    for (const event of own) ancestry(event)
    const crossings: TraceCrossing[] = []
    const thresholds = own.filter(e => e.type === 'life.threshold')
    const states = new Map<string, boolean>()
    for (const [thresholdIndex, threshold] of thresholds.entries()) {
      const p = object(threshold.payload)
      if (!text(p.quantity) || !finite(p.floor) || !text(p.unit) || !['lt', 'lte'].includes(String(p.comparison))
        || !['incapacity', 'terminal'].includes(String(p.role))) { missing.push(`invalid threshold: ${threshold.id}`); continue }
      let previous: { active: boolean; id: string } | null = null
      const successor = thresholds.slice(thresholdIndex + 1).find(e => object(e.payload).quantity === p.quantity && object(e.payload).role === p.role)
      const series = observed.filter(o => o.quantity === p.quantity && o.t >= threshold.t && (!successor || o.t < successor.t))
      if (!series.length) missing.push(`missing threshold series: ${threshold.id}`)
      for (const sample of series) {
        if (!finite(sample.value) || sample.unit !== p.unit) { missing.push(`missing or incompatible state: ${sample.id}`); previous = null; continue }
        const active = p.comparison === 'lt' ? sample.value < p.floor : sample.value <= p.floor
        if (changed(previous, active)) crossings.push({
          quantity: p.quantity, t: sample.t, direction: active ? 'crossing' : 'recovery', floor: p.floor, unit: p.unit,
          evidence: sorted([threshold.id, sample.id, ...(previous ? [previous.id] : [])]),
        })
        previous = { active, id: sample.id }
      }
      if (previous && !successor) states.set(threshold.id, previous.active)
    }
    // Recorded boolean states are owner declarations, not numerical History floors.
    let incapacity: { active: boolean; t: number } | null = null
    const incapacitySeries = [
      ...own.filter(e => e.type === 'life.incapacity').map(e => ({ id: e.id, t: e.t, value: object(e.payload).crossed })),
      ...observed.filter(o => o.quantity === 'life.incapacitated').map(o => ({ id: o.id, t: o.t, value: o.value === 1 ? true : o.value === 0 ? false : null })),
    ].sort((a, b) => a.t - b.t || order(a.id, b.id))
    for (const state of incapacitySeries) {
      if (typeof state.value !== 'boolean') { missing.push(`missing incapacity: ${state.id}`); continue }
      if (changed(incapacity, state.value)) crossings.push({ quantity: 'life.incapacitated', t: state.t,
        direction: state.value ? 'crossing' : 'recovery', floor: null, unit: null, evidence: [state.id] })
      incapacity = { active: state.value, t: state.t }
    }
    const deaths = own.filter(e => e.type === 'body.death')
    for (const death of deaths) {
      const crisis = death.cause ? byId.get(death.cause) : undefined
      if (!crisis || crisis.type !== 'body.crisis' || owner(crisis) !== person) { missing.push(`death without crisis: ${death.id}`); continue }
      const c = object(crisis.payload), d = object(death.payload)
      if (!text(d.cause) || !text(d.source) || !finite(d.crisisStartedAt)) missing.push(`missing death ledger payload: ${death.id}`)
      if (d.crisisStartedAt !== (c.startedAt ?? crisis.t) || (d.t !== undefined && d.t !== death.t)) missing.push(`crisis time mismatch: ${death.id}`)
      if (d.cause !== (c.kind ?? c.cause) || (c.source !== undefined && d.source !== c.source)) missing.push(`crisis ledger mismatch: ${death.id}`)
      const reserve = crisis.cause ? sampleById.get(crisis.cause) : undefined
      if (!text(c.quantity) || !finite(c.window_start) || c.window_start > crisis.t || !reserve || reserve.quantity !== c.quantity) {
        missing.push(`crisis without reserve window: ${crisis.id}`); continue
      }
      const series = observed.filter(o => o.quantity === c.quantity && o.t >= (c.window_start as number) && o.t <= crisis.t)
      if (series.length < 2 || !series.some(o => o.id === reserve.id) || series.some(o => !finite(o.value) || o.unit !== reserve.unit)) missing.push(`missing reserve series: ${crisis.id}`)
      const floor = thresholds.filter(e => object(e.payload).quantity === c.quantity && e.t <= reserve.t).at(-1)
      const f = object(floor?.payload)
      if (!floor || !finite(f.floor) || !finite(reserve.value) || f.unit !== reserve.unit
        || !(f.comparison === 'lt' ? reserve.value < f.floor : f.comparison === 'lte' && reserve.value <= f.floor)) missing.push(`missing crossed declared floor: ${crisis.id}`)
      const budgets = own.filter(e => e.type === 'life.energy' && e.t >= (c.window_start as number) && e.t <= crisis.t)
      if (!budgets.length) missing.push(`missing budget: ${crisis.id}`)
      for (const budget of budgets) {
        const b = object(budget.payload)
        if (!finite(b.intake_J) || b.intake_J < 0 || !finite(b.expenditure_J) || b.expenditure_J < 0 || !Array.isArray(b.intake_ids)
          || (b.intake_J > 0 && !b.intake_ids.length)) { missing.push(`missing budget payload: ${budget.id}`); continue }
        for (const id of b.intake_ids) {
          const intake = typeof id === 'string' ? byId.get(id) : undefined
          if (!intake || intake.type !== 'kernel.transfer' || owner(intake) !== person || intake.t < (c.window_start as number) || intake.t > budget.t
            || !finite(object(intake.payload).amount) || (object(intake.payload).amount as number) <= 0
            || !text(object(intake.payload).unit) || !text(object(intake.payload).to)) missing.push(`missing intake evidence: ${budget.id}:${String(id)}`)
        }
      }
    }
    if (input.protocol.self_feeding) for (const intake of own.filter(e => e.type === 'kernel.transfer')) {
      const chain = ancestry(intake)
      const intention = chain.findIndex(e => e.type === 'cognition.intention')
      if (intention < 1 || !chain.slice(intention + 1).some(e => e.type === 'life.need')) missing.push(`intake without eater intention and need: ${intake.id}`)
    }
    const alive = observed.filter(o => o.quantity === 'life.alive').at(-1)
    const death = deaths.at(-1)
    let outcome: FateRow['outcome'] = null, outcome_at: number | null = null
    if (death && alive?.value === 1 && alive.t >= death.t) missing.push('alive state contradicts death row')
    const terminalActive = thresholds.some(e => object(e.payload).role === 'terminal' && states.get(e.id))
    if (death || alive?.value === 0 || terminalActive) {
      outcome = 'terminal_state_reached'; outcome_at = death?.t ?? (alive?.value === 0 ? alive.t : observed.at(-1)?.t ?? null)
      if (!death) missing.push('terminal state without death row')
      // A source string alone is not validation: the owner must mark the criterion sourced.
      const crisis = death?.cause ? byId.get(death.cause) : undefined
      if (death && !missing.length && thresholds.some(e => { const p = object(e.payload); return p.role === 'terminal'
        && p.quantity === object(crisis?.payload).quantity && e.t <= death.t
        && p.validity === 'sourced' && text(p.source) && states.get(e.id) })) outcome = 'dead'
    } else if (incapacity?.active || thresholds.some(e => object(e.payload).role === 'incapacity' && states.get(e.id))) {
      outcome = 'incapacitated'; outcome_at = incapacity?.t ?? observed.at(-1)?.t ?? null
    } else if (alive?.value === 1) { outcome = 'alive'; outcome_at = alive.t }
    if (outcome === null) missing.push('missing outcome state')
    const lastMembership = membership.at(-1)
    const left_scope_at = lastMembership && object(lastMembership.payload).in_scope === false ? lastMembership.t : null
    crossings.sort((a, b) => a.t - b.t || order(a.quantity, b.quantity) || order(a.evidence.join(), b.evidence.join()))
    const steps = [...own.map(e => ({ id: e.id, t: e.t, type: e.type, cause: e.cause ?? null })),
      ...observed.map(o => ({ id: o.id, t: o.t, type: o.quantity, cause: null }))]
      .sort((a, b) => a.t - b.t || (byId.has(a.id) && byId.has(b.id) ? eventOrder(byId.get(a.id)!, byId.get(b.id)!)
        : Number(byId.has(b.id)) - Number(byId.has(a.id)) || order(a.id, b.id)))
    return [{ run_id: input.header.run_id, person, status: missing.length ? 'insufficient' : 'pass', outcome, outcome_at,
      left_scope_at, condition_version: table.version, crossings, evidence: sorted([...evidence]), missing: sorted(missing),
      explanation: missing.length ? null : { steps, conditions: conditions(own, table), causal_proof: false } }]
  })
}

/** Canonical fate.jsonl bytes, sorted by person; caller owns the output file/seal. */
export function fateJsonl(rows: readonly FateRow[]): string {
  return [...rows].sort((a, b) => order(a.person, b.person)).map(row => `${canonical(row)}\n`).join('')
}
