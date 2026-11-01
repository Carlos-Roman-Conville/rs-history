// @rex/history: the public surface grows unit by unit (DESIGN §1, §2, §7).
import { qualify } from '@rex/kernel'
export * from './record.ts'
export { openRun, type RunWriter } from './writer.ts'
export { readRun, type RunRecord } from './reader.ts'
export * from './classes.ts'
export * from './aggregate.ts'

/** The engine prefix every History id carries. */
export const ENGINE = 'history'

/** Qualify a local id as `history/<local>`. */
export function historyId(local: string): string {
  return qualify(ENGINE, local)
}
