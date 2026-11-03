import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fateJsonl, traceFates } from '../src/checks/trace.ts'
import type { TraceInput } from '../src/checks/trace.ts'
import type { EventEntry, Observation, RunHeader } from '../src/record.ts'

interface Fixture { case: string; expected: string; header: RunHeader; events: EventEntry[]; observations: Observation[] }
const root = join(import.meta.dirname, 'fixtures/synthetic/trace')
const fixtures: Fixture[] = readdirSync(root).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(readFileSync(join(root, f), 'utf8')) as Fixture)
const fixture = (name: string) => fixtures.find(f => f.case === name)!
const person = 'person/fixture-trace'
const event = (id: string, t: number, type: string, payload: Record<string, unknown>, cause?: string): EventEntry => ({
  id, t, phase: 1, position: 0, sequence: t, source: 'fixture', type, class: 'other', payload: { person, ...payload }, ...(cause ? { cause } : {}),
})
const sample = (id: string, t: number, quantity: string, value: number | null, unit = 'J') => ({
  id, t, quantity, value, unit, scope: { kind: 'person' as const, id: person }, mode: 'fine' as const, port: quantity,
})
const raw = (f: Fixture): TraceInput => ({ ...structuredClone(f), protocol: { required_event_types: [], self_feeding: false } })

/** Explicit FIXTURE-ONLY extension, following test/accounting.test.ts. The JSON
 * scenarios omit protocol/capture declarations, cause targets, reserve/floor and
 * budget evidence, and left-scope outcome. These rows are synthetic assumptions,
 * NOT reconstruction of those missing records and NOT production fallbacks.
 * Original JSON files remain untouched. Raw incomplete records are tested below.
 * Values 10/0 J, floor 1 J, budget 0/0 J and alive-at-exit are labelled fixtures.
 * Each unresolved intention id gets a synthetic owner's intention. The referenced
 * crisis/fixture-1 is an explicit additional crisis row, not an alias for evt.9.
 * The death ledger fields name that synthetic crisis and fixture floor source.
 */
function inputFor(f: Fixture): TraceInput {
  const input = raw(f)
  const events = [...input.events], observations = [...input.observations]
  if (f.case === 'broken-cause-chain') return input
  if (f.case === 'left-scope-early') observations.push(sample('fixture:alive-at-exit', 2000, 'life.alive', 1, 'boolean'))
  if (f.case.startsWith('death-')) {
    events.push(event('fixture:floor', 0, 'life.threshold', { quantity: 'fixture.reserve', floor: 1, unit: 'J', comparison: 'lt', role: 'terminal', validity: 'fixture', source: null }))
    observations.push(sample('fixture:opening-reserve', 0, 'fixture.reserve', 10), sample('reserve/fixture-1', 3500, 'fixture.reserve', 0))
    events.push(event('crisis/fixture-1', 4500, 'body.crisis', { kind: 'starvation', quantity: 'fixture.reserve', window_start: 0 }, 'reserve/fixture-1'))
    const death = events.find(e => e.type === 'body.death')!
    death.payload = { ...(death.payload as object), cause: 'starvation', crisisStartedAt: 4500, source: 'fixture:floor' }
    if (!events.some(e => e.type === 'life.energy')) events.push(event('fixture:budget', 3000, 'life.energy', { intake_J: 0, expenditure_J: 0, intake_ids: [] }))
    for (const e of [...events]) {
      if (e.cause?.startsWith('intention/')) events.push(event(e.cause, e.t - 1, 'cognition.intention', { action: 'eat' }))
      if (e.type === 'life.energy' && (e.payload as Record<string, unknown>).intake_J === 1) {
        // Explicit 1 J synthetic journal evidence corresponding to the JSON budget.
        e.payload = { ...(e.payload as object), intake_ids: ['fixture:intake'] }
        events.push(event('fixture:intake', 500, 'kernel.transfer', { to: 'fixture:body-account', amount: 1, unit: 'J' }))
      }
    }
  }
  return { ...input, events, observations }
}
const clean = () => inputFor(fixture('death-no-food-perceived'))
const row = (input: TraceInput) => traceFates(input)[0]
const payload = (input: TraceInput, id: string) => input.events.find(e => e.id === id)!.payload as Record<string, unknown>

