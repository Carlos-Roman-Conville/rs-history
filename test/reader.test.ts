import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, fnv1a64 } from '@rex/kernel'
import { openRun, readRun } from '../src/index.ts'
import { header, event } from './fixtures.ts'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
it('reader validates every row even when the file hash matches', () => {
  for (const file of ['events.jsonl', 'series.jsonl', 'aggregates.jsonl', 'snapshots.jsonl']) {
    const dir = mkdtempSync(join(tmpdir(), 'history-reader-')); dirs.push(dir)
    openRun(dir, header).close()
    const text = '{}\n'
    writeFileSync(join(dir, file), text)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    manifest.hashes[file] = fnv1a64(text)
    writeFileSync(join(dir, 'manifest.json'), canonical(manifest))
    expect(() => readRun(dir)).toThrow(`${file}:1`)
  }
})
it('reader rejects duplicate kernel positions even with valid rows and hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'history-reader-')); dirs.push(dir)
  openRun(dir, header).close()
  const text = `${canonical(event)}\n`.repeat(2)
  writeFileSync(join(dir, 'events.jsonl'), text)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  manifest.hashes['events.jsonl'] = fnv1a64(text)
  writeFileSync(join(dir, 'manifest.json'), canonical(manifest))
  expect(() => readRun(dir)).toThrow('kernel order')
})
