import { seeds } from '../src/ensemble.ts'
import type { Protocol } from '../src/protocol.ts'

/** All numbers are synthetic fixtures, not owner tolerances. */
export function fixture(): Protocol {
  return {
    milestone: 'M1a', scenario: 'labelled synthetic household', self_feeding: true,
    arms: [
      { id: 'provisioned', owner: 'Life', configuration: { food: 2, learning: true } },
      { id: 'deprived', owner: 'Life', configuration: { food: 1, learning: true } },
    ], differences: ['food'], seeds: seeds('M1a', 10),
    streams: [{ id: 'choice/person-id', mechanism: 'choice', person_class: 'person', coupling: 'coupled', note: 'key by person id and event id' }],
    steps: [{ owner: 'Life', reference_ms: 1000, second_ms: null }],
    checks: [{ id: 'hard', owner: 'Life', needs_types: ['eat'],
      tolerance: { abs: 1, rel: 0, scale: 1, source: 'synthetic fixture' },
      margin: { value: 1, confidence: 0.95, source: 'synthetic fixture' }, sidedness: 'two' }],
    required_event_types: ['eat'], samples: [{ measure: 'energy', every_ms: 1000 }],
  }
}


