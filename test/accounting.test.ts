import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkAccounting } from '../src/checks/accounting.ts'
import type { AccountingAccount, AccountingInput, AccountingTransaction, AccountChange } from '../src/checks/accounting.ts'
import type { EventEntry, Observation, RunHeader } from '../src/record.ts'
import { a1MassCloses } from '../src/x1/acceptance.ts'
import type { MassStores } from '../src/x1/acceptance.ts'
import { DAY_MS } from '../src/x1/config.ts'

interface Fixture { case: string; expected: string; header: RunHeader; events: EventEntry[]; observations: Observation[] }
const root = join(import.meta.dirname, 'fixtures/synthetic/accounting')
const fixtures: Fixture[] = readdirSync(root).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(readFileSync(join(root, f), 'utf8')) as Fixture)
const fixture = (name: string) => fixtures.find(f => f.case === name)!
const tolerance = { abs: 0, rel: 0, scale: 'max_open_close_volume', source: 'fixture: exact synthetic kg' }
const account = (name: string, owner = 'economy'): AccountingAccount => ({ account: name, quantity: 'mass', unit: 'kg', owner, kind: 'continuous', tolerance: { ...tolerance } })
const debit = 'economy/household', credit = 'life/gut'
const transaction = (id = 'transaction/fixture-1', legId = 'leg/fixture-1', t = 1000): AccountingTransaction => ({
  id, t, status: 'committed', legs: [{ id: legId, from: debit, to: credit, quantity: 'mass', unit: 'kg', amount: 1 }],
})
const balance = (account: string, t: number, value: number | null) => ({ id: `fixture:balance:${account}:${t}`, account, t, value, quantity: 'mass', unit: 'kg' })
const change = (tx: AccountingTransaction, account: string, before: number, after: number, source: string): AccountChange => ({
  id: `fixture:change:${tx.id}:${account}`, t: tx.t, transaction_id: tx.id, leg_id: tx.legs[0].id,
  account, quantity: 'mass', unit: 'kg', before, after, source,
})

/** Fixture-only declarations, never production fallbacks. The read-only JSON
 * lacks tolerances, owner/writer metadata, declared legs, opening gut samples,
 * and (in the two-transaction case) the intermediate gut sample. We explicitly
 * supply exact kg, inventory=2/gut=0, and gut=1 after its first +1 transfer.
 * Only the undeclared-writer scenario labels the debit writer host/resolver;
 * an event producer alone is NOT evidence of the writer of both accounts.
 */
