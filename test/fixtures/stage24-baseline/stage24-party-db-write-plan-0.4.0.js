import { createHash } from 'node:crypto';

export const STAGE24_INPUT_SCHEMA = 'party_db_write_plan_input';
export const STAGE24_PRECHECK_SCHEMA = 'party_db_write_plan_code_precheck';
export const STAGE24_PLAN_SCHEMA = 'party_db_write_plan';
export const STAGE24_AUDIT_SCHEMA = 'party_db_write_plan_audit';
export const STAGE24_ROUTE_SCHEMA = 'party_db_write_plan_repair_route';
export const STAGE24_RESULT_SCHEMA = 'stage24_party_db_write_plan_result';
export const STAGE24_MANIFEST_SCHEMA = 'approved_pipeline_manifest';
export const PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA = 'party_database_schema_snapshot';
export const WORLD_BASE_REFERENCE_SCHEMA = 'world_base_reference_snapshot';

export const REQUIRED_WRITE_POLICY = Object.freeze({
  require_all_previous_audits_passed: true,
  require_atomic_transaction: true,
  require_idempotency_keys: true,
  require_fk_precheck: true,
  require_no_world_base_mutation: true,
  require_source_trace: true,
  require_rollback_plan: true,
  require_write_order: true,
  reject_unapproved_entities: true,
  reject_hidden_state_to_player_tables: true,
  reject_player_output_before_commit: true,
  require_knowledge_projection_exact_match: true,
  require_plan_digest_binding: true,
  allow_snapshot_tables: true
});

const REQUIRED_ARTIFACT_KEYS = Object.freeze([
  'historical_frame',
  'weather_state',
  'selected_start_node',
  'start_place_audit',
  'player_character',
  'player_character_audit',
  'g5_scene_graph',
  'g5_scene_audit',
  'initial_npc_placement',
  'npc_placement_audit',
  'initial_item_placement',
  'item_placement_audit',
  'time_light_consistency_audit',
  'character_knowledge_map',
  'character_knowledge_map_audit',
  'character_knowledge_write_projection',
  'full_hidden_scene_state',
  'full_hidden_state_audit',
  'visible_context_package',
  'visible_context_audit_approval',
  'narrator_starting_prose',
  'narrator_prose_audit_approval'
]);

const ARTIFACT_STAGE_IDS = Object.freeze({
  historical_frame: 3,
  weather_state: 17,
  selected_start_node: 9,
  start_place_audit: 10,
  player_character: 11,
  player_character_audit: 12,
  g5_scene_graph: 13,
  g5_scene_audit: 14,
  initial_npc_placement: 15,
  npc_placement_audit: 1502,
  initial_item_placement: 16,
  item_placement_audit: 1602,
  time_light_consistency_audit: 17,
  character_knowledge_map: 18,
  character_knowledge_map_audit: 1802,
  character_knowledge_write_projection: 1803,
  full_hidden_scene_state: 19,
  full_hidden_state_audit: 1902,
  visible_context_package: 20,
  visible_context_audit_approval: 21,
  narrator_starting_prose: 22,
  narrator_prose_audit_approval: 23
});

const REQUIRED_AUDIT_CHECKS = Object.freeze([
  'plan_schema',
  'transaction_atomicity',
  'database_schema_compliance',
  'write_order',
  'dependency_graph',
  'approved_entities_only',
  'npc_projection',
  'item_container_projection',
  'position_projection',
  'g5_projection',
  'knowledge_projection',
  'hidden_visible_boundary',
  'narrator_output_projection',
  'source_trace',
  'audit_snapshots',
  'forbidden_writes',
  'world_base_immutability',
  'rollback_completeness',
  'idempotency',
  'commit_readiness'
]);

export const STAGE24_CONCERN_CODES = Object.freeze([
  'WRITE_PLAN_INPUT_BINDING_INVALID',
  'WRITE_PLAN_SCHEMA_INVALID',
  'WRITE_PLAN_TRANSACTION_INVALID',
  'WRITE_PLAN_NON_ATOMIC',
  'WRITE_PLAN_WRITE_ORDER_INVALID',
  'WRITE_PLAN_DEPENDENCY_INVALID',
  'WRITE_PLAN_DEPENDENCY_CYCLE',
  'WRITE_PLAN_UNKNOWN_TABLE',
  'WRITE_PLAN_UNKNOWN_COLUMN',
  'WRITE_PLAN_INVALID_OPERATION',
  'WRITE_PLAN_ENUM_INVALID',
  'WRITE_PLAN_FK_INVALID',
  'WRITE_PLAN_UNAPPROVED_NPC',
  'WRITE_PLAN_UNAPPROVED_ITEM',
  'WRITE_PLAN_UNAPPROVED_CONTAINER',
  'WRITE_PLAN_UNAPPROVED_ANCHOR',
  'WRITE_PLAN_UNAPPROVED_ROUTE',
  'WRITE_PLAN_POSITION_MISMATCH',
  'WRITE_PLAN_CLOCK_MISMATCH',
  'WRITE_PLAN_VISIBLE_CONTEXT_MISMATCH',
  'WRITE_PLAN_HIDDEN_STATE_MISMATCH',
  'WRITE_PLAN_HIDDEN_PUBLIC_LEAK',
  'WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE',
  'WRITE_PLAN_KNOWLEDGE_PROJECTION_EXTRA',
  'WRITE_PLAN_SOURCE_TRACE_INCOMPLETE',
  'WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE',
  'WRITE_PLAN_WORLD_BASE_MUTATION',
  'WRITE_PLAN_ROLLBACK_INCOMPLETE',
  'WRITE_PLAN_IDEMPOTENCY_INVALID',
  'WRITE_PLAN_PLAYER_OUTPUT_BEFORE_COMMIT',
  'WRITE_PLAN_DATABASE_SCHEMA_INVALID',
  'WRITE_PLAN_MANIFEST_INVALID',
  'WRITE_PLAN_FORMAT_INVALID',
  'WRITE_PLAN_AUDIT_INVALID',
  'WRITE_PLAN_AUDIT_DIGEST_MISMATCH'
]);

export const STAGE24_SEVERITIES = Object.freeze([
  'format_error',
  'repairable',
  'upstream_block',
  'hard_block',
  'manual_review'
]);

export const STAGE24_REPAIR_ROUTES = Object.freeze([
  'party_db_write_plan_format_repair',
  'party_db_write_plan_semantic_repair',
  'party_db_write_plan_rebuild',
  'party_database_schema_reload',
  'approved_pipeline_output_repair',
  'character_knowledge_projection_repair',
  'blocked',
  'manual_review'
]);

const FORMAT_PLAN_CODES = new Set([
  'WRITE_PLAN_FORMAT_INVALID',
  'WRITE_PLAN_SCHEMA_INVALID',
  'WRITE_PLAN_TRANSACTION_INVALID',
  'WRITE_PLAN_WRITE_ORDER_INVALID',
  'WRITE_PLAN_SOURCE_TRACE_INCOMPLETE',
  'WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE'
]);

const FORBIDDEN_INPUT_KEYS = new Set([
  'context', 'pipeline_context', 'stage_registry', 'stage_outputs', 'database', 'db',
  'client', 'transaction_client', 'pipeline_diagnostics', 'repair_logs', 'generation_history'
]);

const FORBIDDEN_AUDIT_KEYS = new Set([
  'party_db_write_plan', 'write_plan', 'modified_write_plan', 'new_write_plan',
  'full_hidden_scene_state', 'hidden_state', 'character_knowledge_map',
  'visible_context_package', 'approved_pipeline_outputs', 'repair_payload'
]);

