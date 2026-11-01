// X1-0, "the observer's thirty days" (DESIGN §6, seam S0): the History observer on the kernel's
// three-engine harness. The composition is the kernel's thirty-days.ts with `days` in place of 30.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, defaultOrder, fnv1a64, DAY, HOUR, SECOND, EventBus, Scheduler, type ProcessOrder } from '@rex/kernel'
import { dailyProcesses, threePorts, withKernelSteps, type Midnight } from '@rex/kernel-harness'
import { attachObserver, openRun, type ObserverRead, type RunHeader, type SnapshotRef } from '@rex/history'
import { totalUnits } from '@rex/economy'
import { buildHamlet } from '../../settlement/examples/hamlet.ts'
import { runHorseStable } from '../../realism/examples/horse-stable.ts'
import type { World } from '../../realism/src/world.ts'

export type { Midnight }

export const WORLD = { kind: 'world', id: 'world' } as const
export const goodScope = (id: string) => ({ kind: 'region', id: `good:${id}` }) as const
export const quantities = {
  money: 'money.total', day: 'settlement.day',
  total: 'goods.total', produced: 'goods.produced', consumed: 'goods.consumed',
} as const

/** The kernel order with the record phase admitting the observer (the host's choice, DESIGN §1). */
const order: ProcessOrder = { phases: defaultOrder.phases, order: { ...defaultOrder.order, record: ['history.record'] } }
const seed = 42

export interface ObservedRun {
  days: number
  observed: boolean
  dir: string | null
  midnights: Midnight[]
  /** Participant snapshot hashes taken at each midnight by the host, observer or not. */
  hashes: Record<string, string>[]
  /** Kernel bus records emitted in each simulated day. */
  busPerDay: number[]
  wallMs: number
  status: { stopped: boolean; readFailures: number; missingValues: number } | null
}

export function runObserved({ days, observe, dir }: { days: number; observe: boolean; dir?: string }): ObservedRun {
  const started = performance.now()
  const ports = threePorts(days)
  const hamlet = buildHamlet()
  hamlet.r.state.settlement.day = 0 // The prepared hamlet is this run's epoch, as in runThirtyDays.
  const bus = new EventBus(), clock = new Scheduler({ emit: bus.emit, order })
  const midnights: Midnight[] = [], hashes: Record<string, string>[] = [], counters: number[] = []
  let dayOrder: string[] = [], world: World | undefined
  const ledgerMoney = () => Object.values(ports.ledger.balances).reduce((sum, value) => sum + value, 0)
  const goodIds = Object.keys(ports.economy.state.goods).sort()
  const goodsAt = (id: string) => {
    const state = ports.economy.state
    const markets = Object.values(state.markets)
    return {
      total: totalUnits(state, id),
      produced: markets.reduce((sum, market) => sum + market.goods[id].producedLast, 0),
      consumed: markets.reduce((sum, market) => sum + market.goods[id].consumedLast, 0),
    }
  }
  const adapters = dailyProcesses(clock, hamlet.r, ports.economy, {
    beforeEconomy: ports.beforeEconomy,
    record: (_t, id) => dayOrder.push(id),
    afterDay(t) {
      const state = ports.economy.state
      midnights.push({
        t, order: dayOrder, tickTrace: [...hamlet.r.state.tickTrace], settlementDay: hamlet.r.state.settlement.day,
        economyDay: state.day, worldTime: world!.t, money: ledgerMoney(),
        goods: Object.fromEntries(Object.keys(state.goods).map(id => [id, goodsAt(id)])),
        cells: Object.values(state.markets).flatMap(market => Object.entries(market.goods).map(([id, good]) => ({
          price: good.price, stock: state.inventories[market.inventory].stock[id] ?? 0,
        }))),
      })
      dayOrder = []
      hashes.push(participantHashes())
      counters.push(bus.state().counter)
    },
  })
  const participantHashes = () => Object.fromEntries(adapters.participants.map(p => [p.id, fnv1a64(canonical(p.snapshot()))]))

  let status: ObservedRun['status'] = null
  let runDir: string | null = null
  let close: (() => void) | undefined
  if (observe) {
    runDir = dir ?? mkdtempSync(join(tmpdir(), 'x1-0-'))
    const header: RunHeader = {
      run_id: `X1/${seed}/${fnv1a64(canonical({ days, harness: 'three-engine' }))}`, target: 'X1', seed,
      engines: ['realism', 'settlement', 'economy'].map(id => ({ id, package: `@rex/${id}`, version: '0.0.1', commit: 'harness' })),
      config_hash: fnv1a64(canonical({ days, harness: 'three-engine' })), init_bundle: 'prepared-hamlet', boundary: [],
      epoch: { sim_t0: 0, date: 0, calendar_note: 'harness epoch, no calendar' },
      checkpoints: { period_ms: DAY, first_ms: 0 }, resolution_plan: [],
      reportable: false, non_reportable_reason: 'X1-0 observer harness, not a calibration run',
    }
    const writer = openRun(runDir, header)
    const read = (quantity: string, unit: string, scope: ObserverRead['scope'], value: () => number): ObserverRead =>
      ({ quantity, unit, scope, port: 'harness', read: value })
    const reads: ObserverRead[] = [
      read(quantities.money, 'currency', WORLD, ledgerMoney),
      read(quantities.day, 'day', WORLD, () => hamlet.r.state.settlement.day),
      ...goodIds.flatMap(id => (['total', 'produced', 'consumed'] as const).map(kind =>
        read(quantities[kind], 'unit', goodScope(id), () => goodsAt(id)[kind]))),
    ]
    status = attachObserver({
      scheduler: clock, bus, writer, checkpoint: header.checkpoints, reads, classes: { version: 1, map: [] },
      snapshot: (t): Omit<SnapshotRef, 't'> => ({
        kernel_hash: fnv1a64(canonical({ t, counter: bus.state().counter })), participants: participantHashes(),
      }),
    })
    close = () => writer.close()
  }

  withKernelSteps(clock, () => runHorseStable(days, { stepS: SECOND / SECOND, compactEveryS: HOUR / SECOND }), (w, t) => {
    world = w
    if (t % DAY === 0) dayOrder.push('realism.step')
    if (t % HOUR === 0) {
      const failed = w.trace.failed()
      if (failed.length) throw new Error(`realism conservation failed at ${t}: ${JSON.stringify(failed[0])}`)
      w.trace.checks.length = 0
    }
  })
  close?.()
  const wallMs = performance.now() - started
  return {
    days, observed: observe, dir: runDir, midnights, hashes, wallMs,
    busPerDay: counters.map((n, i) => n - (counters[i - 1] ?? 0)),
    status: status && { stopped: status.stopped, readFailures: status.readFailures, missingValues: status.missingValues },
  }
}