describe('PLAN §3.6 / V13 mechanism trace', () => {
  for (const f of fixtures) it(`meets ${f.expected} for ${f.case} with explicit fixture-only evidence extensions`, () => {
    const result = row(inputFor(f))
    expect(result.status, result.missing.join('\n')).toBe(f.expected)
    expect(result.explanation === null).toBe(f.expected === 'insufficient')
  })

  it('keeps the raw incomplete death and exit fixtures insufficient without test extensions', () => {
    for (const f of fixtures.filter(f => f.case !== 'survivor-incapacity-recovered')) {
      expect(row(raw(f)).status).toBe('insufficient')
      expect(row(raw(f)).explanation).toBeNull()
    }
    expect(row(raw(fixture('left-scope-early'))).outcome).toBeNull()
  })

  it.each([
    ['death-no-food-perceived', 'no_food_perceived_in_reach', 'evt.1'],
    ['death-failed-attempt', 'failed_attempt', 'evt.1'],
    ['death-evaluated-not-selected', 'eat_evaluated_not_selected', 'evt.1'],
    ['death-intake-below-expenditure', 'intake_below_expenditure', 'evt.1'],
    ['death-other-crisis-cause', 'other_crisis_cause', 'evt.1'],
  ])('records condition and original evidence for %s', (name, id, evidence) => {
    expect(row(inputFor(fixture(name))).explanation!.conditions).toContainEqual({ id, evidence: [evidence] })
  })

  it('lists every supported condition in the several-conditions case, never an exclusive class', () => {
    const input = inputFor(fixture('death-several-conditions'))
    expect(row(input).explanation!.conditions).toEqual([
      { id: 'failed_attempt', evidence: ['evt.2'] },
      { id: 'no_food_perceived_in_reach', evidence: ['evt.1'] },
    ])
    // Selecting rest alone does not prove eating was evaluated. Explicit fixture extension:
    payload(input, 'evt.3').alternatives = ['eat', 'rest']
    expect(row(input).explanation!.conditions.map(c => c.id)).toEqual(['eat_evaluated_not_selected', 'failed_attempt', 'no_food_perceived_in_reach'])
  })

  it('retains people who left scope with the last observed outcome and time', () => {
    const result = row(inputFor(fixture('left-scope-early')))
    expect(result).toMatchObject({ person, outcome: 'alive', outcome_at: 2000, left_scope_at: 2000 })
    expect(traceFates({ ...clean(), events: [event('outside', 0, 'life.membership', { in_scope: false })], observations: [] })).toEqual([])
  })

  it('retains initial members with only an exit event and sorts multiple people without mixing evidence', () => {
    const input = raw(fixture('left-scope-early'))
    input.events = [event('exit', 2000, 'life.membership', { in_scope: false }),
      event('other-perception', 1000, 'cognition.perception', { person: 'person/a', food_in_reach: false })]
    input.observations = [sample('initial', 0, 'life.alive', 1), { ...sample('other-alive', 3000, 'life.alive', 1), scope: { kind: 'person', id: 'person/a' } }]
    const rows = traceFates(input)
    expect(rows.map(r => [r.person, r.status])).toEqual([['person/a', 'pass'], [person, 'pass']])
    expect(rows[1]).toMatchObject({ left_scope_at: 2000, outcome: 'alive', outcome_at: 0 })
    expect(rows[1].explanation!.conditions).toEqual([])
    expect(rows[1].evidence).not.toContain('other-perception')
  })

  it('records incapacity and recovery even when the final outcome is alive', () => {
    const result = row(raw(fixture('survivor-incapacity-recovered')))
    expect(result).toMatchObject({ status: 'pass', outcome: 'alive', outcome_at: 3000 })
    expect(result.crossings.map(c => [c.t, c.direction, c.floor])).toEqual([[1000, 'crossing', null], [2000, 'recovery', null]])
  })

  it('uses only the recorded floor, preserves repeated crossings, and respects equality', () => {
    const input = raw(fixture('survivor-incapacity-recovered'))
    input.events = [event('floor', 0, 'life.threshold', { quantity: 'reserve', floor: 3, unit: 'J', comparison: 'lt', role: 'incapacity' })]
    input.observations = [sample('s0', 0, 'reserve', 3), sample('s1', 1, 'reserve', 2), sample('s2', 2, 'reserve', 3), sample('s3', 3, 'reserve', 1)]
    const result = row(input)
    expect(result).toMatchObject({ status: 'pass', outcome: 'incapacitated', outcome_at: 3 })
    expect(result.crossings.map(c => [c.t, c.direction])).toEqual([[1, 'crossing'], [2, 'recovery'], [3, 'crossing']])
    expect(result.crossings[0].evidence).toEqual(['floor', 's0', 's1'])
    payload(input, 'floor').comparison = 'lte'
    expect(row(input).crossings.map(c => c.t)).toEqual([0])
  })

  it('distinguishes unsourced terminal states from owner-sourced death criteria', () => {
    const input = clean()
    expect(row(input).outcome).toBe('terminal_state_reached')
    Object.assign(payload(input, 'fixture:floor'), { source: 'fixture:pretend sourced criterion', validity: 'sourced' })
    expect(row(input).outcome).toBe('dead')
    payload(input, 'fixture:floor').source = null
    expect(row(input).outcome).toBe('terminal_state_reached')
  })

  it('never promotes an incomplete chain to a sourced death or hides a terminal crossing', () => {
    const input = clean()
    Object.assign(payload(input, 'fixture:floor'), { validity: 'sourced', source: 'fixture:pretend sourced criterion' })
    payload(input, 'fixture:budget').expenditure_J = null
    expect(row(input)).toMatchObject({ status: 'insufficient', outcome: 'terminal_state_reached', explanation: null })
    input.events = input.events.filter(e => e.type !== 'body.death')
    input.observations = input.observations.filter(o => o.quantity !== 'life.alive')
    expect(row(input)).toMatchObject({ status: 'insufficient', outcome: 'terminal_state_reached' })
  })

  it('does not use a superseded threshold to claim permanent incapacity after recovery', () => {
    const input = raw(fixture('survivor-incapacity-recovered'))
    input.events = [event('old', 0, 'life.threshold', { quantity: 'reserve', floor: 3, unit: 'J', comparison: 'lt', role: 'incapacity' }),
      event('new', 2, 'life.threshold', { quantity: 'reserve', floor: 1, unit: 'J', comparison: 'lt', role: 'incapacity' })]
    input.observations = [sample('s0', 0, 'reserve', 2), sample('s1', 2, 'reserve', 2), sample('alive', 3, 'life.alive', 1)]
    expect(row(input)).toMatchObject({ status: 'pass', outcome: 'alive' })
    expect(row(input).crossings).toHaveLength(1)
    input.observations = [...input.observations, sample('unknown', 4, 'reserve', null)]
    expect(row(input).explanation).toBeNull()
  })

  it.each(['cause', 'cycle', 'foreign', 'future', 'payload', 'ledger', 'reserve', 'floor', 'budget', 'intake', 'duplicate'])('suppresses explanation for defective %s evidence', defect => {
    const input = clean()
    if (defect === 'cause') input.events.find(e => e.id === 'evt.10')!.cause = 'missing'
    if (defect === 'cycle') input.events.find(e => e.id === 'crisis/fixture-1')!.cause = 'evt.10'
    if (defect === 'foreign') payload(input, 'crisis/fixture-1').person = 'another-person'
    if (defect === 'future') input.events.find(e => e.id === 'crisis/fixture-1')!.t = 6000
    if (defect === 'payload') input.events = input.events.map(e => e.id === 'evt.1' ? { ...e, payload: undefined, payload_hash: '0123456789abcdef' } : e)
    if (defect === 'payload') input.protocol.required_event_types = ['cognition.perception']
    if (defect === 'ledger') payload(input, 'evt.10').crisisStartedAt = null
    if (defect === 'reserve') input.observations = input.observations.filter(o => o.id !== 'fixture:opening-reserve')
    if (defect === 'floor') payload(input, 'fixture:floor').floor = null
    if (defect === 'budget') payload(input, 'fixture:budget').expenditure_J = null
    if (defect === 'intake') Object.assign(payload(input, 'fixture:budget'), { intake_J: 1, intake_ids: ['missing-intake'] })
    if (defect === 'duplicate') input.events = [...input.events, input.events[0]]
    expect(row(input).status).toBe('insufficient')
    expect(row(input).explanation).toBeNull()
  })

  it('propagates stopped recording, required class absence and unreportable headers', () => {
    for (const fault of ['stopped', 'required', 'header']) {
      const input = clean()
      if (fault === 'stopped') input.observer = { stopped: true, readFailures: 0, missingValues: 0 }
      if (fault === 'required') input.protocol.required_event_types = ['absent.required.type']
      if (fault === 'header') input.header.reportable = false
      expect(row(input).explanation).toBeNull()
    }
  })

  it('requires eater intention and need ancestry only when self_feeding is declared', () => {
    const input = inputFor(fixture('death-intake-below-expenditure'))
    expect(row(input).status).toBe('pass')
    input.protocol.self_feeding = true
    expect(row(input).explanation).toBeNull()
    input.events = [...input.events, event('need', 100, 'life.need', {}), event('intention', 200, 'cognition.intention', { action: 'eat' }, 'need'),
      event('outcome', 300, 'shared.action.outcome', { status: 'completed' }, 'intention')]
    input.events.find(e => e.id === 'fixture:intake')!.cause = 'outcome'
    expect(row(input).status).toBe('pass')
    payload(input, 'intention').person = 'another-person'
    expect(row(input).explanation).toBeNull()
  })

  it('never attributes an anonymous failure to every person in the run', () => {
    const input = clean()
    input.events = [...input.events, event('unowned', 100, 'shared.action.outcome', { person: null, status: 'failed', reason: 'reach' })]
    expect(row(input).explanation!.conditions.map(c => c.id)).not.toContain('failed_attempt')
    input.protocol.required_event_types = ['shared.action.outcome']
    expect(row(input).status).toBe('insufficient')
  })

  it('emits deterministic canonical fate JSONL without mutating the run', () => {
    const input = clean(), before = structuredClone(input)
    const result = traceFates(input)
    expect(input).toEqual(before)
    expect(fateJsonl(result)).toBe(fateJsonl(traceFates({ ...input, events: [...input.events].reverse() })))
    expect(JSON.parse(fateJsonl(result))).toEqual(result[0])
    expect(fateJsonl(result).endsWith('\n')).toBe(true)
    expect(result[0].explanation!.steps.map(s => s.id)).toEqual(expect.arrayContaining(['evt.10', 'crisis/fixture-1', 'reserve/fixture-1', 'fixture:budget', 'evt.1']))
  })
})