const PUBLIC_TABLE_PATTERN = /(public|player|narrator|visible|ui|message|screen|journal)/i;
const WORLD_BASE_PATTERN = /(^|[._-])world_base([._-]|$)/i;
const HIDDEN_FIELD_PATTERN = /(hidden_state|hidden_truth|private_motive|future_event|closed_container_contents|actual_truth_hidden)/i;
const PLAYER_OUTPUT_FIELD_PATTERN = /(player_visible_message|opening_scene_presented|first_game_screen|narrator_output_committed)/i;

const ALLOWED_PLAN_KEYS = new Set([
  'version', 'schema', 'request_id', 'plan_status', 'source_input_digest',
  'party_database_schema_digest', 'world_base_reference_digest',
  'approved_pipeline_manifest_digest', 'transaction', 'preconditions',
  'write_batches', 'postconditions', 'forbidden_writes', 'derived_indexes',
  'audit_snapshots', 'rollback_plan', 'source_trace',
  'knowledge_projection_validation', 'self_audit'
]);

const ALLOWED_AUDIT_KEYS = new Set([
  'version', 'schema', 'request_id', 'party_db_write_plan_digest', 'pass',
  'checks', 'concerns', 'evidence', 'proposed_repair_route', 'commit_permission'
]);

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function computeStage24Digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function computePartyDbWritePlanDigest(plan) {
  return computeStage24Digest(plan);
}

export function normalizeStage24WritePolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 24 additional_write_policy must be an object.');
  for (const [key, value] of Object.entries(additionalPolicy)) {
    if (Object.hasOwn(REQUIRED_WRITE_POLICY, key) && value !== true) {
      throw new Error(`Stage 24 write policy cannot weaken required invariant: ${key}.`);
    }
  }
  return Object.freeze({ ...REQUIRED_WRITE_POLICY, ...safeClone(additionalPolicy) });
}

export function buildApprovedPipelineManifest({ request_id, artifacts } = {}) {
  if (!text(request_id)) throw new Error('approved pipeline manifest requires request_id.');
  if (!isObject(artifacts)) throw new Error('approved pipeline manifest requires artifacts.');
  return {
    version: 1,
    schema: STAGE24_MANIFEST_SCHEMA,
    request_id,
    artifacts: REQUIRED_ARTIFACT_KEYS.map((artifactKey) => ({
      artifact_key: artifactKey,
      stage_id: ARTIFACT_STAGE_IDS[artifactKey],
      artifact_schema: artifacts[artifactKey]?.schema ?? null,
      artifact_digest: computeStage24Digest(artifacts[artifactKey])
    }))
  };
}

export function buildStage24Input({
  request_id,
  party_creation_context,
  approved_pipeline_outputs,
  approved_pipeline_manifest,
  party_database_schema,
  world_base_reference_snapshot,
  additional_write_policy = {}
} = {}) {
  if (!isObject(approved_pipeline_outputs)) throw new Error('Stage 24 requires approved_pipeline_outputs.');
  if (!isObject(party_database_schema)) throw new Error('Stage 24 requires party_database_schema snapshot.');
  if (!isObject(world_base_reference_snapshot)) throw new Error('Stage 24 requires world_base_reference_snapshot.');
  const outputs = safeClone(approved_pipeline_outputs ?? {});
  const manifest = approved_pipeline_manifest
    ? safeClone(approved_pipeline_manifest)
    : buildApprovedPipelineManifest({ request_id, artifacts: outputs });
  const schemaSnapshot = safeClone(party_database_schema);
  const worldSnapshot = safeClone(world_base_reference_snapshot);
  const input = {
    version: 1,
    schema: STAGE24_INPUT_SCHEMA,
    request_id,
    party_creation_context: safeClone(party_creation_context),
    approved_pipeline_outputs: outputs,
    approved_pipeline_manifest: manifest,
    approved_pipeline_manifest_digest: computeStage24Digest(manifest),
    party_database_schema: schemaSnapshot,
    party_database_schema_digest: computeStage24Digest(schemaSnapshot),
    world_base_reference_snapshot: worldSnapshot,
    world_base_reference_digest: computeStage24Digest(worldSnapshot),
    write_policy: normalizeStage24WritePolicy(additional_write_policy)
  };
  input.party_db_write_plan_input_digest = computeStage24Digest({
    ...input,
    party_db_write_plan_input_digest: undefined
  });
  return input;
}

export function validateStage24Input(input = {}) {
  const concerns = [];
  if (!isObject(input) || input.version !== 1 || input.schema !== STAGE24_INPUT_SCHEMA) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 input must be party_db_write_plan_input version 1.', 'input')];
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Forbidden Stage 24 input field: ${key}.`, key));
  }
  if (!text(input.request_id)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'request_id is required.', 'request_id'));
  const party = input.party_creation_context;
  if (!isObject(party)) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'party_creation_context is required.', 'party_creation_context'));
  } else {
    for (const key of ['party_id', 'player_character_id', 'idempotency_key', 'schema_version']) {
      if (!text(party[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `party_creation_context.${key} is required.`, `party_creation_context.${key}`));
    }
  }
  if (!isObject(input.approved_pipeline_outputs)) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'approved_pipeline_outputs is required.', 'approved_pipeline_outputs'));
  } else {
    for (const key of REQUIRED_ARTIFACT_KEYS) {
      if (input.approved_pipeline_outputs[key] == null) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `approved_pipeline_outputs.${key} is required.`, `approved_pipeline_outputs.${key}`));
    }
  }
  concerns.push(...validateApprovedPipelineManifest(input.approved_pipeline_manifest, input.approved_pipeline_outputs, input.request_id));
  if (input.approved_pipeline_manifest_digest !== computeStage24Digest(input.approved_pipeline_manifest)) {
    concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'approved_pipeline_manifest_digest mismatch.', 'approved_pipeline_manifest_digest'));
  }
  concerns.push(...validatePartyDatabaseSchemaSnapshot(input.party_database_schema));
  if (input.party_database_schema_digest !== computeStage24Digest(input.party_database_schema)) {
    concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party_database_schema_digest mismatch.', 'party_database_schema_digest'));
  }
  concerns.push(...validateWorldBaseReferenceSnapshot(input.world_base_reference_snapshot));
  if (input.world_base_reference_digest !== computeStage24Digest(input.world_base_reference_snapshot)) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'world_base_reference_digest mismatch.', 'world_base_reference_digest'));
  }
  for (const [key, expected] of Object.entries(REQUIRED_WRITE_POLICY)) {
    if (input.write_policy?.[key] !== expected) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `write_policy.${key} cannot be weakened.`, `write_policy.${key}`));
  }
  const expectedInputDigest = computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  if (input.party_db_write_plan_input_digest !== expectedInputDigest) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'party_db_write_plan_input_digest mismatch.', 'party_db_write_plan_input_digest'));
  }
  concerns.push(...validateAuditApprovals(input.approved_pipeline_outputs, input.request_id));
  return concerns;
}

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

export function validatePartyDatabaseSchemaSnapshot(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA) {
    return [issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `Expected ${PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA} version 1.`, 'party_database_schema')];
  }
  if (!text(snapshot.schema_version)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database schema_version is required.', 'party_database_schema.schema_version'));
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database readonly_checksum is required.', 'party_database_schema.readonly_checksum'));
  for (const key of ['tables', 'foreign_keys', 'unique_constraints', 'check_constraints', 'enum_definitions', 'indexes', 'allowed_operations']) {
    if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `party_database_schema.${key} must be an array.`, `party_database_schema.${key}`));
  }
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length === 0) {
    concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party_database_schema.tables must be non-empty.', 'party_database_schema.tables'));
  } else {
    for (const [index, table] of snapshot.tables.entries()) {
      if (!text(tableName(table))) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires name/table_name.', `party_database_schema.tables[${index}]`));
      if (!Array.isArray(table.columns) || table.columns.length === 0) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires non-empty columns.', `party_database_schema.tables[${index}].columns`));
    }
  }
  return concerns;
}

export function validateWorldBaseReferenceSnapshot(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== WORLD_BASE_REFERENCE_SCHEMA) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Expected ${WORLD_BASE_REFERENCE_SCHEMA} version 1.`, 'world_base_reference_snapshot')];
  }
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'world_base_reference_snapshot.readonly_checksum is required.', 'world_base_reference_snapshot.readonly_checksum'));
  for (const key of [
    'allowed_region_ids', 'allowed_graph_node_ids', 'allowed_graph_edge_ids',
    'allowed_place_template_ids', 'allowed_npc_candidate_ids', 'allowed_item_profile_ids',
    'allowed_container_profile_ids', 'allowed_property_rule_ids', 'allowed_source_ids'
  ]) {
    if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `world_base_reference_snapshot.${key} must be an array.`, `world_base_reference_snapshot.${key}`));
  }
  return concerns;
}

