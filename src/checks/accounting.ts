import { compareEvents } from '../record.ts'
import type { EventEntry } from '../record.ts'
import type { ProtocolCheck } from '../protocol.ts'
import { combineChecks } from '../verdict.ts'
import type { CheckStatus, Finding } from '../verdict.ts'

/** Named rules are explicit protocol choices, never defaults. The max rule is
 * PLAN §3.7's proposed scale; current means |closing balance|. Unknown rules
 * are insufficient. Numeric scales retain the existing ProtocolCheck contract.
 * The pinned Kernel does not yet export the shared tolerance pass function.
 */
export type AccountingTolerance = NonNullable<ProtocolCheck['tolerance']>
export interface AccountingAccount {
  account: string; quantity: string; unit: string; owner: string
  kind: 'continuous' | 'count'; tolerance: AccountingTolerance | null
}
export interface AccountBalance {
  id: string; t: number; account: string; quantity: string; unit: string; value: number | null
}
export interface AccountingLeg { id: string; from: string; to: string; quantity: string; unit: string; amount: number }
export interface AccountingTransaction {
  id: string; t: number; status: 'committed' | 'rolled_back'; legs: readonly AccountingLeg[]
}
/** Owner evidence specific to a leg, not a whole checkpoint difference that
 * could include concurrent activity. source is the writer, not the journal's
 * event producer. Null before/after means unavailable, never a zero balance.
 */
export interface AccountChange {
  id: string; t: number; transaction_id: string | null; leg_id: string | null
  account: string; quantity: string; unit: string; source: string | null
  before: number | null; after: number | null
}
export interface AccountingInput {
  interval: { t0: number; t1: number }
  accounts: readonly AccountingAccount[]
  transactions: readonly AccountingTransaction[]
  events: readonly EventEntry[]
  balances: readonly AccountBalance[]
  changes: readonly AccountChange[]
  /** Caller attests complete journal, transaction and writer capture over
   * (t0,t1], plus endpoint observations. A gap/stopped observer sets false.
   * Evidence ids identify that capture declaration, not fabricated events.
   */
  coverage: { complete: boolean; evidence: readonly string[] }
}
export interface AccountingCheck extends Finding {
  id: string; reason: string
  account?: string; quantity?: string; unit?: string
  residual?: number | null; scale?: number | null; limit?: number | null
}
export interface AccountingSection extends Finding { checks: AccountingCheck[] }
export interface AccountingReport extends Finding {
  transactions: AccountingSection; interval: AccountingSection; writers: AccountingSection
}
const key = (...parts: string[]) => JSON.stringify(parts)
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const sorted = (ids: readonly string[]) => [...new Set(ids)].sort()
function sum(values: readonly number[]): number {
  let total = 0, correction = 0
  for (const value of values) {
    const next = total + value
    correction += Math.abs(total) >= Math.abs(value) ? (total - next) + value : (value - next) + total
    total = next
  }
  return total + correction
}
function comparison(account: AccountingAccount, before: number | null, after: number | null, deltas: number[]) {
  const missing = { status: 'insufficient' as const, residual: null, scale: null, limit: null }
  if (!finite(before) || !finite(after) || !deltas.every(finite)) return { ...missing, reason: 'missing or non-finite observation' }
  const tol = account.tolerance
  if (!tol || !finite(tol.abs) || tol.abs < 0 || !finite(tol.rel) || tol.rel < 0 || !tol.source.trim()) {
    return { ...missing, reason: 'missing or invalid owner tolerance/source' }
  }
  const volume = sum(deltas.map(Math.abs))
  const scale = typeof tol.scale === 'number' ? tol.scale
    : tol.scale === 'max_open_close_volume' ? Math.max(Math.abs(before), Math.abs(after), volume)
      : tol.scale === 'current' ? Math.abs(after) : null
  if (scale === null || !finite(scale) || scale < 0) return { ...missing, reason: 'missing, unsupported or non-finite scale' }
  let residual: number, pass: boolean
  const limit = account.kind === 'count' ? 0 : tol.abs + tol.rel * scale
  if (!finite(limit)) return { ...missing, reason: 'non-finite tolerance limit' }
  if (account.kind === 'count') {
    if (![before, after, ...deltas].every(Number.isSafeInteger)) return { ...missing, reason: 'counts require safe integer observations and deltas' }
    const exact = BigInt(after) - BigInt(before) - deltas.reduce((s, d) => s + BigInt(d), 0n)
    residual = Number(exact); pass = exact === 0n
  } else {
    residual = sum([after, -before, ...deltas.map(d => -d)])
    if (!finite(residual)) return { ...missing, reason: 'non-finite residual' }
    pass = Math.abs(residual) <= limit
  }
  return { status: pass ? 'pass' as const : 'fail' as const, residual, scale, limit, reason: pass ? 'balance agrees' : 'balance disagrees' }
}
function section(checks: AccountingCheck[]): AccountingSection {
  // Stable diagnostic order independent of caller array order.
  checks.sort((a, b) => order(a.id, b.id) || order(a.reason, b.reason))
  return { ...combineChecks(checks), checks }
}
interface JournalLeg extends AccountingLeg { t: number }
function payload(event: EventEntry): JournalLeg | null {
  const p = event.payload as Partial<JournalLeg> | null | undefined
  if (!p || typeof p !== 'object' || !finite(p.t) || p.t !== event.t || !finite(p.amount) || p.amount <= 0
    || ![p.from, p.to, p.quantity, p.unit].every(s => typeof s === 'string' && s.trim()) || p.from === p.to) return null
  return { id: event.leg_id ?? '', t: p.t, amount: p.amount, from: p.from!, to: p.to!, quantity: p.quantity!, unit: p.unit! }
}

