import { expect, it } from 'vitest'
import { checkRequired, requiredTypes } from '../src/requirements.ts'
import { event, header } from './fixtures.ts'

const healthy = { stopped: false, readFailures: 0, missingValues: 0 }
it('requiredTypes copies, deduplicates and sorts the explicit protocol declaration', () => {
  const protocol = { required_event_types: ['z', 'a', 'z'] }
  expect(requiredTypes(protocol)).toEqual(['a', 'z'])
  expect(protocol.required_event_types).toEqual(['z', 'a', 'z'])
  expect(requiredTypes({ required_event_types: [] })).toEqual([])
  expect(() => requiredTypes({ required_event_types: [''] })).toThrow()
  expect(() => requiredTypes({} as never)).toThrow()
})
it('V18 a required hash-only payload is insufficient even alongside a whole payload', () => {
  const { payload: _, ...identity } = event
  const report = checkRequired([event, { ...identity, id: 'hash-only', payload_hash: header.config_hash }], [event.type], healthy)
  expect(report).toEqual({ status: 'insufficient', types: [{ type: event.type, status: 'insufficient', hash_only_ids: ['hash-only'], missing: false }], gaps: [] })
})
it('V18 stopped observers and failed/missing reads never yield ready required checks', () => {
  for (const status of [{ ...healthy, stopped: true }, { ...healthy, readFailures: 1 }, { ...healthy, missingValues: 2 }]) {
    const report = checkRequired([event], [event.type], status)
    expect(report.status).toBe('insufficient')
    expect(report.types[0].status).toBe('insufficient')
    expect(report.gaps).toHaveLength(1)
  }
  expect(checkRequired([event], [event.type], { stopped: true, readFailures: 1, missingValues: 2 }).gaps).toEqual([
    { kind: 'readFailures', count: 1 }, { kind: 'missingValues', count: 2 }, { kind: 'stopped' },
  ])
})
it('only complete required evidence is ok; absent types are insufficient and unrelated hashes do not matter', () => {
  expect(checkRequired([event], [event.type], healthy).status).toBe('ok')
  expect(checkRequired([], [event.type], healthy).types[0]).toMatchObject({ status: 'insufficient', missing: true })
  expect(checkRequired([{ ...event, type: 'unrequired', payload: undefined, payload_hash: header.config_hash }], [], healthy).status).toBe('ok')
})
