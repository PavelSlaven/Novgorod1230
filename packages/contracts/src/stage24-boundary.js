import { computeCanonicalDigest } from './digests.js';

export const STAGE24_INPUT_SCHEMA = 'party_db_write_plan_input';
export const STAGE24_ROUTE_SCHEMA = 'party_db_write_plan_repair_route';
export const STAGE24_PRECHECK_SCHEMA = 'party_db_write_plan_code_precheck';
export const STAGE24_PLAN_SCHEMA = 'party_db_write_plan';
export const STAGE24_AUDIT_SCHEMA = 'party_db_write_plan_audit';
export const STAGE24_RESULT_SCHEMA = 'stage24_party_db_write_plan_result';
export const STAGE24_MANIFEST_SCHEMA = 'approved_pipeline_manifest';
export const PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA = 'party_database_schema_snapshot';
export const WORLD_BASE_REFERENCE_SCHEMA = 'world_base_reference_snapshot';
export const STAGE24_APPROVAL_SCHEMA = 'stage24_party_db_write_plan_approval';

export function computeStage24ArtifactDigest(value) {
  return computeCanonicalDigest(value);
}

export function computePartyDbWritePlanDigest(plan) {
  return computeStage24ArtifactDigest(plan);
}

export function buildStage24WritePlanApproval(result = {}) {
  return {
    version: 1,
    schema: STAGE24_APPROVAL_SCHEMA,
    request_id: result.request_id ?? null,
    pass: result.pass === true,
    party_db_write_plan_digest: result.party_db_write_plan_digest ?? null,
    party_database_schema_digest: result.party_database_schema_digest ?? null,
    world_base_reference_digest: result.world_base_reference_digest ?? null,
    approved_pipeline_manifest_digest: result.approved_pipeline_manifest_digest ?? null,
    permissions: clone(result.handoff_permission ?? {})
  };
}

export function validateStage24WritePlanApproval(approval = {}, binding = {}) {
  const concerns = [];
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE24_APPROVAL_SCHEMA || approval.pass !== true) {
    return [issue('STAGE25_STAGE24_APPROVAL_INVALID', 'Successful Stage 24 approval is required.', 'stage24_result_approval')];
  }
  if (binding.request_id != null && approval.request_id !== binding.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Stage 24 approval request_id mismatch.', 'stage24_result_approval.request_id'));
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) {
    if (approval.permissions?.[key] !== true) concerns.push(issue('STAGE25_STAGE24_PERMISSION_DENIED', `Stage 24 permission ${key} must be true.`, `stage24_result_approval.permissions.${key}`));
  }
  if (binding.party_db_write_plan && approval.party_db_write_plan_digest !== computePartyDbWritePlanDigest(binding.party_db_write_plan)) concerns.push(issue('STAGE25_PLAN_DIGEST_MISMATCH', 'Stage 24 plan digest mismatch.', 'party_db_write_plan'));
  if (binding.party_database_schema && approval.party_database_schema_digest !== computeStage24ArtifactDigest(binding.party_database_schema)) concerns.push(issue('STAGE25_DB_SCHEMA_DIGEST_MISMATCH', 'Party database schema digest mismatch.', 'party_database_schema'));
  if (binding.world_base_reference_snapshot && approval.world_base_reference_digest !== computeStage24ArtifactDigest(binding.world_base_reference_snapshot)) concerns.push(issue('STAGE25_WORLD_DIGEST_MISMATCH', 'World-base reference digest mismatch.', 'world_base_reference_snapshot'));
  if (binding.approved_pipeline_manifest && approval.approved_pipeline_manifest_digest !== computeStage24ArtifactDigest(binding.approved_pipeline_manifest)) concerns.push(issue('STAGE25_MANIFEST_DIGEST_MISMATCH', 'Approved pipeline manifest digest mismatch.', 'approved_pipeline_manifest'));
  return concerns;
}

