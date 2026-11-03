import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonical, fnv1a64 } from '@rex/kernel'
import { recordFiles } from './writer.ts'

export type SealValue = null | boolean | number | string | SealValue[] | { [key: string]: SealValue }
export interface RunIdentity {
  code: { package: string; version: string | null; commit: string | null }[]
  /** Catalogue content, Life composition and Reality property models, identified by id. */
  model_data: { id: string; content_hash: string | null }[]
  initial_state_hash: string | null
  protocol_hash: string
  seeds: SealValue
  external_inputs: SealValue
  scheduler_config_hash: string | null
  fixtures: { id: string; label: 'fixture'; note: string }[]
}
export interface InputSeal<P = SealValue> { protocol: P; identity: RunIdentity; hash: string }
export interface OutputSeal { input_seal_hash: string; hashes: Record<string, string>; hash: string }

function writeSeal<T extends object>(dir: string, file: string, payload: T): T & { hash: string } {
  const seal = { ...payload, hash: fnv1a64(canonical(payload)) }
  // Exclusive creation preserves originals even when two callers race.
  writeFileSync(join(dir, file), canonical(seal) + '\n', { flag: 'wx' })
  return JSON.parse(canonical(seal))
}
function readSeal<T extends { hash: string }>(dir: string, file: string): T {
  const seal = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  if (!seal || typeof seal !== 'object' || Array.isArray(seal)) throw new Error(`${file}: invalid seal`)
  const { hash, ...payload } = seal
  if (hash !== fnv1a64(canonical(payload))) throw new Error(`${file}: hash mismatch`)
  return seal
}
/** Seal before openRun. The protocol is copied, never subsequently read from a plan file. */
export function sealInput<P>(dir: string, protocol: P, identity: RunIdentity): InputSeal<P> {
  if (identity.protocol_hash !== fnv1a64(canonical(protocol))) throw new Error('protocol_hash: hash mismatch')
  for (const file of [...recordFiles, 'manifest.json', 'input-seal.json', 'output-seal.json']) {
    if (existsSync(join(dir, file))) throw new Error(`refusing to overwrite or seal an existing run: ${file}`)
  }
  mkdirSync(dir, { recursive: true })
  return writeSeal(dir, 'input-seal.json', { protocol, identity })
}
/** Evaluators use this verified snapshot, not the original protocol file. */
export function readInputSeal<P = SealValue>(dir: string): InputSeal<P> {
  const seal = readSeal<InputSeal<P>>(dir, 'input-seal.json')
  if (seal.identity.protocol_hash !== fnv1a64(canonical(seal.protocol))) throw new Error('protocol_hash: hash mismatch')
  return seal
}
function outputPayload(dir: string): Omit<OutputSeal, 'hash'> {
  const input = readInputSeal(dir)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  if (manifest.input_seal_hash !== input.hash) throw new Error('manifest.json: input_seal_hash mismatch')
  // Explicit file set, sorted by filename; includes the final header and its record hashes.
  const hashes = Object.fromEntries([...recordFiles, 'manifest.json'].sort().map(file =>
    [file, fnv1a64(readFileSync(join(dir, file), 'utf8'))]))
  for (const file of recordFiles) {
    if (manifest.hashes?.[file] !== hashes[file]) throw new Error(`${file}: hash mismatch`)
  }
  return { input_seal_hash: input.hash, hashes }
}
/** Requires a closed writer (manifest present); output seals are also write-once. */
export function sealOutput(dir: string): OutputSeal {
  return writeSeal(dir, 'output-seal.json', outputPayload(dir))
}
/** Throws on missing, modified or inconsistent evidence, as readRun does. */
export function verifySeals(dir: string): true {
  const { hash: _hash, ...saved } = readSeal<OutputSeal>(dir, 'output-seal.json')
  if (canonical(saved) !== canonical(outputPayload(dir))) throw new Error('output-seal.json: hash mismatch')
  return true
}

/** Sorted leaf paths. Arrays retain declared order; insertion/removal names the affected index. */
export function compareIdentity(a: RunIdentity, b: RunIdentity): string[] {
  const differences: string[] = []
  function visit(left: unknown, right: unknown, path: string): void {
    if (left === right) return
    if (left !== undefined && right !== undefined && canonical(left) === canonical(right)) return
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object' && Array.isArray(left) === Array.isArray(right)) {
      const l = left as Record<string, unknown>, r = right as Record<string, unknown>
      for (const key of [...new Set([...Object.keys(l), ...Object.keys(r)])].sort()) {
        visit(l[key], r[key], Array.isArray(left) ? `${path}[${key}]` : path ? `${path}.${key}` : key)
      }
    } else differences.push(path)
  }
  visit(a, b, '')
  return differences.sort()
}
