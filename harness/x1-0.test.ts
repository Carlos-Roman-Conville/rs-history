import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DAY } from '@rex/kernel'
import { aggregateSeries, readRun, sumIdentity, type Scope } from '@rex/history'
import { checkRegistry, type Declaration, type RegistryData } from '../../kernel/scripts/check-registry.ts'
import { goodScope, quantities, runObserved, WORLD, type ObservedRun } from './x1-0.ts'

// The Gate defaults to 3 days; the full demonstration is an explicit periodic run.
const days = Number(process.env.S0_DAYS ?? 3)
if (!Number.isSafeInteger(days) || days < 1) throw new Error('S0_DAYS must be a positive integer')
const checks = { 'G-inert': 'fail', Replay: 'fail', Measurement: 'fail', 'G-unread': 'fail' }
const midnightTimes = Array.from({ length: days }, (_, i) => (i + 1) * DAY)
const files = ['events.jsonl', 'series.jsonl', 'aggregates.jsonl', 'snapshots.jsonl', 'manifest.json']
const reportPath = join(import.meta.dirname, 'S0-REPORT.md')
const hour = 3_600_000

let plain: ObservedRun, first: ObservedRun, second: ObservedRun
beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'x1-0-test-'))
  plain = runObserved({ days, observe: false })
  first = runObserved({ days, observe: true, dir: join(root, 'a') })
  second = runObserved({ days, observe: true, dir: join(root, 'b') })
}, 3 * hour)

describe('X1-0 observer on the three-engine harness', { timeout: 3 * hour }, () => {
  it('G-inert: observed and unobserved runs give identical midnight values and snapshot hashes on every day', () => {
    expect(plain.midnights).toHaveLength(days)
    expect(first.midnights).toEqual(plain.midnights)
    expect(first.hashes).toEqual(plain.hashes)
    expect(first.busPerDay).toEqual(plain.busPerDay)
    expect(first.status).toEqual({ stopped: false, readFailures: 0, missingValues: 0 })
    checks['G-inert'] = 'pass'
  })

  it('replay: two observed runs give byte-identical record files and the same manifest hashes', () => {
    for (const file of files) expect(readFileSync(join(second.dir!, file), 'utf8')).toBe(readFileSync(join(first.dir!, file), 'utf8'))
    expect(readRun(second.dir!).header).toEqual(readRun(first.dir!).header)
    expect(JSON.parse(readFileSync(join(first.dir!, 'manifest.json'), 'utf8')).hashes).toEqual(
      JSON.parse(readFileSync(join(second.dir!, 'manifest.json'), 'utf8')).hashes)
    checks.Replay = 'pass'
  })

  it('measurement: the record series equal the harness Midnight values and the goods sum identity holds', () => {
    const record = readRun(first.dir!)
    const value = (t: number, quantity: string, scope: Scope) =>
      record.series.find(o => o.t === t && o.quantity === quantity && o.scope.kind === scope.kind && o.scope.id === scope.id)?.value
    const goods = Object.keys(first.midnights[0].goods)
    for (const m of first.midnights) {
      expect(value(m.t, quantities.money, WORLD)).toBe(m.money)
      expect(value(m.t, quantities.day, WORLD)).toBe(m.settlementDay)
      for (const id of goods) for (const kind of ['total', 'produced', 'consumed'] as const) {
        expect(value(m.t, quantities[kind], goodScope(id))).toBe(m.goods[id][kind])
      }
    }
    expect(record.series.map(o => o.t)).toEqual(record.series.map(o => o.t).sort((a, b) => a - b))
    expect([...new Set(record.series.map(o => o.t))]).toEqual([0, ...first.midnights.map(m => m.t)])
    expect(first.midnights.map(m => m.t)).toEqual(midnightTimes)
    const sums = aggregateSeries(record, {
      measure: 'goods.total.sum', fn: 'sum', quantity: quantities.total, targets: [WORLD],
      membersOf: (scope) => scope.kind === 'world' ? goods.map(goodScope) : [],
    })
    expect(sums).toHaveLength(days + 1)
    expect(sums.every(a => a.value !== null)).toBe(true)
    expect(sumIdentity(sums, record)).toEqual([])
    expect(record.snapshots.map(s => s.t)).toEqual([0, ...midnightTimes])
    expect(record.snapshots.slice(1).map(s => s.participants)).toEqual(first.hashes)
    checks.Measurement = 'pass'
  })

  it('G-unread: the kernel check passes on History kernel.json and fails a fixture economy that reads history.record', () => {
    const registry: RegistryData = {
      mechanisms: ['history.record.backend', 'economy.market.clear'].map(id => ({ id, kind: 'mechanism', status: 'built' })),
      quantities: [{ id: 'history.record', kind: 'record', unit: null, writer: 'history.record.backend' }],
    }
    const load = (file: string, label: string) =>
      ({ file: label, ...JSON.parse(readFileSync(file, 'utf8')) }) as Declaration
    const own = load(join(import.meta.dirname, '..', 'kernel.json'), 'kernel.json')
    expect(own.engine).toBe('history')
    expect(checkRegistry(registry, [own])).toEqual([])
    const bad = load(join(import.meta.dirname, 'fixtures', 'economy-reads-history.kernel.json'), 'fixture')
    expect(bad.engine).toBe('economy')
    const failures = checkRegistry(registry, [own, bad])
    expect(failures.some(line => line.includes('only History may read history.*'))).toBe(true)
    checks['G-unread'] = 'pass'
  })

  afterAll(() => {
    if (!first) return // A setup failure has no completed observed run to report.
    const perDay = first.busPerDay
    const mean = perDay.reduce((a, b) => a + b, 0) / perDay.length
    const projected = Math.round(mean * 730)
    const line = `Bus records per simulated day: ${perDay.join(', ')}`
    const text = [
      '# S0 report: X1-0 observer on the three-engine harness', '',
      `Run: ${days} simulated days, observed (kernel-harness composition, 1 s realism step).`, '',
      ...Object.entries(checks).map(([name, result]) => `${name}: ${result}`), '',
      line, '',
      `Wall time of the ${days}-day observed run on this machine: ${(first.wallMs / 1000).toFixed(1)} s.`, '',
      `Projection to 730 days at ${mean.toFixed(1)} bus records per day: ${projected} records.`,
      projected > 1e6
        ? 'This exceeds 1e6 records: kernel N11 compaction is needed.'
        : 'This is within 1e6 records: kernel N11 compaction is not needed for this harness.', '',
    ].join('\n')
    console.log(text)
    // The wall time varies per machine; rewrite the committed report only on request.
    if (process.env.S0_WRITE_REPORT) {
      writeFileSync(reportPath, text)
      expect(readFileSync(reportPath, 'utf8')).toBe(text)
    }
  })
})
