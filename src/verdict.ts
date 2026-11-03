import { validateProtocol } from './protocol.ts'
import type { Protocol, ProtocolCheck } from './protocol.ts'

export type CheckStatus = 'pass' | 'fail' | 'insufficient'
export interface Finding { status: CheckStatus; evidence: string[] }
export interface Discrepancy {
  e: number | null
  e_log?: number | null
  unit: string
  reference_uncertainty: { low: number; high: number; source: string } | null
}
export interface CheckResult extends Discrepancy {
  id: string
  evidence: string[]
  /** Event classes whose required payloads are actually available to this check. */
  available_types: string[]
}
export interface JudgedCheck extends Finding {
  id: string
  discrepancy: Discrepancy | null
  criterion: ProtocolCheck
}
export interface Verdict {
  implementation: Finding
  integration: Finding
  validation: Finding
  checks: JudgedCheck[]
  input_seal_hash: string
  output_seal_hash: string
}
const sorted = (ids: readonly string[]) => [...new Set(ids)].sort()
/** Empty evidence is insufficient; failure dominates incompleteness. */
export function combineChecks(checks: readonly Finding[]): Finding {
  return {
    status: checks.some(c => c.status === 'fail') ? 'fail'
      : !checks.length || checks.some(c => c.status === 'insufficient' || !c.evidence.length) ? 'insufficient' : 'pass',
    evidence: sorted(checks.flatMap(c => c.evidence)),
  }
}

/** Owner-specific evaluators apply only the sealed criterion to raw discrepancies.
 * No generic scientific test or confidence method is invented here. The callback
 * receives an explicit projection, so extra score fields never reach evaluation.
 * Seal hashes identify evidence already verified by the caller with verifySeals.
 */
export function buildVerdict(
  protocol: Protocol,
  results: readonly CheckResult[],
  findings: { implementation: readonly Finding[]; integration: readonly Finding[] },
  seals: { input_seal_hash: string; output_seal_hash: string },
  judge: (criterion: ProtocolCheck, discrepancy: Discrepancy) => CheckStatus,
): Verdict {
  const errors = validateProtocol(protocol)
  if (errors.length) throw new Error(errors.join('; '))
  if (!seals.input_seal_hash.trim() || !seals.output_seal_hash.trim()) throw new Error('seal hashes required')
  const byId = new Map<string, CheckResult>()
  for (const result of results) {
    if (byId.has(result.id) || !protocol.checks.some(c => c.id === result.id)) throw new Error(`unexpected or duplicate check: ${result.id}`)
    byId.set(result.id, result)
  }
  const checks = [...protocol.checks].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(criterion => {
    const result = byId.get(criterion.id)
    const discrepancy: Discrepancy | null = result ? {
      e: result.e, ...(result.e_log === undefined ? {} : { e_log: result.e_log }),
      unit: result.unit, reference_uncertainty: result.reference_uncertainty === null ? null : {
        low: result.reference_uncertainty.low, high: result.reference_uncertainty.high, source: result.reference_uncertainty.source,
      },
    } : null
    const uncertainty = discrepancy?.reference_uncertainty
    const complete = result && discrepancy && discrepancy.e !== null && Number.isFinite(discrepancy.e)
      && (discrepancy.e_log == null || Number.isFinite(discrepancy.e_log)) && discrepancy.unit.trim()
      && uncertainty && Number.isFinite(uncertainty.low) && Number.isFinite(uncertainty.high)
      && uncertainty.low <= uncertainty.high && uncertainty.source.trim()
      && result.evidence.length > 0 && result.evidence.every(id => id.trim())
      && criterion.needs_types.every(t => result.available_types.includes(t))
      && criterion.tolerance !== null && criterion.margin !== null
      && criterion.t_vacancy_ms !== null
    const status = complete ? judge(structuredClone(criterion), structuredClone(discrepancy)) : 'insufficient'
    if (!['pass', 'fail', 'insufficient'].includes(status)) throw new Error('invalid criterion judgment')
    return { id: criterion.id, status, evidence: sorted(result?.evidence ?? []), discrepancy, criterion: structuredClone(criterion) }
  })
  return {
    implementation: combineChecks(findings.implementation), integration: combineChecks(findings.integration),
    validation: combineChecks(checks), checks,
    input_seal_hash: seals.input_seal_hash, output_seal_hash: seals.output_seal_hash,
  }
}
