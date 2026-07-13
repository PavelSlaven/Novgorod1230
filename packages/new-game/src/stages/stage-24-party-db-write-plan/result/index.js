import {
  buildStage24WritePlanApproval,
  validateStage24ToStage25HandoffContract
} from '@rus/contracts';
import { STAGE24_RESULT_SCHEMA } from '../policy/constants.js';
import { computePartyDbWritePlanDigest, safeClone } from '../shared/utils.js';

export function validateProvidedStage24Result() {
  throw new Error('Provided Stage 24 input/writePlan/audit/output is forbidden in all environments. Stub Stage 24 role executors instead.');
}

export function validateStage24ToStage25Handoff(args = {}) {
  return validateStage24ToStage25HandoffContract(args);
}

export function buildStage24Approval(result = {}) {
  return buildStage24WritePlanApproval(result);
}

export function buildStage24Result({ input, precheck, plan, audit, histories, diagnostics }) {
  const planDigest = computePartyDbWritePlanDigest(plan);
  return {
    version: 1,
    schema: STAGE24_RESULT_SCHEMA,
    request_id: input.request_id,
    pass: true,
    party_db_write_plan_input_digest: input.party_db_write_plan_input_digest,
    party_database_schema_digest: input.party_database_schema_digest,
    world_base_reference_digest: input.world_base_reference_digest,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest,
    party_db_write_plan_digest: planDigest,
    party_db_write_plan_code_precheck: safeClone(precheck),
    party_db_write_plan: safeClone(plan),
    party_db_write_plan_audit: safeClone(audit),
    repair_route: null,
    generation_history: safeClone(histories.generation),
    audit_history: safeClone(histories.audit),
    repair_history: safeClone(histories.repair),
    diagnostics: safeClone(diagnostics),
    handoff_permission: {
      can_send_to_commit_gate: true,
      can_execute_transaction: true,
      can_write_party_snapshots: true
    }
  };
}
