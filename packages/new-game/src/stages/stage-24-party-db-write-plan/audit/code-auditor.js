import { REQUIRED_AUDIT_CHECKS, STAGE24_AUDIT_SCHEMA } from '../policy/constants.js';
import { buildPartyDbWritePlanCodePrecheck } from '../precheck/build-precheck.js';
import { computePartyDbWritePlanDigest, issue, safeClone } from '../shared/utils.js';
import { validatePartyDbWritePlan } from '../validation/plan-validation.js';

export function auditPartyDbWritePlanByCode(request = {}) {
  const plan = request.party_db_write_plan;
  const input = request.stage24_input ?? {
    version: 1,
    schema: 'party_db_write_plan_input',
    request_id: request.request_id,
    pipeline_profile: request.approved_pipeline_manifest?.manifest_kind ?? 'standard_new_game',
    party_creation_context: structuredClone(request.party_creation_context),
    approved_pipeline_outputs: structuredClone(request.approved_pipeline_outputs),
    approved_pipeline_manifest: structuredClone(request.approved_pipeline_manifest),
    approved_pipeline_manifest_digest: plan?.approved_pipeline_manifest_digest,
    party_database_schema: structuredClone(request.party_database_schema),
    party_database_schema_digest: plan?.party_database_schema_digest,
    world_base_reference_snapshot: structuredClone(request.world_base_reference_snapshot),
    world_base_reference_digest: plan?.world_base_reference_digest,
    write_policy: structuredClone(request.write_policy),
    party_db_write_plan_input_digest: plan?.source_input_digest
  };
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  const validationConcerns = validatePartyDbWritePlan(plan, input, precheck);
  const digestMatches = request.party_db_write_plan_digest === computePartyDbWritePlanDigest(plan);
  const concerns = [
    ...validationConcerns,
    ...(digestMatches ? [] : [issue(
      'WRITE_PLAN_AUDIT_DIGEST_MISMATCH',
      'Code auditor received a plan digest that does not match the immutable plan.',
      'party_db_write_plan_digest'
    )])
  ];
  const pass = precheck.pass === true && concerns.length === 0;
  return {
    version: 1,
    schema: STAGE24_AUDIT_SCHEMA,
    request_id: input?.request_id ?? null,
    party_db_write_plan_digest: computePartyDbWritePlanDigest(plan),
    pass,
    checks: Object.fromEntries(REQUIRED_AUDIT_CHECKS.map((key) => [key, { pass }])),
    concerns: safeClone(concerns),
    evidence: pass
      ? ['Canonical Stage 24 code auditor independently repeated precheck, plan validation and digest verification.']
      : ['Canonical Stage 24 code auditor rejected the plan before commit handoff.'],
    proposed_repair_route: pass ? null : 'blocked',
    commit_permission: {
      can_send_to_commit_gate: pass,
      can_execute_transaction: pass,
      can_write_party_snapshots: pass
    }
  };
}
