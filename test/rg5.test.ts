import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRG5 } from '../src/checks/rg5.ts'
import type { RG5Input } from '../src/checks/rg5.ts'
import type { EventEntry, RunHeader } from '../src/record.ts'
import { combineChecks } from '../src/verdict.ts'

const dir = join(import.meta.dirname, 'fixtures/synthetic/rg5')
interface Fixture { header: RunHeader; events: EventEntry[]; expected: string }
const read = (name: string): Fixture => JSON.parse(readFileSync(join(dir, name), 'utf8'))
/** Explicit labelled fixture extension, not inferred production evidence:
 * the synthetic observation path is fixture/hearsay, ledger copies are empty
 * and unchanged, and the unchanged-prior case declares posterior "safe" with
 * tolerance zero. Its JSON expected:"pass" is a test verdict, never a posterior.
 * The missing cause in that case is supplied explicitly. No fixture is edited.
 */
function inputFor(name = 'belief-unchanged-prior.json'): RG5Input {
  const f = read(name)
  const report = f.events[0]
  report.payload = { ...(report.payload as object), path: 'fixture/hearsay' }
  if (name === 'belief-unchanged-prior.json') f.events[1].cause = 'report/fixture-2'
  return {
    header: f.header, events: f.events, observation_paths: ['fixture/hearsay'],
    expectations: name === 'belief-unchanged-prior.json'
      ? [{ belief_event: 'evt.2', value: 'safe', tolerance: 0, source: 'fixture:unchanged-prior' }] : [],
    ledgers: [{ id: 'fixture:ledger', report_event: report.id,
      before: { journal: [], stocks: { 'fixture/owner': 1 } }, after: { journal: [], stocks: { 'fixture/owner': 1 } } }],
  }
}
const payload = (i: RG5Input, n: number) => i.events[n].payload as Record<string, unknown>