/** PLAN §3.7 / V14: pure post-run comparisons, no ledger and no engine writes.
 * All three sections are required; known failures dominate missing evidence.
 * Inputs name native account/quantity/unit explicitly; no conversions inferred.
 */
export function checkAccounting(input: AccountingInput): AccountingReport {
  const { t0, t1 } = input.interval
  if (!finite(t0) || !finite(t1) || t0 >= t1) throw new Error('accounting interval requires finite t0 < t1')
  const inside = (t: number) => t > t0 && t <= t1
  const coverage: AccountingCheck = { id: 'coverage', status: input.coverage.complete && input.coverage.evidence.length
    && input.coverage.evidence.every(id => id.trim()) ? 'pass' : 'insufficient',
    evidence: sorted(input.coverage.evidence), reason: 'capture completeness declaration' }
  const txChecks: AccountingCheck[] = [{ ...coverage }], intervalChecks: AccountingCheck[] = [{ ...coverage }], writerChecks: AccountingCheck[] = [{ ...coverage }]
  const add = (rows: AccountingCheck[], id: string, status: CheckStatus, reason: string, evidence: string[]) => rows.push({ id, status, reason, evidence: sorted(evidence) })
  const accounts = new Map<string, AccountingAccount>()
  for (const account of input.accounts) {
    const id = key(account.account, account.quantity)
    if (accounts.has(id)) throw new Error(`duplicate account declaration: ${id}`)
    accounts.set(id, account)
  }
  if (!accounts.size) add(intervalChecks, 'accounts', 'insufficient', 'no accounts declared', input.coverage.evidence.slice())
  const transactions = input.transactions.filter(t => inside(t.t)).slice().sort((a, b) => order(a.id, b.id))
  const declarations = new Map<string, { transaction: AccountingTransaction; leg: AccountingLeg }>()
  const seen = new Set<string>()
  for (const transaction of transactions) {
    if (seen.has(transaction.id)) throw new Error(`duplicate transaction declaration: ${transaction.id}`)
    seen.add(transaction.id)
    for (const leg of transaction.legs) {
      const id = key(transaction.id, leg.id)
      if (declarations.has(id)) throw new Error(`duplicate leg declaration: ${id}`)
      declarations.set(id, { transaction, leg })
    }
  }
  const events = input.events.filter(e => e.type === 'kernel.transfer' && inside(e.t)).slice()
    .sort((a, b) => compareEvents(a, b) || order(a.id, b.id))
  const groups = new Map<string, EventEntry[]>()
  const journal: { event: EventEntry; leg: JournalLeg }[] = []
  let readable = true, identifiable = true
  for (const event of events) {
    const id = key(event.transaction_id ?? '', event.leg_id ?? '')
    groups.set(id, [...(groups.get(id) ?? []), event])
    if (!event.transaction_id || !event.leg_id) {
      identifiable = false
      add(txChecks, `identity:${event.id}`, 'insufficient', 'missing transaction or leg identity', [event.id])
    }
    else if (!declarations.has(id)) add(txChecks, `unexpected:${event.id}`, 'fail', 'undeclared transaction or leg', [event.id])
    const leg = payload(event)
    if (!leg) {
      readable = false
      add(txChecks, `payload:${event.id}`, 'insufficient', 'missing or invalid transfer payload', [event.id])
    } else journal.push({ event, leg })
  }
  const changes = input.changes.filter(c => inside(c.t)).slice().sort((a, b) => order(a.id, b.id))
  for (const change of changes) {
    const account = accounts.get(key(change.account, change.quantity))
    add(writerChecks, `writer:${change.id}`, !account?.owner.trim() || !change.source?.trim() ? 'insufficient'
      : change.source === account.owner ? 'pass' : 'fail', !account ? 'undeclared account owner'
        : !change.source?.trim() ? 'missing writer evidence' : change.source === account.owner ? 'declared owner wrote account' : 'undeclared writer', [change.id])
    const declared = declarations.get(key(change.transaction_id ?? '', change.leg_id ?? ''))
    if (!declared || declared.transaction.status === 'rolled_back') {
      add(txChecks, `change:${change.id}`, 'fail', 'account change without a committed declared leg', [change.id])
    } else if (![declared.leg.from, declared.leg.to].includes(change.account) || change.quantity !== declared.leg.quantity || change.t !== declared.transaction.t) {
      add(txChecks, `change:${change.id}`, 'fail', 'account change does not match its declared leg', [change.id])
    }
  }
  for (const [id, { transaction, leg }] of declarations) {
    const entries = groups.get(id) ?? [], evidence = [transaction.id, ...entries.map(e => e.id)]
    const expected = transaction.status === 'committed' ? 1 : 0
    const countStatus = entries.length === expected ? 'pass'
      : entries.length < expected && (!identifiable || coverage.status !== 'pass') ? 'insufficient' : 'fail'
    add(txChecks, `entries:${id}`, countStatus, `expected ${expected} journal entries, observed ${entries.length}`, evidence)
    if (transaction.status === 'rolled_back') continue
    if (!finite(leg.amount) || leg.amount <= 0 || leg.from === leg.to) {
      add(txChecks, `declaration:${id}`, 'insufficient', 'invalid declared leg', evidence); continue
    }
    for (const event of entries) {
      const p = payload(event)
      if (p) add(txChecks, `agreement:${id}:${event.id}`, p.t === transaction.t && p.from === leg.from && p.to === leg.to
        && p.quantity === leg.quantity && p.unit === leg.unit && p.amount === leg.amount ? 'pass' : 'fail', 'journal versus declared leg', evidence)
    }
    for (const [endpoint, sign] of [[leg.from, -1], [leg.to, 1]] as const) {
      const account = accounts.get(key(endpoint, leg.quantity))
      const observed = changes.filter(c => c.transaction_id === transaction.id && c.leg_id === leg.id && c.account === endpoint && c.quantity === leg.quantity)
      const rowId = `commit:${id}:${key(endpoint, leg.quantity)}`
      const refs = sorted([...evidence, ...observed.map(c => c.id)])
      if (!account || observed.length !== 1) {
        add(txChecks, rowId, observed.length > 1 ? 'fail' : 'insufficient', 'require declared account and exactly one owner change observation', refs); continue
      }
      const change = observed[0]
      if (change.unit !== account.unit || leg.unit !== account.unit) {
        add(txChecks, rowId, 'fail', 'incompatible units', refs); continue
      }
      txChecks.push({ id: rowId, account: endpoint, quantity: leg.quantity, unit: account.unit, evidence: refs,
        ...comparison(account, change.before, change.after, [sign * leg.amount]) })
    }
  }
  for (const [id, account] of accounts) {
    const balances = input.balances.filter(b => b.account === account.account && b.quantity === account.quantity)
    const opening = balances.filter(b => b.t === t0), closing = balances.filter(b => b.t === t1)
    const entries = journal.filter(({ leg }) => leg.quantity === account.quantity && [leg.from, leg.to].includes(account.account))
    const refs = sorted([...opening, ...closing].map(b => b.id).concat(entries.map(e => e.event.id)))
    if (!readable || opening.length !== 1 || closing.length !== 1) {
      add(intervalChecks, id, 'insufficient', 'require readable journal and unique interval endpoints', refs); continue
    }
    if ([...opening, ...closing].some(b => b.unit !== account.unit) || entries.some(e => e.leg.unit !== account.unit)) {
      add(intervalChecks, id, 'fail', 'incompatible units', refs); continue
    }
    const deltas = entries.map(({ leg }) => leg.amount * (leg.from === account.account ? -1 : 1))
    intervalChecks.push({ id, account: account.account, quantity: account.quantity, unit: account.unit, evidence: refs,
      ...comparison(account, opening[0].value, closing[0].value, deltas) })
  }
  const tx = section(txChecks), interval = section(intervalChecks), writers = section(writerChecks)
  return { ...combineChecks([tx, interval, writers]), transactions: tx, interval, writers }
}
