import type { EventClass, EventEntry } from './record.ts'

export interface EventClassTable { version: 1; map: { source: string; type: string; class: EventClass }[] }
export function classify(source: string, type: string, table: EventClassTable): EventClass {
  return table.map.find(row => row.source === source && row.type === type)?.class ?? 'other'
}
/** Report rows sorted lexically by source/type, independent of input order. */
export function unmapped(events: readonly EventEntry[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const event of events) if (event.class === 'other') {
    const key = `${event.source}/${event.type}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.keys()].sort().map(key => ({ key, count: counts.get(key)! }))
}
