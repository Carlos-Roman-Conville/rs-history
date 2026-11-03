// @rex/history: the public surface grows unit by unit (DESIGN §1, §2, §7).
import { qualify } from '@rex/kernel'
export * from './record.ts'
export * from './seal.ts'
export * from './protocol.ts'
export * from './verdict.ts'
export * from './checks/accounting.ts'
export * from './checks/trace.ts'
export { openRun, type RunWriter } from './writer.ts'
export { readRun, type RunRecord } from './reader.ts'
export * from './classes.ts'
export * from './observer.ts'
export * from './requirements.ts'
export * from './aggregate.ts'
export * from './dataset.ts'
export * from './scores.ts'
export * from './ensemble.ts'
export * as x1 from './x1/index.ts'

/** The engine prefix every History id carries. */
export const ENGINE = 'history'

/** Qualify a local id as `history/<local>`. */
export function historyId(local: string): string {
  return qualify(ENGINE, local)
}
export * from './checks/step.ts'
export * from './checks/rg5.ts'