export function validatePartyDbWritePlan(plan = {}, input = {}, precheck = null) {
  const concerns = [];
  const evidence = [];
  if (!isObject(plan)) return [issue('WRITE_PLAN_FORMAT_INVALID', 'party_db_write_plan must be an object.', 'plan')];
  for (const key of Object.keys(plan)) if (!ALLOWED_PLAN_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Unexpected write plan field: ${key}.`, key));
  if (plan.version !== 1 || plan.schema !== STAGE24_PLAN_SCHEMA) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Expected ${STAGE24_PLAN_SCHEMA} version 1.`, 'schema'));
  if (plan.request_id !== input.request_id) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Plan request_id must match Stage 24 input.', 'request_id'));
  if (plan.plan_status !== 'formed') concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'plan_status must be formed.', 'plan_status'));
  if (precheck?.schema !== STAGE24_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 code precheck must pass before validating a plan.', 'precheck'));
  for (const [key, expected] of [
    ['source_input_digest', input.party_db_write_plan_input_digest],
    ['party_database_schema_digest', input.party_database_schema_digest],
    ['world_base_reference_digest', input.world_base_reference_digest],
    ['approved_pipeline_manifest_digest', input.approved_pipeline_manifest_digest]
  ]) if (plan[key] !== expected) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key} mismatch.`, key));

  concerns.push(...validateTransaction(plan.transaction, input));
  concerns.push(...validateBatchGraph(plan));
  concerns.push(...validatePlanAgainstDatabaseSchema(plan, input.party_database_schema));
  concerns.push(...validateApprovedReferences(plan, input));
  concerns.push(...validateKnowledgeProjection(plan, input));
  concerns.push(...validateHiddenVisibleBoundary(plan));
  concerns.push(...validateSourceTrace(plan));
  concerns.push(...validateRollback(plan));
  concerns.push(...validateAuditSnapshots(plan, input));
  concerns.push(...validateForbiddenWrites(plan));
  concerns.push(...validateSelfAudit(plan));

  if (concerns.length === 0) evidence.push('Write plan passed structural, schema, approved-reference, knowledge, boundary, trace and rollback validation.');
  return concerns;
}

export function validatePartyDbWritePlanAudit(audit = {}, input = {}, plan = {}) {
  const concerns = [];
  if (!isObject(audit)) return [issue('WRITE_PLAN_AUDIT_INVALID', 'party_db_write_plan_audit must be an object.', 'audit')];
  for (const key of Object.keys(audit)) {
    if (!ALLOWED_AUDIT_KEYS.has(key) || FORBIDDEN_AUDIT_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Forbidden or unexpected audit field: ${key}.`, key));
  }
  if (audit.version !== 1 || audit.schema !== STAGE24_AUDIT_SCHEMA) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Expected ${STAGE24_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  if (audit.request_id !== input.request_id) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Audit request_id must match Stage 24 input.', 'audit.request_id'));
  if (audit.party_db_write_plan_digest !== computePartyDbWritePlanDigest(plan)) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Audit plan digest does not match the validated write plan.', 'audit.party_db_write_plan_digest'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.pass must be boolean.', 'audit.pass'));
  if (!isObject(audit.checks)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.checks must be an object.', 'audit.checks'));
  for (const key of REQUIRED_AUDIT_CHECKS) {
    const check = audit.checks?.[key];
    if (!isObject(check) || typeof check.pass !== 'boolean') concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `audit.checks.${key}.pass is required.`, `audit.checks.${key}`));
  }
  if (!Array.isArray(audit.concerns)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence) || audit.evidence.length === 0 || audit.evidence.some((value) => !text(value))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.evidence must be a non-empty array of strings.', 'audit.evidence'));
  for (const [index, item] of array(audit.concerns).entries()) {
    if (!STAGE24_CONCERN_CODES.includes(item?.code)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unknown concern code: ${item?.code}.`, `audit.concerns[${index}].code`));
    if (!STAGE24_SEVERITIES.includes(item?.severity)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unknown severity: ${item?.severity}.`, `audit.concerns[${index}].severity`));
    if (!text(item?.message)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Concern message is required.', `audit.concerns[${index}].message`));
  }
  const permissions = audit.commit_permission ?? {};
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) {
    if (permissions[key] !== (audit.pass === true)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `commit_permission.${key} must equal audit.pass.`, `audit.commit_permission.${key}`));
  }
  const failedChecks = REQUIRED_AUDIT_CHECKS.filter((key) => audit.checks?.[key]?.pass === false);
  if (audit.pass === true) {
    if (array(audit.concerns).length > 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit cannot contain concerns.', 'audit.concerns'));
    if (failedChecks.length > 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit cannot contain failed checks.', 'audit.checks'));
    if (audit.proposed_repair_route != null) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit must not propose repair route.', 'audit.proposed_repair_route'));
  } else {
    if (array(audit.concerns).length === 0 || failedChecks.length === 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Failed audit requires concerns and failed checks.', 'audit'));
  }
  return concerns;
}

export function validateStage24RepairRoute(route = {}, audit = {}) {
  const concerns = [];
  if (!isObject(route) || route.version !== 1 || route.schema !== STAGE24_ROUTE_SCHEMA) {
    return [issue('WRITE_PLAN_AUDIT_INVALID', `Expected ${STAGE24_ROUTE_SCHEMA} version 1.`, 'route')];
  }
  if (route.request_id !== audit.request_id) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route request_id must match audit.', 'route.request_id'));
  if (!STAGE24_REPAIR_ROUTES.includes(route.return_to_stage)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unsupported route: ${route.return_to_stage}.`, 'route.return_to_stage'));
  if (!text(route.repair_kind) || !text(route.reason)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route repair_kind and reason are required.', 'route'));
  if (!Array.isArray(route.supporting_concern_codes) || route.supporting_concern_codes.length === 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route supporting_concern_codes must be non-empty.', 'route.supporting_concern_codes'));
  const auditCodes = new Set(array(audit.concerns).map((item) => item?.code));
  for (const code of array(route.supporting_concern_codes)) if (!auditCodes.has(code)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Route references concern code not present in audit: ${code}.`, 'route.supporting_concern_codes'));
  if (!Array.isArray(route.allowed_mutable_paths) || !Array.isArray(route.forbidden_mutable_paths)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route mutable path lists are required.', 'route'));
  if (route.requires_reaudit_from_stage !== 24) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route must require re-audit from Stage 24.', 'route.requires_reaudit_from_stage'));
  concerns.push(...validateRouteCompatibility(route, audit));
  return concerns;
}

export async function runStage24PartyDbWritePlanBlock({
  input,
  builder,
  planFormatRepairer,
  auditor,
  auditFormatRepairer,
  router,
  semanticRepairer,
  seniorSemanticRepairer,
  seniorBuilder,
  seniorAuditor,
  maxRepairCycles = 3
} = {}) {
  const inputConcerns = validateStage24Input(input);
  if (inputConcerns.length > 0) throw stage24Error('Stage 24 input gate failed.', inputConcerns, 'stage24_input_gate');
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  if (!precheck.pass) throw stage24Error('Stage 24 code precheck failed.', precheck.concerns, 'stage24_code_precheck');
  for (const [name, callback] of Object.entries({
    builder, planFormatRepairer, auditor, auditFormatRepairer, router,
    semanticRepairer, seniorSemanticRepairer, seniorBuilder, seniorAuditor
  })) if (typeof callback !== 'function') throw new Error(`Stage 24 requires ${name} callback.`);

  const histories = { generation: [], audit: [], repair: [] };
  const diagnostics = {
    builder_attempts: 0,
    plan_format_repair_attempts: 0,
    auditor_attempts: 0,
    audit_format_repair_attempts: 0,
    router_attempts: 0,
    semantic_repair_attempts: 0,
    senior_builder_attempts: 0,
    senior_auditor_attempts: 0,
    last_error_codes: []
  };

  let rawPlan = await callRole(builder, buildBuilderRoleInput(input), 'PartyDbWritePlanBuilder');
  diagnostics.builder_attempts += 1;
  histories.generation.push(historyEntry('build', 'PartyDbWritePlanBuilder', []));
  let parsedPlan = parseRoleResult(rawPlan);
  if (parsedPlan.parseError) {
    rawPlan = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, rawPlan, parsedPlan.parseError), 'PartyDbWritePlanFormatRepairer');
    diagnostics.plan_format_repair_attempts += 1;
    histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', ['WRITE_PLAN_FORMAT_INVALID']));
    parsedPlan = parseRoleResult(rawPlan);
  }
  let plan = parsedPlan.value;
  let repairCycle = 0;
  let semanticRepairCount = 0;
  let audit = null;
  let route = null;

  while (true) {
    const planConcerns = parsedPlan.parseError
      ? [issue('WRITE_PLAN_FORMAT_INVALID', parsedPlan.parseError, 'plan')]
      : validatePartyDbWritePlan(plan, input, precheck);
    diagnostics.last_error_codes = planConcerns.map((item) => item.code);
    if (planConcerns.length > 0) {
      if (repairCycle >= maxRepairCycles) throw stage24Error('Stage 24 plan repair escalation exhausted.', planConcerns, 'stage24_plan_validation');
      const formatOnly = planConcerns.every((item) => FORMAT_PLAN_CODES.has(item.code));
      if (formatOnly) {
        const repaired = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, plan, null, planConcerns), 'PartyDbWritePlanFormatRepairer');
        diagnostics.plan_format_repair_attempts += 1;
        histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', planConcerns.map((item) => item.code)));
        parsedPlan = parseRoleResult(repaired);
        plan = parsedPlan.value;
      } else {
        const useSenior = semanticRepairCount >= 1;
        const role = useSenior ? 'SeniorPartyDbWritePlanSemanticRepairer' : 'PartyDbWritePlanSemanticRepairer';
        const callback = useSenior ? seniorSemanticRepairer : semanticRepairer;
        const repaired = await callRole(callback, buildPlanSemanticRepairInput(input, plan, planConcerns, audit, histories.repair), role);
        diagnostics.semantic_repair_attempts += 1;
        semanticRepairCount += 1;
        histories.repair.push(historyEntry(useSenior ? 'senior_semantic' : 'semantic', role, planConcerns.map((item) => item.code)));
        parsedPlan = parseRoleResult(repaired);
        plan = parsedPlan.value;
      }
      repairCycle += 1;
      audit = null;
      route = null;
      continue;
    }

    const planDigest = computePartyDbWritePlanDigest(plan);
    let rawAudit = await callRole(auditor, buildAuditorRoleInput(input, plan, planDigest), 'PartyDbWritePlanAuditor');
    diagnostics.auditor_attempts += 1;
    let parsedAudit = parseRoleResult(rawAudit);
    let auditConcerns = parsedAudit.parseError
      ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
      : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    if (auditConcerns.length > 0) {
      const repairedAudit = await callRole(auditFormatRepairer, buildAuditFormatRepairInput(input, plan, planDigest, rawAudit, auditConcerns), 'PartyDbWritePlanAuditFormatRepairer');
      diagnostics.audit_format_repair_attempts += 1;
      histories.repair.push(historyEntry('audit_format', 'PartyDbWritePlanAuditFormatRepairer', auditConcerns.map((item) => item.code)));
      parsedAudit = parseRoleResult(repairedAudit);
      auditConcerns = parsedAudit.parseError
        ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
        : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    }
    if (auditConcerns.length > 0) {
      const seniorAudit = await callRole(seniorAuditor, buildAuditorRoleInput(input, plan, planDigest, {
        previous_invalid_audit: safeClone(parsedAudit.value),
        audit_validation_errors: safeClone(auditConcerns)
      }), 'SeniorPartyDbWritePlanAuditor');
      diagnostics.senior_auditor_attempts += 1;
      parsedAudit = parseRoleResult(seniorAudit);
      auditConcerns = parsedAudit.parseError
        ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
        : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    }
    if (auditConcerns.length > 0) throw stage24Error('Stage 24 audit contract failed after format and senior escalation.', auditConcerns, 'stage24_audit_contract');
    audit = parsedAudit.value;
    histories.audit.push(historyEntry('audit', diagnostics.senior_auditor_attempts ? 'SeniorPartyDbWritePlanAuditor' : 'PartyDbWritePlanAuditor', array(audit.concerns).map((item) => item.code)));

    if (audit.pass === true) {
      return buildStage24Result({ input, precheck, plan, audit, histories, diagnostics });
    }
    if (repairCycle >= maxRepairCycles) throw stage24Error('Stage 24 semantic audit repair escalation exhausted.', audit.concerns, 'stage24_semantic_audit');

    route = await callRole(router, buildRouterRoleInput(input, audit), 'PartyDbWritePlanAuditRouter');
    diagnostics.router_attempts += 1;
    route = unwrapRoleResult(route);
    const routeConcerns = validateStage24RepairRoute(route, audit);
    if (routeConcerns.length > 0) throw stage24Error('Stage 24 router output is invalid.', routeConcerns, 'stage24_router_contract');

    if (route.return_to_stage === 'party_db_write_plan_format_repair') {
      const repaired = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, plan, null, audit.concerns), 'PartyDbWritePlanFormatRepairer');
      diagnostics.plan_format_repair_attempts += 1;
      histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else if (route.return_to_stage === 'party_db_write_plan_rebuild') {
      const repaired = await callRole(seniorBuilder, buildSeniorBuilderInput(input, plan, audit, route, histories.repair), 'SeniorPartyDbWritePlanBuilder');
      diagnostics.senior_builder_attempts += 1;
      histories.repair.push(historyEntry('senior_rebuild', 'SeniorPartyDbWritePlanBuilder', route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else if (route.return_to_stage === 'party_db_write_plan_semantic_repair') {
      const useSenior = semanticRepairCount >= 1;
      const role = useSenior ? 'SeniorPartyDbWritePlanSemanticRepairer' : 'PartyDbWritePlanSemanticRepairer';
      const callback = useSenior ? seniorSemanticRepairer : semanticRepairer;
      const repaired = await callRole(callback, buildPlanSemanticRepairInput(input, plan, audit.concerns, audit, histories.repair, route), role);
      diagnostics.semantic_repair_attempts += 1;
      semanticRepairCount += 1;
      histories.repair.push(historyEntry(useSenior ? 'senior_semantic' : 'semantic', role, route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else {
      throw stage24Error('Stage 24 requires upstream repair or manual review.', audit.concerns, 'stage24_upstream_repair', route);
    }
    repairCycle += 1;
    audit = null;
  }
}

export function validateProvidedStage24Result() {
  throw new Error('Provided Stage 24 input/writePlan/audit/output is forbidden in all environments. Stub Stage 24 role executors instead.');
}

export function validateStage24ToStage25Handoff({ stage24_result, party_database_schema, approved_pipeline_manifest } = {}) {
  const concerns = [];
  const result = stage24_result;
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE24_RESULT_SCHEMA || result.pass !== true) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Successful Stage 24 result bundle is required.', 'stage24_result')];
  }
  if (result.party_db_write_plan_code_precheck?.schema !== STAGE24_PRECHECK_SCHEMA || result.party_db_write_plan_code_precheck?.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 precheck must pass.', 'stage24_result.party_db_write_plan_code_precheck'));
  if (result.party_db_write_plan_audit?.schema !== STAGE24_AUDIT_SCHEMA || result.party_db_write_plan_audit?.pass !== true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Stage 24 audit must pass.', 'stage24_result.party_db_write_plan_audit'));
  if (result.repair_route != null) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Successful Stage 24 result cannot contain repair_route.', 'stage24_result.repair_route'));
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) if (result.handoff_permission?.[key] !== true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `handoff_permission.${key} must be true.`, `stage24_result.handoff_permission.${key}`));
  if (result.party_db_write_plan_digest !== computePartyDbWritePlanDigest(result.party_db_write_plan)) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Stage 24 plan digest mismatch.', 'stage24_result.party_db_write_plan_digest'));
  if (result.party_db_write_plan_audit?.party_db_write_plan_digest !== result.party_db_write_plan_digest) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Stage 24 audit is stale for current plan.', 'stage24_result.party_db_write_plan_audit.party_db_write_plan_digest'));
  if (result.party_database_schema_digest !== computeStage24Digest(party_database_schema)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Stage 25 party database schema is stale.', 'party_database_schema'));
  if (result.approved_pipeline_manifest_digest !== computeStage24Digest(approved_pipeline_manifest)) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'Stage 25 approved pipeline manifest is stale.', 'approved_pipeline_manifest'));
  return concerns;
}

export function buildStage24Approval(result = {}) {
  return {
    version: 1,
    schema: 'stage24_party_db_write_plan_approval',
    request_id: result.request_id ?? null,
    pass: result.pass === true,
    party_db_write_plan_digest: result.party_db_write_plan_digest ?? null,
    party_database_schema_digest: result.party_database_schema_digest ?? null,
    world_base_reference_digest: result.world_base_reference_digest ?? null,
    approved_pipeline_manifest_digest: result.approved_pipeline_manifest_digest ?? null,
    permissions: safeClone(result.handoff_permission ?? {})
  };
}

function buildStage24Result({ input, precheck, plan, audit, histories, diagnostics }) {
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

function validateApprovedPipelineManifest(manifest, outputs, requestId) {
  const concerns = [];
  if (!isObject(manifest) || manifest.version !== 1 || manifest.schema !== STAGE24_MANIFEST_SCHEMA || manifest.request_id !== requestId) {
    return [issue('WRITE_PLAN_MANIFEST_INVALID', `Expected ${STAGE24_MANIFEST_SCHEMA} version 1 with matching request_id.`, 'approved_pipeline_manifest')];
  }
  const entries = new Map(array(manifest.artifacts).map((item) => [item?.artifact_key, item]));
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const entry = entries.get(key);
    if (!entry) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest entry missing: ${key}.`, `approved_pipeline_manifest.artifacts.${key}`));
    else if (entry.artifact_digest !== computeStage24Digest(outputs?.[key])) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest digest mismatch: ${key}.`, `approved_pipeline_manifest.artifacts.${key}.artifact_digest`));
  }
  return concerns;
}