export function validatePartyDatabaseSchemaSnapshotContract(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA) {
    return [issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `Expected ${PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA} version 1.`, 'party_database_schema')];
  }
  if (!text(snapshot.schema_version)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database schema_version is required.', 'party_database_schema.schema_version'));
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database readonly_checksum is required.', 'party_database_schema.readonly_checksum'));
  for (const key of ['tables', 'foreign_keys', 'unique_constraints', 'check_constraints', 'enum_definitions', 'indexes', 'allowed_operations']) {
    if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `party_database_schema.${key} must be an array.`, `party_database_schema.${key}`));
  }
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length === 0) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party_database_schema.tables must be non-empty.', 'party_database_schema.tables'));
  else for (const [index, table] of snapshot.tables.entries()) {
    if (!text(table?.name ?? table?.table_name)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires name/table_name.', `party_database_schema.tables[${index}]`));
    if (!Array.isArray(table.columns) || table.columns.length === 0) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires non-empty columns.', `party_database_schema.tables[${index}].columns`));
  }
  return concerns;
}

export function validateWorldBaseReferenceSnapshotContract(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== WORLD_BASE_REFERENCE_SCHEMA) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Expected ${WORLD_BASE_REFERENCE_SCHEMA} version 1.`, 'world_base_reference_snapshot')];
  }
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'world_base_reference_snapshot.readonly_checksum is required.', 'world_base_reference_snapshot.readonly_checksum'));
  for (const key of ['allowed_region_ids','allowed_graph_node_ids','allowed_graph_edge_ids','allowed_place_template_ids','allowed_npc_candidate_ids','allowed_item_profile_ids','allowed_container_profile_ids','allowed_property_rule_ids','allowed_source_ids']) {
    if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `world_base_reference_snapshot.${key} must be an array.`, `world_base_reference_snapshot.${key}`));
  }
  return concerns;
}

export function validateStage24ToStage25HandoffContract({ stage24_result, party_database_schema, approved_pipeline_manifest } = {}) {
  const concerns = [];
  const result = stage24_result;
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE24_RESULT_SCHEMA || result.pass !== true) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Successful Stage 24 result bundle is required.', 'stage24_result')];
  }
  if (result.party_db_write_plan_code_precheck?.schema !== STAGE24_PRECHECK_SCHEMA || result.party_db_write_plan_code_precheck?.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 precheck must pass.', 'stage24_result.party_db_write_plan_code_precheck'));
  if (result.party_db_write_plan_audit?.schema !== STAGE24_AUDIT_SCHEMA || result.party_db_write_plan_audit?.pass !== true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Stage 24 audit must pass.', 'stage24_result.party_db_write_plan_audit'));
  if (result.repair_route != null) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Successful Stage 24 result cannot contain repair_route.', 'stage24_result.repair_route'));
  for (const key of ['can_send_to_commit_gate','can_execute_transaction','can_write_party_snapshots']) if (result.handoff_permission?.[key] !== true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `handoff_permission.${key} must be true.`, `stage24_result.handoff_permission.${key}`));
  if (result.party_db_write_plan_digest !== computePartyDbWritePlanDigest(result.party_db_write_plan)) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Stage 24 plan digest mismatch.', 'stage24_result.party_db_write_plan_digest'));
  if (result.party_db_write_plan_audit?.party_db_write_plan_digest !== result.party_db_write_plan_digest) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Stage 24 audit is stale for current plan.', 'stage24_result.party_db_write_plan_audit.party_db_write_plan_digest'));
  if (result.party_database_schema_digest !== computeStage24ArtifactDigest(party_database_schema)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Stage 25 party database schema is stale.', 'party_database_schema'));
  if (result.approved_pipeline_manifest_digest !== computeStage24ArtifactDigest(approved_pipeline_manifest)) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'Stage 25 approved pipeline manifest is stale.', 'approved_pipeline_manifest'));
  return concerns;
}

function clone(value) { return value == null ? value : structuredClone(value); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function issue(code, message, path = null) { return { code, severity: 'hard_block', message, ...(path ? { path } : {}) }; }
