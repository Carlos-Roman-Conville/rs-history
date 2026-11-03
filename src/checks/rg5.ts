import { canonical } from '@rex/kernel'
import { compareEvents } from '../record.ts'
import type { EventEntry, RunHeader } from '../record.ts'
import { combineChecks } from '../verdict.ts'
import type { CheckStatus, Finding } from '../verdict.ts'

export type BeliefValue = string | number | boolean
export interface RG5Expectation {
  belief_event: string
  value: BeliefValue | null
  /** Absolute tolerance, including zero for exact categorical comparison. */
  tolerance: number | null
  source: string
}
export interface RG5Ledger {
  id: string
  report_event: string
  /** Complete journal and owner-stock copies immediately around report delivery,
   * with no intervening physical action. Null means an unavailable read. */
  before: { journal: readonly unknown[] | null; stocks: Readonly<Record<string, number | null>> | null }
  after: { journal: readonly unknown[] | null; stocks: Readonly<Record<string, number | null>> | null }
}
export interface RG5Input {
  header: Pick<RunHeader, 'reportable' | 'recording_boundaries'>
  events: readonly EventEntry[]
  /** Declared observation path ids, matched to report payload.path. */
  observation_paths: readonly string[] | null
  expectations: readonly RG5Expectation[]
  ledgers: readonly RG5Ledger[]
}
export interface RG5Finding extends Finding { reasons: string[] }
export interface RG5Report {
  isolation: RG5Finding
  updating: RG5Finding
}
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const value = (v: unknown): v is BeliefValue => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const sorted = (items: string[]) => [...new Set(items)].sort()

/** PLAN 3.11 / V20; INTEGRATION-PLAN rev 3 2c (Rex, 2026-11-02).
 * Pure post-run checks, no iteration. Reports use cognition.report payloads
 * {person, report, received, path, credibility?}; cognition.belief payloads use
 * {person, prior, belief}, and cause identifies the report event or report id.
 * Each person has one scalar belief record in this early RG-5 contract.
 * Cognition owns values and expectations; Kernel/owners own ledger copies.
 * Credibility is evidence only: History never implements an updating rule.
 * Parameters and expectations must be sourced (fixture or protocol); missing
 * evidence is insufficient. Outputs are dimensionless, sorted by evidence id.
 * Implemented and numerically checked on synthetic reports only; no validation
 * evidence or live-engine integration is claimed.
 */
export function checkRG5(input: RG5Input): RG5Report {
  const isolation: RG5Finding[] = [], updating: RG5Finding[] = []
  const add = (rows: RG5Finding[], status: CheckStatus, evidence: string[], reason: string) => rows.push({ status, evidence, reasons: [reason] })
  const both = (reason: string, ids: string[]) => {
    add(isolation, 'insufficient', ids, reason); add(updating, 'insufficient', ids, reason)
  }
  const events = [...input.events].sort((a, b) => compareEvents(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (!input.header.reportable || input.header.recording_boundaries?.length) both('recording is incomplete or non-reportable', [])
  if (new Set(events.map(e => e.id)).size !== events.length) both('duplicate event ids', events.map(e => e.id))
  const reports = events.filter(e => e.type === 'cognition.report')
  const beliefs = events.filter(e => e.type === 'cognition.belief')
  const byId = new Map(events.map(e => [e.id, e]))
  const matchingReports = (cause: string | undefined) => reports.filter(r => cause === r.id || cause !== undefined && cause === object(r.payload).report)
  if (!reports.length) both('no report evidence', [])

  for (const report of reports) {
    const p = object(report.payload)
    if (!text(p.person) || !text(p.report) || typeof p.received !== 'boolean') both('report payload unavailable or incomplete', [report.id])
    const copies = input.ledgers.filter(l => l.report_event === report.id)
    if (copies.length !== 1) add(isolation, 'insufficient', [report.id], 'one paired ledger copy required per report')
    for (const ledger of copies) {
      const ids = [report.id, ledger.id]
      for (const part of ['journal', 'stocks'] as const) {
        const before = ledger.before[part], after = ledger.after[part]
        if (before === null || after === null || (part === 'stocks' && [before, after].some(s => Object.values(s).some(v => typeof v !== 'number' || !Number.isFinite(v))))) {
          add(isolation, 'insufficient', ids, `${part} copy unavailable`)
        } else {
          add(isolation, canonical(before) === canonical(after) ? 'pass' : 'fail', ids, `${part} unchanged across report`)
        }
      }
    }
    if (p.received === true && !beliefs.some(b => matchingReports(b.cause).includes(report))) {
      both('received report has no linked posterior record', [report.id])
    }
  }

  // A journal row caused by a report is independently incriminating even when
  // snapshots are absent. Follow event causes as well as report aliases.
  for (const event of events.filter(e => e.type === 'kernel.transfer')) {
    let cause = event.cause
    const visited = new Set<string>()
    while (cause && !visited.has(cause)) {
      visited.add(cause)
      const parents = matchingReports(cause)
      if (parents.length) {
        add(isolation, 'fail', [event.id, ...parents.map(r => r.id)], 'report caused a physical journal entry')
        break
      }
      cause = byId.get(cause)?.cause
    }
  }

  const previous = new Map<string, { value: BeliefValue; id: string }>()
  for (const belief of beliefs) {
    const p = object(belief.payload), ids = [belief.id]
    if (!text(p.person) || !value(p.prior) || !value(p.belief)) {
      both('belief payload unavailable or incomplete', ids)
      continue
    }
    const prior = previous.get(p.person)
    if (prior && prior.value !== p.prior) add(isolation, 'fail', [...ids, prior.id], 'belief changed between recorded updates')
    previous.set(p.person, { value: p.belief, id: belief.id })
    const matches = matchingReports(belief.cause)
    if (matches.length !== 1) {
      const missingReport = reports.some(r => !text(object(r.payload).report))
      add(isolation, matches.length > 1 || !belief.cause || missingReport ? 'insufficient' : 'fail', ids, 'belief requires an unambiguous report cause')
      add(updating, 'insufficient', ids, 'posterior cannot be linked to one report')
      continue
    }
    const report = matches[0], r = object(report.payload)
    ids.push(report.id)
    if (compareEvents(report, belief) >= 0 || text(r.person) && r.person !== p.person || r.received === false) {
      add(isolation, 'fail', ids, 'report was not received by this person before the belief record')
    } else if (!text(r.person) || r.received !== true || !text(r.path) || input.observation_paths === null) {
      add(isolation, 'insufficient', ids, 'receipt or declared observation path unavailable')
    } else {
      add(isolation, input.observation_paths.includes(r.path) ? 'pass' : 'fail', ids, 'report follows declared observation path')
    }
    const expectations = input.expectations.filter(e => e.belief_event === belief.id)
    const expected = expectations[0]
    if (expectations.length !== 1 || !value(expected?.value) || !text(expected.source)
      || expected.tolerance === null || !Number.isFinite(expected.tolerance) || expected.tolerance < 0) {
      add(updating, 'insufficient', ids, 'declared expectation, source or tolerance unavailable')
    } else {
      const matches = typeof p.belief === 'number' && typeof expected.value === 'number'
        ? Math.abs(p.belief - expected.value) <= expected.tolerance : p.belief === expected.value
      add(updating, matches ? 'pass' : 'fail', [...ids, expected.source], 'posterior compared with declared expectation')
    }
  }
  const finish = (rows: RG5Finding[]): RG5Finding => ({ ...combineChecks(rows), reasons: sorted(rows.flatMap(r => r.reasons)) })
  return { isolation: finish(isolation), updating: finish(updating) }
}