function inputFor(f: Fixture): AccountingInput {
  const input: AccountingInput = { interval: { t0: 0, t1: 1000 }, accounts: [], transactions: [], events: structuredClone(f.events),
    balances: [], changes: [], coverage: { complete: true, evidence: [`fixture:${f.case}:capture-and-declarations`] } }
  if (f.case === 'world-total-balances') {
    input.accounts = ['region/fixture-a', 'region/fixture-b'].map(a => account(a))
    input.balances = f.observations.map((o, i) => ({ ...balance(o.scope.id, o.t, o.value as number), id: `fixture:observation:${i}` }))
    return input
  }
  if (f.case === 'equal-opposite-no-entries') {
    // The JSON has intermediate person samples and separate world endpoints,
    // not person endpoints or transaction metadata. Explicit fixture extension:
    // persons each open/close at 2, transfer 1 at 500 then return it at 750.
    const a = 'person/fixture-a', b = 'person/fixture-b'
    const first = transaction('fixture:out', 'leg/shared', 500), second = transaction('fixture:return', 'leg/shared', 750)
    first.legs = [{ ...first.legs[0], from: a, to: b }]
    second.legs = [{ ...second.legs[0], from: b, to: a }]
    const middle = (id: string) => f.observations.find(o => o.scope.id === id)!.value as number
    input.accounts = [account(a), account(b)]
    input.transactions = [first, second]
    input.balances = [balance(a, 0, 2), balance(a, 1000, 2), balance(b, 0, 2), balance(b, 1000, 2)]
    input.changes = [change(first, a, 2, middle(a), 'economy'), change(first, b, 2, middle(b), 'economy'),
      change(second, a, middle(a), 2, 'economy'), change(second, b, middle(b), 2, 'economy')]
    return input
  }
  const two = f.case === 'two-legitimate-transactions'
  input.interval.t1 = two ? 2000 : 1000
  const opening = f.observations.find(o => o.t === 0 && o.quantity === 'economy.inventory')?.value as number | undefined ?? 2
  const closing = (q: string, t: number) => f.observations.find(o => o.t === t && o.quantity === q)?.value as number | undefined
  const endDebit = closing('economy.inventory', input.interval.t1)!, endCredit = closing('life.gut.mass', input.interval.t1) ?? null
  input.accounts = [account(debit), account(credit, 'life')]
  input.balances = [balance(debit, 0, opening), balance(debit, input.interval.t1, endDebit), balance(credit, 0, 0), balance(credit, input.interval.t1, endCredit)]
  if (f.case === 'account-change-no-entry') {
    input.accounts = [account(debit)]
    input.balances = input.balances.filter(b => b.account === debit)
    input.changes = [{ ...change(transaction(), debit, opening, endDebit, 'economy'), transaction_id: null, leg_id: null }]
    return input
  }
  const txs = two ? [transaction('transaction/fixture-a', 'leg/a', 1000), transaction('transaction/fixture-b', 'leg/b', 2000)] : [transaction()]
  input.transactions = txs
  input.changes = txs.flatMap((tx, i) => [change(tx, debit, i === 0 ? opening : closing('economy.inventory', 1000)!, closing('economy.inventory', tx.t)!,
    f.case === 'undeclared-writer' ? 'host/resolver' : 'economy'),
  { ...change(tx, credit, i, two && i === 0 ? 1 : endCredit!, 'life'), after: two && i === 0 ? 1 : endCredit }])
  return input
}
const clean = () => inputFor(fixture('clean-transaction'))

