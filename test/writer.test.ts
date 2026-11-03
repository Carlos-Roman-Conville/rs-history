import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, fnv1a64 } from '@rex/kernel'
import { openRun, readRun, sealInput } from '../src/index.ts'
import { recordFiles } from '../src/writer.ts'
import { header, event, observation, aggregate, snapshot } from './fixtures.ts'
const dirs: string[] = []
function temp() { const dir = mkdtempSync(join(tmpdir(), 'history-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function write(dir: string) {
  const writer = openRun(dir, header)
  writer.event(event); writer.observe(observation); writer.aggregate(aggregate); writer.snapshot(snapshot)
  return writer
}
it('V3 canonical records round-trip byte-identically and manifest is written last', () => {
  const a = temp(), b = temp()
  const writer = write(a)
  expect(existsSync(join(a, 'manifest.json'))).toBe(false)
  expect(() => readRun(a)).toThrow('manifest.json')
  writer.close()
  const run = readRun(a), other = openRun(b, run.header)
  run.events.forEach(other.event); run.series.forEach(other.observe); run.aggregates.forEach(other.aggregate); run.snapshots.forEach(other.snapshot); other.close()
  expect(run).toEqual({ header, events: [event], series: [observation], aggregates: [aggregate], snapshots: [snapshot] })
  for (const file of [...recordFiles, 'manifest.json']) expect(readFileSync(join(a, file), 'utf8')).toBe(readFileSync(join(b, file), 'utf8'))
  expect(readFileSync(join(a, 'events.jsonl'), 'utf8')).toBe(canonical(event) + '\n')
})
it('V4 event order is strictly lexicographic in t, phase, position, sequence', () => {
  const writer = openRun(temp(), header)
  writer.event({ ...event, t: 1, phase: 2, position: 3, sequence: 4 })
  for (const row of [{ t: 0, phase: 9, position: 9, sequence: 9 }, { t: 1, phase: 1, position: 9, sequence: 9 }, { t: 1, phase: 2, position: 2, sequence: 9 }, { t: 1, phase: 2, position: 3, sequence: 4 }]) expect(() => writer.event({ ...event, ...row })).toThrow('kernel order')
  writer.event({ ...event, t: 1, phase: 2, position: 3, sequence: 5 })
  writer.event({ ...event, t: 2, phase: 0, position: 0, sequence: 6 })
  writer.close()
})
it('every file is hash checked by the reader', () => {
  for (const file of recordFiles) {
    const dir = temp(); write(dir).close(); appendFileSync(join(dir, file), '\n')
    expect(() => readRun(dir)).toThrow(`${file}: hash mismatch`)
  }
})
it('fail never throws and a non-reportable run still closes', () => {
  const dir = temp(), writer = write(dir)
  expect(() => writer.fail('port unavailable')).not.toThrow()
  writer.close(); writer.close()
  expect(readRun(dir).header).toEqual({ ...header, reportable: false, non_reportable_reason: 'port unavailable' })
  expect(() => writer.observe(observation)).toThrow('closed')
})
it('validation rejects rows before append and existing runs cannot be overwritten', () => {
  const dir = temp(), writer = openRun(dir, header)
  expect(() => writer.observe({ ...observation, t: -1 })).toThrow('t:')
  expect(readFileSync(join(dir, 'series.jsonl'), 'utf8')).toBe('')
  expect(() => openRun(dir, header)).toThrow('overwrite')
  writer.close()
  expect(readRun(dir).events).toEqual([])
})
it('sealed writers carry the verified input seal hash and reject missing or mismatched seals', () => {
  const dir = temp(), protocol = { label: 'fixture' }
  const input = sealInput(dir, protocol, {
    code: [], model_data: [], initial_state_hash: null, protocol_hash: fnv1a64(canonical(protocol)),
    seeds: [1], external_inputs: [], scheduler_config_hash: null,
    fixtures: [{ id: 'writer', label: 'fixture', note: 'Synthetic writer test' }],
  })
  expect(() => openRun(dir, { ...header, input_seal_hash: '0000000000000000' })).toThrow('hash mismatch')
  expect(() => openRun(temp(), { ...header, input_seal_hash: input.hash })).toThrow('missing seal')
  expect(() => openRun(temp(), { ...header, input_seal_hash: 'invalid' })).toThrow('input_seal_hash')
  openRun(dir, header).close()
  expect(readRun(dir).header).toEqual({ ...header, input_seal_hash: input.hash })
  expect(header.input_seal_hash).toBeUndefined()
})
