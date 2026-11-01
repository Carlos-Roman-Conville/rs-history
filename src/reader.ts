import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fnv1a64 } from '@rex/kernel'
import { compareEvents, validateRunHeader, validateEventEntry, validateObservation, validateAggregate, validateSnapshotRef } from './record.ts'
import type { RunHeader, EventEntry, Observation, Aggregate, SnapshotRef } from './record.ts'
import { assertValid, recordFiles } from './writer.ts'

export interface RunRecord { header: RunHeader; events: EventEntry[]; series: Observation[]; aggregates: Aggregate[]; snapshots: SnapshotRef[] }
export function readRun(dir: string): RunRecord {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest.json: invalid manifest')
  const { hashes, ...header } = manifest
  assertValid(header, validateRunHeader, 'manifest.json')
  function rows<T>(file: typeof recordFiles[number], validator: (v: unknown) => string[]): T[] {
    const text = readFileSync(join(dir, file), 'utf8')
    if (hashes?.[file] !== fnv1a64(text)) throw new Error(`${file}: hash mismatch`)
    if (text === '') return []
    if (!text.endsWith('\n')) throw new Error(`${file}: missing final newline`)
    return text.slice(0, -1).split('\n').map((line, i) => {
      let row: unknown
      try { row = JSON.parse(line) } catch { throw new Error(`${file}:${i + 1}: invalid JSON`) }
      assertValid(row, validator, `${file}:${i + 1}`)
      return row as T
    })
  }
  const events = rows<EventEntry>('events.jsonl', validateEventEntry)
  for (let i = 1; i < events.length; i++) if (compareEvents(events[i - 1], events[i]) >= 0) throw new Error('events.jsonl: invalid kernel order')
  return { header: header as RunHeader, events, series: rows('series.jsonl', validateObservation), aggregates: rows('aggregates.jsonl', validateAggregate), snapshots: rows('snapshots.jsonl', validateSnapshotRef) }
}
