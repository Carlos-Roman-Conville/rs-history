import { afterEach, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { canonical, fnv1a64 } from '@rex/kernel'
import { compareIdentity, openRun, readInputSeal, sealInput, sealOutput, verifySeals } from '../src/index.ts'
import type { RunIdentity } from '../src/seal.ts'
import { recordFiles } from '../src/writer.ts'
import { event, hash, header } from './fixtures.ts'

const dirs: string[] = []
function temp() { const dir = mkdtempSync(resolve('.seal-test-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
// All quantities and model identifiers below are synthetic fixtures, not empirical evidence.
const protocol = { maximum_events: 1, note: 'fixture acceptance criterion' }
const identity: RunIdentity = {
  code: [{ package: '@rex/fixture', version: '1', commit: 'fixture' }],
  model_data: ['catalogue', 'life.composition', 'reality.properties'].map(id => ({ id, content_hash: hash })),
  initial_state_hash: null, protocol_hash: fnv1a64(canonical(protocol)),
  seeds: { fixture: 1 }, external_inputs: [], scheduler_config_hash: null,
  fixtures: [{ id: 'seal-test', label: 'fixture', note: 'Synthetic run; initial state and scheduler hashes unavailable.' }],
}
function run(dir: string) {
  const input = sealInput(dir, protocol, identity)
  const writer = openRun(dir, header)
  writer.event(event); writer.close()
  return input
}
it('V3 canonical input and output seals verify a synthetic run and preserve missing values', () => {
  const dir = temp(), input = run(dir), output = sealOutput(dir)
  expect(input.hash).toBe(fnv1a64(canonical({ protocol, identity })))
  expect(input.identity.initial_state_hash).toBeNull()
  expect(output.input_seal_hash).toBe(input.hash)
  expect(Object.keys(output.hashes).sort()).toEqual([...recordFiles, 'manifest.json'].sort())
  expect(readFileSync(join(dir, 'input-seal.json'), 'utf8')).toBe(canonical(input) + '\n')
  expect(readFileSync(join(dir, 'output-seal.json'), 'utf8')).toBe(canonical(output) + '\n')
  expect(verifySeals(dir)).toBe(true)
})
it('input and output seals cannot be rewritten and input sealing must precede recording', () => {
  const dir = temp(), input = run(dir), output = sealOutput(dir)
  expect(() => sealInput(dir, protocol, identity)).toThrow('existing run')
  expect(() => sealOutput(dir)).toThrow()
  expect(readInputSeal(dir)).toEqual(input)
  expect(JSON.parse(readFileSync(join(dir, 'output-seal.json'), 'utf8'))).toEqual(output)
  const late = temp(); openRun(late, header).close()
  expect(() => sealInput(late, protocol, identity)).toThrow('existing run')
})
it('output sealing requires completion and verification rejects every edited record file and manifest', () => {
  const incomplete = temp(); sealInput(incomplete, protocol, identity); openRun(incomplete, header)
  expect(() => sealOutput(incomplete)).toThrow('manifest.json')
  for (const file of [...recordFiles, 'manifest.json']) {
    const dir = temp(); run(dir); sealOutput(dir)
    appendFileSync(join(dir, file), '\n')
    expect(() => verifySeals(dir)).toThrow('hash mismatch')
  }
})
it('V3 verification detects altered seals, missing files and protocol hash mismatches', () => {
  expect(() => sealInput(temp(), protocol, { ...identity, protocol_hash: hash })).toThrow('protocol_hash')
  for (const file of ['input-seal.json', 'output-seal.json']) {
    const dir = temp(); run(dir); sealOutput(dir)
    const seal = JSON.parse(readFileSync(join(dir, file), 'utf8')); seal.hash = hash
    writeFileSync(join(dir, file), canonical(seal))
    expect(() => verifySeals(dir)).toThrow(`${file}: hash mismatch`)
  }
  const dir = temp(); run(dir); sealOutput(dir)
  rmSync(join(dir, 'events.jsonl'))
  expect(() => verifySeals(dir)).toThrow('events.jsonl')
})
it('V3 compareIdentity names every differing field including changed model-data content', () => {
  const changed = structuredClone(identity)
  changed.code[0].commit = 'other'
  changed.model_data[1].content_hash = 'fedcba9876543210'
  changed.initial_state_hash = hash; changed.protocol_hash = hash
  changed.seeds = { fixture: 2 }; changed.external_inputs = ['forcing']
  changed.scheduler_config_hash = hash; changed.fixtures[0].note = 'changed assumption'
  expect(compareIdentity(identity, changed)).toEqual([
    'code[0].commit', 'external_inputs[0]', 'fixtures[0].note', 'initial_state_hash',
    'model_data[1].content_hash', 'protocol_hash', 'scheduler_config_hash', 'seeds.fixture',
  ])
  expect(compareIdentity(identity, structuredClone(identity))).toEqual([])
  expect(compareIdentity(identity, { ...identity, code: [] })).toEqual(['code[0]'])
})
it('V3 a verdict uses the sealed protocol despite later edits to the original file or objects', () => {
  const dir = temp(), path = join(dir, 'protocol.json')
  writeFileSync(path, canonical(protocol))
  const source = JSON.parse(readFileSync(path, 'utf8'))
  const input = sealInput(dir, source, identity)
  source.maximum_events = 0; input.protocol.maximum_events = 0
  writeFileSync(path, canonical(source))
  const writer = openRun(dir, header); writer.event(event); writer.close()
  const output = sealOutput(dir)
  const sealed = readInputSeal<typeof protocol>(dir)
  const verdict = { pass: 1 <= sealed.protocol.maximum_events, input: sealed.hash, output: output.hash }
  expect(verdict.pass).toBe(true)
  expect(1 <= JSON.parse(readFileSync(path, 'utf8')).maximum_events).toBe(false)
  expect(verifySeals(dir)).toBe(true)
})
