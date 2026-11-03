import { findings } from '../src/ensemble.ts'
import type { RunHeader, EventEntry, Observation, Aggregate, SnapshotRef, Score } from '../src/record.ts'
export const hash = '0123456789abcdef'
export const header: RunHeader = { run_id: `X1/1/${hash}`, target: 'X1', seed: 1, engines: [{ id: 'engine', package: '@rex/engine', version: '1', commit: 'abc' }], config_hash: hash, init_bundle: 'village', boundary: [{ id: 'rain', kind: 'forcing', target: 'terrain', port: 'rain', region_edge: 'region/a', schedule: [{ t: 0, value: 1, unit: 'mm' }], label: 'researched', source: 'catalogue' }], epoch: { sim_t0: 0, date: 1270, calendar_note: 'proleptic Gregorian' }, checkpoints: { period_ms: 1000, first_ms: 0 }, resolution_plan: [{ entity: 'village', mode: 'fine', from_t: 0 }], reportable: true }
export const event: EventEntry = { id: 'evt.1', t: 0, phase: 1, position: 0, sequence: 1, source: 'engine', type: 'birth', class: 'demographic', payload: { z: 1, a: 2 }, cause: 'evt.0' }
export const observation: Observation = { t: 0, quantity: 'body.alive', unit: '1', scope: { kind: 'world', id: 'world/all' }, value: 1, mode: 'fine', port: 'alive' }
export const aggregate: Aggregate = { t: 0, measure: 'population', scope: observation.scope, value: 1, unit: '1', fn: 'sum', inputs: ['evt.1'] }
export const snapshot: SnapshotRef = { t: 0, kernel_hash: hash, participants: { engine: hash } }
export const score: Score = { target: 'X1', indicator: 'I1', run_id: header.run_id, checkpoint: 0, S: 1, signed_error: 0, n_points: 5, data_label: 'researched' }
export const ensemble: Score = { ...score, run_id: 'ensemble', mean_S: 1, sd_S: 0, bias: 0, variance: 0, sign_consistency: 30, ensemble: findings([[0]], { criterion: null, method: null }) }
