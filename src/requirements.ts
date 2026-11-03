import type { ObserverStatus } from './observer.ts'
import type { EventEntry } from './record.ts'

/** Protocol declaration uses event type names, not broad display classes. */
export interface RequiredEventsProtocol { required_event_types: readonly string[] }
/** Sorted, deduplicated copy; a missing/malformed declaration must not silently pass. */
export function requiredTypes(protocol: RequiredEventsProtocol): string[] {
  if (!Array.isArray(protocol.required_event_types) || protocol.required_event_types.some(type => typeof type !== 'string' || !type.trim())) {
    throw new Error('required_event_types must be an array of nonempty strings')
  }
  return [...new Set(protocol.required_event_types)].sort()
}

export interface RequiredTypeResult {
  type: string
  status: 'ok' | 'insufficient'
  hash_only_ids: string[]
  missing: boolean
}
export type RecordingGap = { kind: 'readFailures' | 'missingValues'; count: number } | { kind: 'stopped' }
export interface RequirementReport {
  status: 'ok' | 'insufficient'
  types: RequiredTypeResult[]
  gaps: RecordingGap[]
}

/** Evidence readiness only: ok does not establish that a substantive check passes.
 * Consumers must propagate insufficient before evaluating a dependent check.
 * With no occurrence guarantee available, an absent required type is insufficient.
 */
export function checkRequired(events: readonly EventEntry[], required: readonly string[], observerStatus: ObserverStatus): RequirementReport {
  const gaps: RecordingGap[] = []
  if (observerStatus.readFailures > 0) gaps.push({ kind: 'readFailures', count: observerStatus.readFailures })
  if (observerStatus.missingValues > 0) gaps.push({ kind: 'missingValues', count: observerStatus.missingValues })
  if (observerStatus.stopped) gaps.push({ kind: 'stopped' })
  const types = requiredTypes({ required_event_types: required }).map((type): RequiredTypeResult => {
    const matching = events.filter(event => event.type === type)
    const hash_only_ids = matching.filter(event => event.payload === undefined).map(event => event.id).sort()
    const missing = matching.length === 0
    return { type, status: gaps.length || missing || hash_only_ids.length ? 'insufficient' : 'ok', hash_only_ids, missing }
  })
  return { status: gaps.length || types.some(type => type.status === 'insufficient') ? 'insufficient' : 'ok', types, gaps }
}
