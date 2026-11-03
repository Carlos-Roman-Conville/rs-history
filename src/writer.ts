import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonical, fnv1a64 } from '@rex/kernel'
import { compareEvents, validateRunHeader, validateEventEntry, validateObservation, validateAggregate, validateSnapshotRef } from './record.ts'
import type { RunHeader, EventEntry, Observation, Aggregate, SnapshotRef, RecordingBoundary } from './record.ts'

export const recordFiles = ['events.jsonl', 'series.jsonl', 'aggregates.jsonl', 'snapshots.jsonl'] as const
export interface RunWriter {
  event(e: EventEntry): void; observe(o: Observation): void; aggregate(a: Aggregate): void
  snapshot(s: SnapshotRef): void; fail(reason: string, boundary?: RecordingBoundary): void; close(): void
}
export function assertValid(value: unknown, validator: (v: unknown) => string[], name: string): void {
  const errors = validator(value)
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`)
}
export function openRun(dir: string, header: RunHeader): RunWriter {
  assertValid(header, validateRunHeader, 'header')
  const saved: RunHeader = JSON.parse(canonical(header))
  mkdirSync(dir, { recursive: true })
  for (const file of [...recordFiles, 'manifest.json']) if (existsSync(join(dir, file))) throw new Error(`refusing to overwrite ${file}`)
  for (const file of recordFiles) writeFileSync(join(dir, file), '', { flag: 'wx' })
  let closed = false
  let last: EventEntry | undefined
  const fail = (reason: string, boundary?: RecordingBoundary): void => {
    saved.reportable = false
    saved.non_reportable_reason = typeof reason === 'string' && reason.trim() ? reason : 'History recording failed'
    if (boundary) (saved.recording_boundaries ??= []).push({ ...boundary })
  }
  function append(file: typeof recordFiles[number], row: unknown, validator: (v: unknown) => string[]): void {
    if (closed) throw new Error('run is closed')
    assertValid(row, validator, file)
    const line = canonical(row) + '\n'
    try { appendFileSync(join(dir, file), line) } catch (error) { fail(`write failed: ${file}`); throw error }
  }
  return {
    event(e) {
      assertValid(e, validateEventEntry, 'events.jsonl')
      if (last && compareEvents(last, e) >= 0) throw new Error('events.jsonl: events must be strictly increasing in kernel order')
      append('events.jsonl', e, validateEventEntry)
      last = { ...e }
    },
    observe: o => append('series.jsonl', o, validateObservation),
    aggregate: a => append('aggregates.jsonl', a, validateAggregate),
    snapshot: s => append('snapshots.jsonl', s, validateSnapshotRef),
    fail,
    close() {
      if (closed) return
      const hashes = Object.fromEntries(recordFiles.map(file => [file, fnv1a64(readFileSync(join(dir, file), 'utf8'))]))
      writeFileSync(join(dir, 'manifest.json'), canonical({ ...saved, hashes }) + '\n', { flag: 'wx' })
      closed = true
    },
  }
}