describe('PLAN §3.7 / V14 accounting', () => {
  for (const f of fixtures) it(`matches expected for ${f.case}`, () => {
    expect(checkAccounting(inputFor(f)).status).toBe(f.expected)
  })

  it('catches cancelling unjournaled legs per transaction while the interval residual passes', () => {
    const result = checkAccounting(inputFor(fixture('equal-opposite-no-entries')))
    expect(result.transactions.status).toBe('fail')
    expect(result.transactions.checks.filter(c => c.id.startsWith('entries:')).every(c => c.status === 'fail')).toBe(true)
    expect(result.interval.status).toBe('pass')
    expect(result.interval.checks.filter(c => c.account).map(c => c.residual)).toEqual([0, 0])
  })

  it('keeps X1 A1 world totals as a passing backstop while each store residual fails', () => {
    const f = fixture('world-total-balances'), input = inputFor(f)
    const result = checkAccounting(input)
    expect(result.interval.status).toBe('fail')
    expect(result.interval.checks.filter(c => c.account).map(c => c.residual)).toEqual([1, -1])
    // A1 requires four stores and daily checkpoints. Map the two fixture stores
    // to inventory/bodies, add explicitly empty fixture soil/plant and zero flows.
    const names = ['soil', 'plant', 'inventory', 'bodies'] as const
    const stores = {} as MassStores['mass'], series: Observation[] = []
    names.forEach((name, i) => {
      const scope = { kind: 'region' as const, id: `fixture:${name}` }
      stores[name] = { stock: { quantity: `${name}.stock`, scope }, inflow: { quantity: `${name}.in`, scope }, outflow: { quantity: `${name}.out`, scope } }
      const rows = i < 2 ? [] : f.observations.filter(o => o.scope.id === `region/fixture-${i === 2 ? 'a' : 'b'}`)
      for (const t of [0, DAY_MS]) series.push({ t, quantity: `${name}.stock`, scope, unit: 'kg', port: 'fixture', mode: 'fine',
        value: i < 2 ? 0 : rows.find(o => o.t === (t === 0 ? 0 : 1000))!.value })
      for (const flow of ['in', 'out']) series.push({ t: DAY_MS, quantity: `${name}.${flow}`, scope, unit: 'kg', port: 'fixture', mode: 'fine', value: 0 })
    })
    const a1 = a1MassCloses({ header: f.header, events: [], series, aggregates: [], snapshots: [] }, { mass: stores }, 0)
    expect(a1.pass).toBe(true)
    expect(a1.detail.balances[0].residual).toBe(0)
  })

  it('judges exactly once by transaction and leg, allowing one intention and reused leg names', () => {
    const input = inputFor(fixture('two-legitimate-transactions'))
    input.transactions = input.transactions.map(t => ({ ...t, legs: t.legs.map(l => ({ ...l, id: 'same-leg' })) }))
    input.events = input.events.map(e => ({ ...e, leg_id: 'same-leg' }))
    input.changes = input.changes.map(c => ({ ...c, leg_id: 'same-leg' }))
    expect(checkAccounting(input).status).toBe('pass')
  })

  it('checks every declared leg and detects an undeclared extra entry', () => {
    const input = clean()
    input.transactions = [{ ...input.transactions[0], legs: [...input.transactions[0].legs, { ...input.transactions[0].legs[0], id: 'missing-leg' }] }]
    expect(checkAccounting(input).transactions.checks.find(c => c.id.startsWith('entries:') && c.id.includes('missing-leg'))?.status).toBe('fail')
    input.transactions = [transaction()]
    input.events = [...input.events, { ...input.events[0], id: 'extra', leg_id: 'undeclared' }]
    expect(checkAccounting(input).transactions.checks.find(c => c.id === 'unexpected:extra')?.status).toBe('fail')
  })

  it('allows rollback only with no journal entries or committed owner changes', () => {
    const input = clean()
    input.transactions = [{ ...transaction(), status: 'rolled_back' }]
    input.events = []; input.changes = []
    input.balances = [balance(debit, 0, 2), balance(debit, 1000, 2), balance(credit, 0, 0), balance(credit, 1000, 0)]
    expect(checkAccounting(input).status).toBe('pass')
    input.events = clean().events
    expect(checkAccounting(input).transactions.status).toBe('fail')
    input.events = []; input.changes = clean().changes
    expect(checkAccounting(input).transactions.status).toBe('fail')
  })

  it('identifies debit, credit and journal faults in the commit check independently', () => {
    for (const [name, prefix] of [['fault-debit', 'commit:'], ['fault-credit', 'commit:'], ['fault-journal', 'agreement:']]) {
      const result = checkAccounting(inputFor(fixture(name)))
      expect(result.transactions.checks.some(c => c.id.startsWith(prefix) && c.status === 'fail'), name).toBe(true)
    }
  })

  it('checks the owner of an actual write independently of the event producer', () => {
    const input = clean()
    input.events = input.events.map(e => ({ ...e, source: 'host/resolver' }))
    expect(checkAccounting(input).status).toBe('pass')
    input.changes = input.changes.map(c => c.account === debit ? { ...c, source: 'intruder' } : c)
    const result = checkAccounting(input)
    expect(result.writers.status).toBe('fail')
    expect(result.transactions.status).toBe('pass')
    expect(result.interval.status).toBe('pass')
  })

  it('does not invent missing tolerances, endpoints, commit observations or writer evidence', () => {
    const noTolerance = clean()
    noTolerance.accounts = noTolerance.accounts.map(a => ({ ...a, tolerance: null }))
    expect(checkAccounting(noTolerance).status).toBe('insufficient')
    const noOpening = clean(); noOpening.balances = noOpening.balances.filter(b => b.t > 0)
    expect(checkAccounting(noOpening).interval.status).toBe('insufficient')
    const noChange = clean(); noChange.changes = []
    expect(checkAccounting(noChange).transactions.status).toBe('insufficient')
    const noWriter = clean(); noWriter.changes = noWriter.changes.map(c => ({ ...c, source: null }))
    expect(checkAccounting(noWriter).writers.status).toBe('insufficient')
  })

  it('reports missing payloads, identities and incomplete capture as insufficient', () => {
    const input = clean(), original = input.events[0]
    const { payload: _payload, ...rest } = original
    input.events = [{ ...rest, payload_hash: '0123456789abcdef' }]
    expect(checkAccounting(input).status).toBe('insufficient')
    input.events = [{ ...original, transaction_id: undefined }]
    expect(checkAccounting(input).status).toBe('insufficient')
    expect(checkAccounting(input).transactions.checks.find(c => c.id.startsWith('identity:'))?.status).toBe('insufficient')
    input.events = [original]; input.coverage.complete = false
    expect(checkAccounting(input).status).toBe('insufficient')
  })

  it('uses abs + rel × declared scale inclusively, never a hidden threshold', () => {
    const input = clean()
    input.accounts = [account(debit)]
    input.events = []; input.transactions = []; input.changes = []
    input.balances = [balance(debit, 0, 10), balance(debit, 1000, 12)]
    input.accounts[0].tolerance = { ...tolerance, abs: 0.5, rel: 0.125, scale: 'max_open_close_volume' }
    let result = checkAccounting(input).interval
    expect(result.status).toBe('pass')
    expect(result.checks.find(c => c.account)).toMatchObject({ residual: 2, scale: 12, limit: 2 })
    input.accounts[0].tolerance.abs = 0.25
    expect(checkAccounting(input).interval.status).toBe('fail')
    input.accounts[0].tolerance = { ...tolerance, rel: 0.25, scale: 8 }
    expect(checkAccounting(input).interval.status).toBe('pass')
    input.accounts[0].tolerance.scale = 'unknown-owner-rule'
    expect(checkAccounting(input).interval.status).toBe('insufficient')
  })

  it('accumulates absolute volume per leg even when transfers cancel', () => {
    const input = clean()
    input.accounts = [account(debit)]
    input.accounts[0].tolerance = { ...tolerance, rel: 0.25 }
    input.events = [input.events[0], { ...input.events[0], id: 'reverse', transaction_id: 'reverse', payload_hash: undefined, payload: {
      t: 1000, from: credit, to: debit, amount: 1, quantity: 'mass', unit: 'kg',
    } }]
    input.balances = [balance(debit, 0, 0), balance(debit, 1000, 0.5)]
    const row = checkAccounting(input).interval.checks.find(c => c.account)!
    expect(row).toMatchObject({ residual: 0.5, scale: 2, limit: 0.5, status: 'pass' })
    input.accounts[0].tolerance.scale = 'current'
    expect(checkAccounting(input).interval.checks.find(c => c.account)).toMatchObject({ scale: 0.5, limit: 0.125, status: 'fail' })
  })

  it('counts use exact equality even with a generous continuous tolerance', () => {
    const input = clean()
    input.accounts = [{ ...account(debit), kind: 'count', tolerance: { ...tolerance, abs: 100 } }]
    input.transactions = []; input.events = []; input.changes = []
    input.balances = [balance(debit, 0, 10), balance(debit, 1000, 11)]
    expect(checkAccounting(input).interval.checks.find(c => c.account)).toMatchObject({ residual: 1, limit: 0, status: 'fail' })
    input.balances = [balance(debit, 0, 10), balance(debit, 1000, 10)]
    expect(checkAccounting(input).status).toBe('pass')
    input.balances = [balance(debit, 0, 10), balance(debit, 1000, 10.5)]
    expect(checkAccounting(input).status).toBe('insufficient')
  })

  it('preserves small residuals across large cancelling journal entries', () => {
    for (const kind of ['continuous', 'count'] as const) {
      const input = clean(), large = kind === 'count' ? Number.MAX_SAFE_INTEGER : 1e16
      input.accounts = [{ ...account(debit), kind }]
      input.events = [large, 1, large].map((amount, i) => ({ ...input.events[0], id: `entry:${i}`, sequence: i,
        transaction_id: `transaction:${i}`, payload_hash: undefined, payload: {
          t: 1000, quantity: 'mass', unit: 'kg', amount, from: i === 2 ? credit : debit, to: i === 2 ? debit : credit,
        } }))
      input.balances = [balance(debit, 0, 2), balance(debit, 1000, 1)]
      expect(checkAccounting(input).interval.status).toBe('pass')
      input.balances = [balance(debit, 0, 2), balance(debit, 1000, 2)]
      expect(checkAccounting(input).interval.checks.find(c => c.account)).toMatchObject({ residual: 1, status: 'fail' })
    }
  })

  it('checks multiple legitimate legs in one transaction separately', () => {
    const input = inputFor(fixture('two-legitimate-transactions'))
    const first = input.transactions[0], second = input.transactions[1]
    input.transactions = [{ ...first, legs: [...first.legs, ...second.legs] }]
    input.events = input.events.map(e => ({ ...e, t: 1000, transaction_id: first.id,
      payload_hash: undefined, payload: { ...(e.payload as object), t: 1000 } }))
    input.changes = input.changes.map(c => ({ ...c, t: 1000, transaction_id: first.id }))
    expect(checkAccounting(input).status).toBe('pass')
    input.changes = input.changes.filter(c => !(c.leg_id === second.legs[0].id && c.account === credit))
    expect(checkAccounting(input).transactions.status).toBe('insufficient')
  })

  it('never treats non-finite values, duplicate endpoints or unknown scales as passing evidence', () => {
    const input = clean()
    input.balances = [...input.balances, input.balances[0]]
    expect(checkAccounting(input).interval.status).toBe('insufficient')
    input.balances = clean().balances.map(b => ({ ...b, value: NaN }))
    expect(checkAccounting(input).interval.status).toBe('insufficient')
    input.balances = clean().balances
    input.accounts = input.accounts.map(a => ({ ...a, tolerance: { ...tolerance, scale: 'span' } }))
    expect(checkAccounting(input).status).toBe('insufficient')
  })

  it('isolates quantities and rejects incompatible units', () => {
    const input = clean()
    input.accounts = [...input.accounts, { ...account(debit), quantity: 'water' }]
    input.balances = [...input.balances, { ...balance(debit, 0, 1), id: 'water-open', quantity: 'water' },
      { ...balance(debit, 1000, 2), id: 'water-close', quantity: 'water' }]
    const water = checkAccounting(input).interval.checks.find(c => c.quantity === 'water')!
    expect(water).toMatchObject({ residual: 1, status: 'fail' })
    const wrongUnit = clean(); wrongUnit.balances = wrongUnit.balances.map(b => ({ ...b, unit: 'g' }))
    expect(checkAccounting(wrongUnit).interval.status).toBe('fail')
  })

  it('uses (t0,t1] and does not include transfers or writers outside the interval', () => {
    const input = clean()
    input.events = [...input.events, ...[0, 1001].map(t => ({ ...input.events[0], id: `outside:${t}`, t, payload_hash: undefined, payload: null }))]
    input.changes = [...input.changes, { ...input.changes[0], t: 1001, source: 'intruder' }]
    expect(checkAccounting(input).status).toBe('pass')
  })

  it('allows simultaneous legitimate transactions with independent per-leg observations', () => {
    const input = inputFor(fixture('two-legitimate-transactions'))
    input.transactions = input.transactions.map(t => ({ ...t, t: 1000 }))
    input.events = input.events.map(e => ({ ...e, t: 1000, payload_hash: undefined, payload: { ...(e.payload as object), t: 1000 } }))
    input.changes = input.changes.map(c => ({ ...c, t: 1000 }))
    expect(checkAccounting(input).status).toBe('pass')
  })

  it('returns deterministic diagnostics without modifying its inputs', () => {
    const input = inputFor(fixture('two-legitimate-transactions')), saved = structuredClone(input)
    const first = checkAccounting(input)
    expect(input).toEqual(saved)
    input.events = input.events.slice().reverse(); input.changes = input.changes.slice().reverse()
    input.accounts = input.accounts.slice().reverse(); input.balances = input.balances.slice().reverse()
    input.transactions = input.transactions.slice().reverse()
    expect(checkAccounting(input)).toEqual(first)
  })
})