function validateAuditApprovals(outputs, requestId) {
  const concerns = [];
  for (const key of ['start_place_audit', 'player_character_audit', 'g5_scene_audit', 'npc_placement_audit', 'item_placement_audit', 'time_light_consistency_audit', 'character_knowledge_map_audit', 'full_hidden_state_audit', 'visible_context_audit_approval', 'narrator_prose_audit_approval']) {
    const value = outputs?.[key];
    if (!isObject(value) || value.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key}.pass must be true.`, `approved_pipeline_outputs.${key}`));
    if (value?.request_id != null && value.request_id !== requestId) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key}.request_id mismatch.`, `approved_pipeline_outputs.${key}.request_id`));
  }
  return concerns;
}

function validateArtifactApprovalDigest(approval, artifact) {
  if (!isObject(approval) || !artifact) return false;
  const expected = computeStage24Digest(artifact);
  return [approval.artifact_digest, approval.narrator_starting_prose_digest, approval.visible_context_package_digest]
    .filter(text)
    .some((value) => value === expected);
}

function validateTransaction(transaction, input) {
  const concerns = [];
  if (!isObject(transaction)) return [issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction is required.', 'transaction')];
  for (const key of ['transaction_id', 'party_id', 'idempotency_key', 'rollback_strategy']) if (!text(transaction[key])) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', `transaction.${key} is required.`, `transaction.${key}`));
  if (transaction.party_id !== input.party_creation_context.party_id) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction.party_id must match party_creation_context.', 'transaction.party_id'));
  if (transaction.idempotency_key !== input.party_creation_context.idempotency_key) concerns.push(issue('WRITE_PLAN_IDEMPOTENCY_INVALID', 'transaction.idempotency_key must match party_creation_context.', 'transaction.idempotency_key'));
  if (transaction.is_atomic !== true) concerns.push(issue('WRITE_PLAN_NON_ATOMIC', 'transaction.is_atomic must be true.', 'transaction.is_atomic'));
  if (transaction.is_dry_run_first !== true) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction.is_dry_run_first must be true.', 'transaction.is_dry_run_first'));
  if (transaction.rollback_strategy !== 'full_transaction_rollback') concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', 'rollback_strategy must be full_transaction_rollback.', 'transaction.rollback_strategy'));
  if (!Array.isArray(transaction.write_order) || transaction.write_order.length === 0) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'transaction.write_order must be non-empty.', 'transaction.write_order'));
  return concerns;
}

