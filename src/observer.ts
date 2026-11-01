import { canonical, fnv1a64, type Scheduler, type EventBus } from '@rex/kernel'
import { classify, type EventClassTable } from './classes.ts'
import type { Observation, SnapshotRef, Value } from './record.ts'
import type { RunWriter } from './writer.ts'

export const INITIAL = 'initial'

export interface ObserverRead extends Omit<Observation, 't' | 'value' | 'mode'> {
  mode?: Observation['mode']
  read(): Value
}
export interface ObserverOptions {
  scheduler: Scheduler
  bus: EventBus
  writer: RunWriter
  checkpoint: { period_ms: number; first_ms: number }
  reads: readonly ObserverRead[]
  classes: EventClassTable
  /** Host supplies snapshot hashes; the observer supplies the checkpoint time. */
  snapshot?: (t: number) => Omit<SnapshotRef, 't'>
}
export interface ObserverStatus {
  readonly stopped: boolean
  readonly readFailures: number
  readonly missingValues: number
}

/**
 * Attach one inert process. The host order must admit history.record in record.
 * INITIAL (initial) observations are read at attach time before scheduled checkpoints.
 * An omitted resolution mode means fine; counters include all attempted reads.
 */
export function attachObserver({ scheduler, bus, writer, checkpoint, reads, classes, snapshot }: ObserverOptions): ObserverStatus {
  let cursor = 0
  let stopped = false
  let readFailures = 0
  let missingValues = 0
  function recordAt(t: number) {
    if (stopped) return
    try {
      // since() omits ordering metadata; state() gives detached EventRecords.
      const { records } = bus.state()
      while (cursor < records.length && records[cursor].event.t <= t) {
        const { event, phase, position, sequence } = records[cursor]
        const { payload, ...identity } = event
        const mapped = classes.map.some(row => row.source === event.source && row.type === event.type)
        writer.event({
          ...identity, phase, position, sequence,
          class: classify(event.source, event.type, classes),
          ...(mapped ? { payload } : { payload_hash: fnv1a64(canonical(payload)) }),
        })
        cursor++
      }
      for (const input of reads) {
        let value: Value
        try { value = input.read() } catch { value = null; readFailures++ }
        if (value === null) missingValues++
        writer.observe({
          t, quantity: input.quantity, unit: input.unit, port: input.port,
          scope: { ...input.scope }, mode: input.mode ?? 'fine',
          value: Array.isArray(value) ? [...value] : value,
        })
      }
      if (snapshot) writer.snapshot({ ...snapshot(t), t })
    } catch (error) {
      stopped = true
      // Even a broken failure reporter must not escape into the scheduler.
      try { writer.fail(error instanceof Error ? error.message : String(error)) } catch { /* stopped */ }
    }
  }
  function recordInitial(marker: typeof INITIAL) {
    // INITIAL labels this initial read; it never advances the scheduler or bus.
    void marker
    recordAt(scheduler.t)
  }
  scheduler.register({
    id: 'history.record', phase: 'record', readonly: true, mechanisms: [],
    period: checkpoint.period_ms, offset: checkpoint.first_ms,
    run({ t }) { recordAt(t) },
  })
  recordInitial(INITIAL)
  return {
    get stopped() { return stopped },
    get readFailures() { return readFailures },
    get missingValues() { return missingValues },
  }
}
