// @rex/history: the public surface grows unit by unit (DESIGN §1, §2, §7).
import { qualify } from '@rex/kernel'

/** The engine prefix every History id carries. */
export const ENGINE = 'history'

/** Qualify a local id as `history/<local>`. */
export function historyId(local: string): string {
  return qualify(ENGINE, local)
}