function validateBatchGraph(plan) {
  const concerns = [];
  const batches = array(plan.write_batches);
  if (!Array.isArray(plan.write_batches) || batches.length === 0) return [issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'write_batches must be a non-empty array.', 'write_batches')];
  const ids = new Set();
  const orders = new Set();
  for (const [index, batch] of batches.entries()) {
    if (!text(batch?.batch_id)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'batch_id is required.', `write_batches[${index}].batch_id`));
    else if (ids.has(batch.batch_id)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', `Duplicate batch_id: ${batch.batch_id}.`, `write_batches[${index}].batch_id`));
    else ids.add(batch.batch_id);
    if (!Number.isInteger(batch?.order)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'batch order must be integer.', `write_batches[${index}].order`));
    else if (orders.has(batch.order)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', `Duplicate batch order: ${batch.order}.`, `write_batches[${index}].order`));
    else orders.add(batch.order);
    if (!text(batch?.target_table)) concerns.push(issue('WRITE_PLAN_UNKNOWN_TABLE', 'target_table is required.', `write_batches[${index}].target_table`));
    if (!text(batch?.operation_mode)) concerns.push(issue('WRITE_PLAN_INVALID_OPERATION', 'operation_mode is required.', `write_batches[${index}].operation_mode`));
    if (!Array.isArray(batch?.records)) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'batch.records must be an array.', `write_batches[${index}].records`));
  }
  const order = array(plan.transaction?.write_order);
  if (order.length !== ids.size || new Set(order).size !== ids.size || [...ids].some((id) => !order.includes(id))) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'transaction.write_order must contain every batch exactly once.', 'transaction.write_order'));
  const byId = new Map(batches.map((batch) => [batch.batch_id, batch]));
  for (const batch of batches) for (const dependency of array(batch.depends_on_batches)) if (dependency !== 'all_previous_batches' && !byId.has(dependency)) concerns.push(issue('WRITE_PLAN_DEPENDENCY_INVALID', `${batch.batch_id} depends on missing batch ${dependency}.`, `write_batches.${batch.batch_id}.depends_on_batches`));
  concerns.push(...detectDependencyCycles(byId));
  return concerns;
}

