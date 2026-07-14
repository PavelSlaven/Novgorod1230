import { FORBIDDEN_INPUT_KEYS, REQUIRED_ARTIFACT_KEYS, REQUIRED_WRITE_POLICY, STAGE24_PRECHECK_SCHEMA } from '../policy/constants.js';
import { computeStage24Digest, isObject, passCheck, text } from '../shared/utils.js';
import { currentPositionMatchesApprovedScene, findCurrentPosition } from '../references/reference-index.js';
import { validateArtifactApprovalDigest, validateStage24Input } from '../input/input-boundary.js';

export function buildPartyDbWritePlanCodePrecheck(input = {}) {
  const concerns = validateStage24Input(input);
  const codes = new Set(concerns.map((item) => item.code));
  const checks = {
    input_schema_valid: passCheck(!codes.has('WRITE_PLAN_INPUT_BINDING_INVALID')),
    request_id_consistent: passCheck(text(input.request_id)),
    party_creation_context_valid: passCheck(text(input.party_creation_context?.party_id) && text(input.party_creation_context?.player_character_id)),
    all_required_outputs_present: passCheck(REQUIRED_ARTIFACT_KEYS.every((key) => input.approved_pipeline_outputs?.[key] != null)),
    all_required_audits_passed: passCheck(!concerns.some((item) => item.path?.includes('audit'))),
    all_upstream_digests_valid: passCheck(!codes.has('WRITE_PLAN_MANIFEST_INVALID')),
    party_database_schema_present: passCheck(isObject(input.party_database_schema)),
    party_database_schema_complete: passCheck(!codes.has('WRITE_PLAN_DATABASE_SCHEMA_INVALID')),
    party_database_schema_checksum_valid: passCheck(input.party_database_schema_digest === computeStage24Digest(input.party_database_schema)),
    world_base_reference_present: passCheck(isObject(input.world_base_reference_snapshot)),
    world_base_reference_checksum_valid: passCheck(input.world_base_reference_digest === computeStage24Digest(input.world_base_reference_snapshot)),
    character_knowledge_projection_present: passCheck(input.approved_pipeline_outputs?.character_knowledge_write_projection?.schema === 'character_knowledge_write_projection'),
    character_knowledge_projection_manifest_valid: passCheck(isObject(input.approved_pipeline_outputs?.character_knowledge_write_projection?.projection_manifest)),
    current_position_present: passCheck(Boolean(findCurrentPosition(input.approved_pipeline_outputs))),
    current_position_approved: passCheck(currentPositionMatchesApprovedScene(input.approved_pipeline_outputs)),
    narrator_prose_approved: passCheck(input.approved_pipeline_outputs?.narrator_prose_audit_approval?.pass === true),
    narrator_prose_digest_valid: passCheck(validateArtifactApprovalDigest(input.approved_pipeline_outputs?.narrator_prose_audit_approval, input.approved_pipeline_outputs?.narrator_starting_prose)),
    write_policy_complete: passCheck(Object.keys(REQUIRED_WRITE_POLICY).every((key) => input.write_policy?.[key] === true)),
    write_policy_not_weakened: passCheck(Object.entries(REQUIRED_WRITE_POLICY).every(([key, value]) => input.write_policy?.[key] === value)),
    no_forbidden_global_fields: passCheck(!Object.keys(input).some((key) => FORBIDDEN_INPUT_KEYS.has(key))),
    no_live_database_handles: passCheck(!['client', 'db', 'database', 'transaction_client'].some((key) => key in input)),
    no_mutable_context_objects: passCheck(!('context' in input) && !('pipeline_context' in input))
  };
  return {
    version: 1,
    schema: STAGE24_PRECHECK_SCHEMA,
    request_id: input.request_id ?? null,
    input_digest: input.party_db_write_plan_input_digest ?? null,
    party_database_schema_digest: input.party_database_schema_digest ?? null,
    world_base_reference_digest: input.world_base_reference_digest ?? null,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest ?? null,
    pass: concerns.length === 0 && Object.values(checks).every((value) => value.pass === true),
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 24 exact input, manifest, schema snapshots, approvals and immutable policies passed code precheck.']
      : []
  };
}
