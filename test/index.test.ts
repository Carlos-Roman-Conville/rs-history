import { describe, expect, it } from 'vitest'
import { historyId } from '../src/index.ts'

describe('ids', () => {
  it('qualifies a local id with the history prefix', () => {
    expect(historyId('run.x1')).toBe('history/run.x1')
  })
})