function detectDependencyCycles(byId) {
  const concerns = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (!byId.has(id) || visited.has(id)) return;
    if (visiting.has(id)) {
      concerns.push(issue('WRITE_PLAN_DEPENDENCY_CYCLE', `Dependency cycle contains ${id}.`, `write_batches.${id}`));
      return;
    }
    visiting.add(id);
    for (const dep of array(byId.get(id)?.depends_on_batches)) if (dep !== 'all_previous_batches') visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return concerns;
}

function validatePlanAgainstDatabaseSchema(plan, snapshot) {
  const concerns = [];
  const tables = new Map(array(snapshot?.tables).map((table) => [tableName(table), table]));
  const globalOperations = new Set(array(snapshot?.allowed_operations));
  const enums = new Map(array(snapshot?.enum_definitions).map((item) => [item.name ?? item.enum_name, new Set(array(item.values))]));
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    const table = tables.get(batch.target_table);
    if (!table) {
      concerns.push(issue('WRITE_PLAN_UNKNOWN_TABLE', `Unknown target table: ${batch.target_table}.`, `write_batches[${batchIndex}].target_table`));
      continue;
    }
    const allowedOps = new Set(array(table.allowed_operations).length ? array(table.allowed_operations) : [...globalOperations]);
    if (!allowedOps.has(batch.operation_mode)) concerns.push(issue('WRITE_PLAN_INVALID_OPERATION', `Operation ${batch.operation_mode} is not allowed for ${batch.target_table}.`, `write_batches[${batchIndex}].operation_mode`));
    const columns = new Map(array(table.columns).map((column) => [column.name ?? column.column_name, column]));
    for (const [recordIndex, record] of array(batch.records).entries()) {
      if (!isObject(record)) {
        concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'Each record must be an object.', `write_batches[${batchIndex}].records[${recordIndex}]`));
        continue;
      }
      for (const [key, value] of Object.entries(record)) {
        const column = columns.get(key);
        if (!column) {
          concerns.push(issue('WRITE_PLAN_UNKNOWN_COLUMN', `Unknown column ${batch.target_table}.${key}.`, `write_batches[${batchIndex}].records[${recordIndex}].${key}`));
          continue;
        }
        const enumName = column.enum_name ?? column.enum;
        if (enumName && enums.has(enumName) && value != null && !enums.get(enumName).has(value)) concerns.push(issue('WRITE_PLAN_ENUM_INVALID', `Invalid enum value for ${batch.target_table}.${key}.`, `write_batches[${batchIndex}].records[${recordIndex}].${key}`));
      }
      for (const column of columns.values()) {
        const name = column.name ?? column.column_name;
        if ((column.required === true || column.nullable === false) && column.default == null && record[name] == null) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Required column missing: ${batch.target_table}.${name}.`, `write_batches[${batchIndex}].records[${recordIndex}].${name}`));
      }
    }
  }
  return concerns;
}

function validateApprovedReferences(plan, input) {
  const concerns = [];
  const refs = buildApprovedReferenceIndex(input);
  walk(plan.write_batches, (key, value, path) => {
    if (!text(value)) return;
    const rule = referenceRule(key);
    if (!rule) return;
    const set = refs[rule.set];
    if (set.size > 0 && !set.has(value)) concerns.push(issue(rule.code, `${key} is not present in approved Stage 24 inputs: ${value}.`, path));
  }, 'write_batches');
  const expectedPosition = findCurrentPosition(input.approved_pipeline_outputs);
  if (expectedPosition) {
    for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
      const planned = findFirstField(plan.write_batches, key, /position|party_state/i);
      if (planned != null && expectedPosition[key] != null && planned !== expectedPosition[key]) concerns.push(issue('WRITE_PLAN_POSITION_MISMATCH', `Planned ${key} differs from approved current position.`, `write_batches.${key}`));
    }
  }
  return concerns;
}

function validateKnowledgeProjection(plan, input) {
  const concerns = [];
  const expected = input.approved_pipeline_outputs?.character_knowledge_write_projection?.projection_manifest;
  const actual = plan.knowledge_projection_validation;
  if (!isObject(expected) || !isObject(actual)) return [issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'knowledge projection validation is required.', 'knowledge_projection_validation')];
  if (actual.source_content_hash !== expected.source_content_hash) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge source_content_hash mismatch.', 'knowledge_projection_validation.source_content_hash'));
  if (canonicalJson(actual.expected_counts) !== canonicalJson(expected.expected_counts)) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge expected_counts mismatch.', 'knowledge_projection_validation.expected_counts'));
  if (canonicalJson(array(actual.expected_record_keys).slice().sort()) !== canonicalJson(array(expected.expected_record_keys).slice().sort())) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge expected_record_keys mismatch.', 'knowledge_projection_validation.expected_record_keys'));
  if (canonicalJson(actual.planned_counts) !== canonicalJson(expected.expected_counts)) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge planned_counts must equal expected_counts.', 'knowledge_projection_validation.planned_counts'));
  if (canonicalJson(array(actual.planned_record_keys).slice().sort()) !== canonicalJson(array(expected.expected_record_keys).slice().sort())) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_EXTRA', 'Knowledge planned_record_keys must exactly equal expected_record_keys.', 'knowledge_projection_validation.planned_record_keys'));
  return concerns;
}

function validateHiddenVisibleBoundary(plan) {
  const concerns = [];
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    if (WORLD_BASE_PATTERN.test(batch.target_table ?? '')) concerns.push(issue('WRITE_PLAN_WORLD_BASE_MUTATION', 'Stage 24 cannot write to world_base.', `write_batches[${batchIndex}].target_table`));
    if (PUBLIC_TABLE_PATTERN.test(batch.target_table ?? '')) {
      walk(batch.records, (key, value, path) => {
        if (HIDDEN_FIELD_PATTERN.test(key) && value != null && value !== '' && !(Array.isArray(value) && value.length === 0)) concerns.push(issue('WRITE_PLAN_HIDDEN_PUBLIC_LEAK', 'Hidden-only field cannot be written to player-facing table.', `write_batches[${batchIndex}].${path}`));
      });
    }
    walk(batch.records, (key, value, path) => {
      if (PLAYER_OUTPUT_FIELD_PATTERN.test(key) && value === true) concerns.push(issue('WRITE_PLAN_PLAYER_OUTPUT_BEFORE_COMMIT', 'Player output cannot be marked committed inside Stage 24 plan.', `write_batches[${batchIndex}].${path}`));
    });
  }
  return concerns;
}

function validateSourceTrace(plan) {
  const concerns = [];
  if (!Array.isArray(plan.source_trace) || plan.source_trace.length === 0) concerns.push(issue('WRITE_PLAN_SOURCE_TRACE_INCOMPLETE', 'Top-level source_trace must be non-empty.', 'source_trace'));
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    const batchTrace = array(batch.source_trace);
    for (const [recordIndex, record] of array(batch.records).entries()) {
      const recordTrace = array(record?.source_trace);
      if (batchTrace.length === 0 && recordTrace.length === 0) concerns.push(issue('WRITE_PLAN_SOURCE_TRACE_INCOMPLETE', 'Every record requires record or batch source_trace.', `write_batches[${batchIndex}].records[${recordIndex}].source_trace`));
    }
  }
  return concerns;
}

function validateRollback(plan) {
  const concerns = [];
  const rollback = plan.rollback_plan;
  if (!isObject(rollback) || rollback.strategy !== 'full_transaction_rollback') concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', 'rollback_plan.strategy must be full_transaction_rollback.', 'rollback_plan.strategy'));
  const covered = new Set(array(rollback?.covered_batch_ids));
  for (const batch of array(plan.write_batches)) if (!covered.has(batch.batch_id)) concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', `Rollback does not cover batch ${batch.batch_id}.`, 'rollback_plan.covered_batch_ids'));
  return concerns;
}

function validateAuditSnapshots(plan, input) {
  const concerns = [];
  const snapshots = array(plan.audit_snapshots);
  if (snapshots.length === 0) return [issue('WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE', 'audit_snapshots must be non-empty.', 'audit_snapshots')];
  const stages = new Set(snapshots.map((item) => Number(item?.stage_id)).filter(Number.isFinite));
  for (const stageId of [10, 12, 14, 15, 16, 17, 18, 19, 21, 23]) if (!stages.has(stageId)) concerns.push(issue('WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE', `Missing audit snapshot for stage ${stageId}.`, 'audit_snapshots'));
  if (plan.source_input_digest !== input.party_db_write_plan_input_digest) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Plan source input digest is stale.', 'source_input_digest'));
  return concerns;
}

function validateForbiddenWrites(plan) {
  const concerns = [];
  if (!Array.isArray(plan.forbidden_writes) || plan.forbidden_writes.length === 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'forbidden_writes must be non-empty.', 'forbidden_writes'));
  const serialized = canonicalJson(plan.forbidden_writes);
  if (!/world_base/i.test(serialized)) concerns.push(issue('WRITE_PLAN_WORLD_BASE_MUTATION', 'forbidden_writes must explicitly forbid world_base mutation.', 'forbidden_writes'));
  if (!/hidden/i.test(serialized)) concerns.push(issue('WRITE_PLAN_HIDDEN_PUBLIC_LEAK', 'forbidden_writes must explicitly forbid hidden-to-public writes.', 'forbidden_writes'));
  return concerns;
}

function validateSelfAudit(plan) {
  const concerns = [];
  if (plan.self_audit?.pass !== true) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.pass must be true.', 'self_audit.pass'));
  if (!Array.isArray(plan.self_audit?.concerns) || plan.self_audit.concerns.length > 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.concerns must be an empty array.', 'self_audit.concerns'));
  if (!Array.isArray(plan.self_audit?.evidence) || plan.self_audit.evidence.length === 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.evidence must be non-empty.', 'self_audit.evidence'));
  return concerns;
}

function buildApprovedReferenceIndex(input) {
  const sets = {
    npcIds: new Set(), itemIds: new Set(), containerIds: new Set(), anchorIds: new Set(), routeIds: new Set(), playerCharacterIds: new Set()
  };
  const outputs = input.approved_pipeline_outputs ?? {};
  collectIds(outputs.initial_npc_placement, sets, 'npc');
  collectIds(outputs.initial_item_placement, sets, 'item');
  collectIds(outputs.initial_item_placement, sets, 'container');
  collectIds(outputs.g5_scene_graph, sets, 'anchor');
  collectIds(outputs.g5_scene_graph, sets, 'route');
  collectIds(outputs.character_knowledge_map, sets, 'route');
  collectIds(outputs.player_character, sets, 'playerCharacter');
  for (const value of array(input.world_base_reference_snapshot?.allowed_graph_edge_ids)) sets.routeIds.add(value);
  return sets;
}

function collectIds(value, sets, kind) {
  const rules = {
    npc: { keys: /^(npc_id|npc_instance_id|actor_id|id)$/i, set: sets.npcIds },
    item: { keys: /^(item_id|item_instance_id|id)$/i, set: sets.itemIds },
    container: { keys: /^(container_id|container_instance_id|id)$/i, set: sets.containerIds },
    anchor: { keys: /^(anchor_id|g5_anchor_id|id)$/i, set: sets.anchorIds },
    route: { keys: /^(route_id|edge_id|g5_edge_id|graph_edge_id|id)$/i, set: sets.routeIds },
    playerCharacter: { keys: /^(player_character_id|character_id|id)$/i, set: sets.playerCharacterIds }
  };
  const rule = rules[kind];
  walk(value, (key, current) => { if (rule.keys.test(key) && text(current)) rule.set.add(current); });
}

function referenceRule(key) {
  if (/^(npc_id|npc_instance_id|actor_id)$/i.test(key)) return { set: 'npcIds', code: 'WRITE_PLAN_UNAPPROVED_NPC' };
  if (/^(item_id|item_instance_id)$/i.test(key)) return { set: 'itemIds', code: 'WRITE_PLAN_UNAPPROVED_ITEM' };
  if (/^(container_id|container_instance_id)$/i.test(key)) return { set: 'containerIds', code: 'WRITE_PLAN_UNAPPROVED_CONTAINER' };
  if (/^(anchor_id|g5_anchor_id)$/i.test(key)) return { set: 'anchorIds', code: 'WRITE_PLAN_UNAPPROVED_ANCHOR' };
  if (/^(route_id|edge_id|g5_edge_id|graph_edge_id)$/i.test(key)) return { set: 'routeIds', code: 'WRITE_PLAN_UNAPPROVED_ROUTE' };
  if (/^(player_character_id|character_id)$/i.test(key)) return { set: 'playerCharacterIds', code: 'WRITE_PLAN_INPUT_BINDING_INVALID' };
  return null;
}

function findCurrentPosition(outputs) {
  return outputs?.character_knowledge_map?.current_position_ref
    ?? outputs?.g5_scene_graph?.player_start_position
    ?? outputs?.visible_context_package?.frame?.position
    ?? outputs?.visible_context_package?.frame?.current_position
    ?? null;
}

function currentPositionMatchesApprovedScene(outputs) {
  const position = findCurrentPosition(outputs);
  if (!position) return false;
  const start = outputs?.g5_scene_graph?.player_start_position ?? {};
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
    if (position[key] != null && start[key] != null && position[key] !== start[key]) return false;
  }
  return true;
}

function findFirstField(value, key, tablePattern) {
  for (const batch of array(value)) {
    if (!tablePattern.test(batch?.target_table ?? '')) continue;
    for (const record of array(batch.records)) if (record?.[key] != null) return record[key];
  }
  return null;
}

function validateRouteCompatibility(route, audit) {
  const concerns = [];
  const codes = new Set(array(route.supporting_concern_codes));
  const selected = route.return_to_stage;
  if (selected === 'party_db_write_plan_format_repair' && [...codes].some((code) => !FORMAT_PLAN_CODES.has(code))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Format repair route is incompatible with semantic concerns.', 'route.return_to_stage'));
  if (selected === 'party_database_schema_reload' && ![...codes].some((code) => ['WRITE_PLAN_UNKNOWN_TABLE', 'WRITE_PLAN_UNKNOWN_COLUMN', 'WRITE_PLAN_DATABASE_SCHEMA_INVALID'].includes(code))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Schema reload route requires schema concern.', 'route.return_to_stage'));
  if (selected === 'character_knowledge_projection_repair' && ![...codes].some((code) => code.includes('KNOWLEDGE_PROJECTION'))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Knowledge projection repair route requires knowledge concern.', 'route.return_to_stage'));
  if (audit.pass === true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Router cannot run for passing audit.', 'route'));
  return concerns;
}

function buildBuilderRoleInput(input) {
  return {
    version: 1,
    schema: 'party_db_write_plan_builder_request',
    request_id: input.request_id,
    party_creation_context: safeClone(input.party_creation_context),
    approved_pipeline_outputs: safeClone(input.approved_pipeline_outputs),
    approved_pipeline_manifest: safeClone(input.approved_pipeline_manifest),
    party_database_schema: safeClone(input.party_database_schema),
    world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot),
    write_policy: safeClone(input.write_policy),
    binding: {
      source_input_digest: input.party_db_write_plan_input_digest,
      party_database_schema_digest: input.party_database_schema_digest,
      world_base_reference_digest: input.world_base_reference_digest,
      approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest
    },
    output_contract: { version: 1, schema: STAGE24_PLAN_SCHEMA },
    constraints: {
      no_database_write: true,
      no_sql_execution: true,
      no_new_world_facts: true,
      no_new_ids_for_approved_entities: true,
      map_approved_data_only: true
    }
  };
}

function buildPlanFormatRepairInput(input, raw, parseError = null, validationErrors = []) {
  return {
    version: 1,
    schema: 'party_db_write_plan_format_repair_input',
    request_id: input.request_id,
    raw_builder_response: typeof raw === 'string' ? raw : null,
    parsed_builder_response: typeof raw === 'string' ? null : safeClone(raw),
    parse_error: parseError,
    validation_errors: safeClone(validationErrors),
    required_schema: { version: 1, schema: STAGE24_PLAN_SCHEMA },
    original_input_digest: input.party_db_write_plan_input_digest,
    constraints: {
      change_format_only: true,
      do_not_add_or_remove_records: true,
      do_not_change_ids: true,
      do_not_change_semantic_mapping: true,
      do_not_create_world_facts: true
    }
  };
}

function buildAuditorRoleInput(input, plan, planDigest, extra = {}) {
  return {
    version: 1,
    schema: 'party_db_write_plan_auditor_request',
    request_id: input.request_id,
    party_db_write_plan: safeClone(plan),
    party_db_write_plan_digest: planDigest,
    approved_pipeline_manifest: safeClone(input.approved_pipeline_manifest),
    approved_pipeline_outputs: safeClone(input.approved_pipeline_outputs),
    party_database_schema: safeClone(input.party_database_schema),
    world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot),
    write_policy: safeClone(input.write_policy),
    output_contract: { version: 1, schema: STAGE24_AUDIT_SCHEMA },
    ...safeClone(extra)
  };
}

function buildAuditFormatRepairInput(input, plan, planDigest, rawAudit, validationErrors) {
  return {
    version: 1,
    schema: 'party_db_write_plan_audit_format_repair_input',
    request_id: input.request_id,
    party_db_write_plan_digest: planDigest,
    raw_audit_response: typeof rawAudit === 'string' ? rawAudit : null,
    parsed_audit_response: typeof rawAudit === 'string' ? null : safeClone(rawAudit),
    audit_validation_errors: safeClone(validationErrors),
    required_schema: { version: 1, schema: STAGE24_AUDIT_SCHEMA },
    constraints: {
      change_format_only: true,
      do_not_change_pass_semantics: true,
      do_not_add_or_remove_findings: true,
      do_not_create_evidence: true,
      do_not_change_plan: true
    },
    plan_binding: { digest: planDigest, request_id: plan.request_id }
  };
}

function buildRouterRoleInput(input, audit) {
  return {
    version: 1,
    schema: 'party_db_write_plan_router_input',
    request_id: input.request_id,
    failed_checks: REQUIRED_AUDIT_CHECKS.filter((key) => audit.checks?.[key]?.pass === false),
    concerns: safeClone(audit.concerns),
    evidence: safeClone(audit.evidence),
    allowed_routes: [...STAGE24_REPAIR_ROUTES],
    output_contract: { version: 1, schema: STAGE24_ROUTE_SCHEMA }
  };
}

function buildPlanSemanticRepairInput(input, plan, concerns, audit, repairHistory, route = null) {
  return {
    version: 1,
    schema: 'party_db_write_plan_semantic_repair_input',
    request_id: input.request_id,
    original_input: safeClone(input),
    failed_party_db_write_plan: safeClone(plan),
    audit: safeClone(audit),
    concerns: safeClone(concerns),
    repair_route: safeClone(route),
    repair_history: safeClone(repairHistory),
    allowed_mutable_paths: safeClone(route?.allowed_mutable_paths ?? ['write_batches', 'transaction.write_order', 'preconditions', 'postconditions', 'rollback_plan', 'source_trace', 'audit_snapshots', 'knowledge_projection_validation', 'self_audit']),
    forbidden_mutable_paths: safeClone(route?.forbidden_mutable_paths ?? ['approved_pipeline_outputs', 'party_database_schema', 'world_base_reference_snapshot', 'party_creation_context']),
    constraints: { no_new_world_facts: true, no_upstream_mutation: true, preserve_approved_ids: true }
  };
}

function buildSeniorBuilderInput(input, plan, audit, route, repairHistory) {
  return {
    ...buildBuilderRoleInput(input),
    schema: 'party_db_write_plan_senior_builder_request',
    previous_failed_plan: safeClone(plan),
    failed_audit: safeClone(audit),
    repair_route: safeClone(route),
    repair_history: safeClone(repairHistory),
    reasoning_requirement: 'max'
  };
}

function historyEntry(kind, role, issueCodes) {
  return { attempt_index: Date.now(), kind, role, issue_codes: [...new Set(array(issueCodes).filter(text))] };
}

async function callRole(callback, payload, role) {
  const result = await callback(safeClone(payload));
  if (result == null) throw new Error(`${role} returned no result.`);
  return result?.output ?? result?.parsed_json ?? result;
}

function parseRoleResult(value) {
  if (typeof value === 'string') {
    try { return { value: JSON.parse(stripMarkdownFence(value)), raw: value, parseError: null }; }
    catch (error) { return { value: null, raw: value, parseError: error.message }; }
  }
  return { value: safeClone(value), raw: value, parseError: null };
}

function unwrapRoleResult(value) {
  return parseRoleResult(value).value;
}

function stripMarkdownFence(value) {
  return String(value).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function stage24Error(message, concerns = [], failedGate = null, repairRoute = null) {
  const error = new Error(`${message}${concerns.length ? ` ${concerns.map((item) => item.code).join(',')}` : ''}`);
  error.lifecycle = {
    stage_id: 24,
    stage_slug: 'party_write_plan',
    stage_type: 'isolated_llm_block',
    failed_gate: failedGate,
    concerns: safeClone(concerns),
    repair_route: safeClone(repairRoute),
    terminal_status: repairRoute ? 'repair_required' : 'stage_failed'
  };
  return error;
}

function issue(code, message, path = null, severity = null) {
  return { code, severity: severity ?? defaultSeverity(code), message, path };
}

function defaultSeverity(code) {
  if (FORMAT_PLAN_CODES.has(code) || code === 'WRITE_PLAN_AUDIT_INVALID') return 'format_error';
  if (code.includes('INPUT_BINDING') || code.includes('MANIFEST') || code.includes('DATABASE_SCHEMA')) return 'upstream_block';
  if (code.includes('WORLD_BASE') || code.includes('HIDDEN_PUBLIC') || code.includes('NON_ATOMIC')) return 'hard_block';
  return 'repairable';
}

function passCheck(pass) { return { pass: Boolean(pass) }; }
function tableName(table) { return table?.name ?? table?.table_name ?? null; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function safeClone(value) { return value == null ? value : structuredClone(value); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function walk(value, callback, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, callback, path ? `${path}[${index}]` : `[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, current] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    callback(key, current, currentPath);
    walk(current, callback, currentPath);
  }
}
