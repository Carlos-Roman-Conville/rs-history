# HI-3 accounting implementation (5494)

Implementation verified: pass on synthetic records (the accounting and protocol tests).
Integration verified: insufficient; no live owner evidence adapter or shared Kernel pass function is available.
Empirically validated: insufficient; the evidence is synthetic, not an independent historical dataset.

## Seven production items

1. **Rule, source, validity.** `checkAccounting` implements PLAN §3.7 / V14: one journal entry per
   committed transaction/leg, observed owner debit/credit equal to the declared amount, and per-account,
   per-quantity interval residual `close - open - sum(deltas)`. Rolled-back legs require zero entries and
   no committed changes. Writer attribution is checked separately. These are bookkeeping identities;
   enforcement remains with Kernel and the owners.
2. **Inputs, outputs, units, state owner.** The caller supplies native account/quantity/unit/owner mappings,
   committed and rolled-back leg declarations, `kernel.transfer` EventEntries, endpoint balances, and
   leg-specific before/after observations with writer and evidence ids. Output is a deterministic report
   with transaction, interval and writer findings, residuals, scales, limits and evidence ids. History
   compares copies only: it neither writes simulated state nor creates a second ledger. No unit conversion
   or account mapping is inferred.
3. **Parameters, evidence class, uncertainty.** Tolerances are owner-sourced `{abs, rel, scale, source}`.
   Continuous comparisons use `abs + rel * S`. Supported rules are `max_open_close_volume` (the PLAN's
   **proposed** max of absolute opening, closing and per-leg absolute volume), `current` (absolute closing),
   and the protocol's existing fixed numeric scale. Missing/invalid tolerance or unsupported scale is
   insufficient, with no fallback constant. Counts require safe integer inputs and exact BigInt residuals;
   continuous sums use compensation. No uncertainty or empirical validation is inferred from bookkeeping.
4. **Update, timing, convergence.** Pure post-run evaluation over `(t0,t1]`; endpoint samples are at t0/t1.
   Commit observations must be attributable to the particular leg, not checkpoint totals that include
   other activity. Concurrent legitimate transactions are allowed. No iteration. Diagnostics sort by id
   and reason, evidence ids lexically; journal arithmetic follows kernel order then event id.
5. **Tests.** `test/accounting.test.ts` loads all 11 read-only JSON fixtures and checks each expected verdict.
   It additionally tests cancellation missed by the interval, the two-store failure missed by unchanged
   X1 A1, rollback, independent debit/credit/journal defects, undeclared writers, missing evidence and
   tolerance, exact counts, per-leg absolute volume, numerical cancellation, interval boundaries,
   same-intention transactions, multiple legs, concurrent activity, units, determinism and input immutability.
   `test/protocol.test.ts` covers named and numeric scale declarations. Gate:
   `npx vitest run test/accounting.test.ts && npx tsc --noEmit`.
6. **Validation evidence.** Synthetic only. The fixture files lack several required metadata and balance
   fields. `inputFor` in the test explicitly labels supplemental declarations, exact fixture tolerances,
   opening gut values, intermediate gut values, and writer evidence. The equal/opposite case supplements
   person opening/closing balances and two cancelling transaction declarations; its world and person
   scopes are not added together. The A1 demonstration maps fixture times onto a day, supplies empty
   soil/plant stores and zero flows. None of these supplements is a production default or real evidence.
7. **Status.** Implemented and numerically verified on synthetic records. Available from `src/index.ts`.
   The caller must attest capture completeness with evidence ids and set it false for stopped observers
   or recording gaps. Missing observations remain insufficient; known contradictions remain failures.

## Integration limits

The installed Kernel exports `Reconciler` but no shared tolerance pass function. Its current tolerance is
a scalar relative to `max(1, |current|)`, which is not this task's declared formula. This unit therefore
implements the explicitly requested formula locally and does not change Kernel or claim shared-function
integration. The PLAN's newer `span` contract is deliberately unsupported until that function and its
precise scale semantics are available; declaring it returns insufficient. Replace the local comparison
with the shared function once Kernel supplies it.

Native `Observation` lacks writer and transaction/leg attribution, and the installed Kernel TransferEntry
lacks transaction/leg ids. A future owner/host adapter must supply this evidence from authoritative records;
it must not infer writer identity from a transfer event's producer. The tests' added evidence is labelled
fixture data. No live adapter, harness, read-only fixture, A1 implementation or other repository is changed.