describe('RG-5 information isolation and declared updating', () => {
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    it(`${name}: labelled fixture extension meets expected`, () => {
      const result = checkRG5(inputFor(name))
      expect(combineChecks([result.isolation, result.updating]).status).toBe(read(name).expected)
    })
  }
  it('unchanged beliefs pass when the declared posterior equals the prior', () => {
    const result = checkRG5(inputFor())
    expect(result.isolation.status).toBe('pass')
    expect(result.updating.status).toBe('pass')
  })
  it('raw fixture verdict strings do not substitute for declared posterior values', () => {
    const i = inputFor(); i.expectations = []
    expect(checkRG5(i).updating.status).toBe('insufficient')
    i.expectations = [{ belief_event: 'evt.2', value: 'pass', tolerance: 0, source: 'fixture' }]
    expect(checkRG5(i).updating.status).toBe('fail')
  })
  it('updating and isolation are separate even for a numerically correct leaked belief', () => {
    const i = inputFor(); payload(i, 0).received = false
    expect(checkRG5(i)).toMatchObject({ isolation: { status: 'fail' }, updating: { status: 'pass' } })
  })
  it('another recipient, a hidden path and a report after the update fail isolation', () => {
    for (const mutate of [
      (i: RG5Input) => { payload(i, 0).person = 'other' },
      (i: RG5Input) => { payload(i, 0).path = 'hidden/ground-truth' },
      (i: RG5Input) => { i.events[0].t = 3000 },
      (i: RG5Input) => { i.events[1].cause = 'hidden/ground-truth' },
    ]) {
      const i = inputFor(); mutate(i)
      expect(checkRG5(i).isolation.status).toBe('fail')
    }
  })
  it('same-instant reports must precede beliefs in kernel order', () => {
    const i = inputFor(); i.events[1].t = i.events[0].t
    expect(checkRG5(i).isolation.status).toBe('pass')
    i.events[1].sequence = 0
    expect(checkRG5(i).isolation.status).toBe('fail')
  })
  it('journal changes and individual owner stock changes fail even if the total balances', () => {
    const i = inputFor()
    i.ledgers[0].after.journal = [{ amount: 1 }]
    expect(checkRG5(i).isolation.status).toBe('fail')
    i.ledgers[0].after.journal = []
    i.ledgers[0].before.stocks = { a: 1, b: 1 }
    i.ledgers[0].after.stocks = { a: 0, b: 2 }
    expect(checkRG5(i).isolation.status).toBe('fail')
  })
  it('report-caused journal entries fail without snapshots, including indirect causes', () => {
    const i = inputFor('ledger-changed-by-report.json'); i.ledgers = []
    expect(checkRG5(i).isolation.status).toBe('fail')
    const intermediate = { ...i.events[0], id: 'middle', type: 'fixture.intermediate', cause: 'evt.1' }
    i.events[1].cause = 'middle'; i.events = [...i.events, intermediate]
    expect(checkRG5(i).isolation.status).toBe('fail')
  })
  it('numeric posteriors use the inclusive declared absolute tolerance only', () => {
    const i = inputFor(); payload(i, 1).prior = 0; payload(i, 1).belief = 0.75
    i.expectations = [{ belief_event: 'evt.2', value: 0.5, tolerance: 0.25, source: 'fixture:numeric' }]
    expect(checkRG5(i).updating.status).toBe('pass')
    payload(i, 1).belief = 0.76
    expect(checkRG5(i).updating.status).toBe('fail')
    payload(i, 0).credibility = 0
    expect(checkRG5(i).updating.status).toBe('fail')
  })
  it('missing or invalid expectations and tolerance remain insufficient', () => {
    for (const tolerance of [null, -1, NaN, Infinity]) {
      const i = inputFor(); i.expectations[0].tolerance = tolerance
      expect(checkRG5(i).updating.status).toBe('insufficient')
    }
    const i = inputFor(); i.expectations[0].value = null
    expect(checkRG5(i).updating.status).toBe('insufficient')
    i.expectations[0].value = 'safe'; i.expectations[0].source = ''
    expect(checkRG5(i).updating.status).toBe('insufficient')
  })
  it('missing receipt, path, ledger or required payload cannot pass isolation', () => {
    for (const mutate of [
      (i: RG5Input) => { delete payload(i, 0).received },
      (i: RG5Input) => { delete payload(i, 0).path },
      (i: RG5Input) => { i.observation_paths = null },
      (i: RG5Input) => { i.ledgers = [] },
      (i: RG5Input) => { i.ledgers[0].before.stocks = null },
      (i: RG5Input) => { i.ledgers[0].after.stocks = { a: null } },
      (i: RG5Input) => { i.events = [{ ...i.events[0], payload: undefined, payload_hash: '0123456789abcdef' }, i.events[1]] },
    ]) {
      const i = inputFor(); mutate(i)
      expect(checkRG5(i).isolation.status).toBe('insufficient')
    }
  })
  it('stopped recording, empty runs and missing posteriors are insufficient', () => {
    const i = inputFor(); i.header.reportable = false
    expect(checkRG5(i)).toMatchObject({ isolation: { status: 'insufficient' }, updating: { status: 'insufficient' } })
    i.header.reportable = true; i.events = [i.events[0]]
    expect(checkRG5(i).updating.status).toBe('insufficient')
    i.events = []; i.ledgers = []
    expect(checkRG5(i)).toMatchObject({ isolation: { status: 'insufficient' }, updating: { status: 'insufficient' } })
  })
  it('unrecorded changes between belief rows fail isolation', () => {
    const i = inputFor()
    i.events = [...i.events, { ...i.events[1], id: 'evt.3', t: 3000, payload_hash: undefined,
      payload: { person: 'person/fixture-trace', prior: 'danger', belief: 'safe' } }]
    expect(checkRG5(i).isolation.status).toBe('fail')
  })
  it('duplicate report aliases and event ids cannot pass', () => {
    const i = inputFor(); i.events = [...i.events, { ...i.events[0], id: 'duplicate' }]
    expect(checkRG5(i).isolation.status).toBe('insufficient')
    i.events[2].id = 'evt.1'
    expect(checkRG5(i).isolation.status).toBe('insufficient')
  })
  it('input order is irrelevant, evidence is sorted and inputs remain unchanged', () => {
    const i = inputFor(), before = structuredClone(i), report = checkRG5(i)
    expect(i).toEqual(before)
    i.events = [...i.events].reverse()
    expect(checkRG5(i)).toEqual(report)
    expect(report.isolation.evidence).toEqual([...report.isolation.evidence].sort())
  })
})
