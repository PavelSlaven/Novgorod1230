import {
  buildStage24WritePlanApproval,
  computePartyDbWritePlanDigest,
  computeStage24ArtifactDigest,
  computeStage25ArtifactDigest,
  STAGE24_MANIFEST_SCHEMA,
  STAGE24_PLAN_SCHEMA,
  STAGE24_RESULT_SCHEMA,
  validatePartyDatabaseSchemaSnapshotContract,
  validateWorldBaseReferenceSnapshotContract
} from '@rus/contracts';
import {
  FORBIDDEN_STAGE25_INPUT_KEYS,
  REQUIRED_AUDIT_ARTIFACT_KEYS,
  REQUIRED_COMMIT_POLICY,
  REQUIRED_MANIFEST_ARTIFACT_KEYS,
  SHA256_PATTERN,
  STAGE25_INPUT_SCHEMA
} from '../policy/constants.js';
import { array, isObject, issue, safeClone, sortValue, text } from '../shared/utils.js';

const buildStage24Approval = buildStage24WritePlanApproval;
const computeStage24Digest = computeStage24ArtifactDigest;
const validatePartyDatabaseSchemaSnapshot = validatePartyDatabaseSchemaSnapshotContract;
const validateWorldBaseReferenceSnapshot = validateWorldBaseReferenceSnapshotContract;
export function canonicalStage25Json(value) {
  return JSON.stringify(sortValue(value));
}

export function computeStage25Digest(value) {
  return computeStage25ArtifactDigest(value);
}

export function normalizeStage25CommitPolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 25 additional_commit_policy must be an object.');
  for (const [key, value] of Object.entries(additionalPolicy)) {
    if (Object.hasOwn(REQUIRED_COMMIT_POLICY, key) && value !== true) {
      throw new Error(`Stage 25 commit policy cannot weaken required invariant: ${key}.`);
    }
  }
  return Object.freeze({ ...REQUIRED_COMMIT_POLICY, ...safeClone(additionalPolicy) });
}

export function buildStage25CommitInput({
  request_id,
  party_creation_context,
  stage24_result,
  party_database_schema,
  world_base_reference_snapshot,
  approved_pipeline_manifest,
  additional_commit_policy = {}
} = {}) {
  if (!isObject(stage24_result) || stage24_result.schema !== STAGE24_RESULT_SCHEMA || stage24_result.pass !== true) {
    throw new Error('Stage 25 requires a successful Stage 24 result bundle.');
  }
  const partyContext = safeClone(party_creation_context ?? {});
  if (!text(partyContext.payload_hash)) {
    partyContext.payload_hash = computeStage25Digest({
      party_id: partyContext.party_id ?? null,
      player_character_id: partyContext.player_character_id ?? null,
      idempotency_key: partyContext.idempotency_key ?? null,
      party_db_write_plan_digest: stage24_result.party_db_write_plan_digest ?? null,
      approved_pipeline_manifest_digest: stage24_result.approved_pipeline_manifest_digest ?? null
    });
  }
  return {
    version: 1,
    schema: STAGE25_INPUT_SCHEMA,
    request_id,
    party_creation_context: partyContext,
    stage24_result_approval: buildStage24Approval(stage24_result),
    party_db_write_plan: safeClone(stage24_result.party_db_write_plan),
    party_database_schema: safeClone(party_database_schema),
    world_base_reference_snapshot: safeClone(world_base_reference_snapshot),
    approved_pipeline_manifest: safeClone(approved_pipeline_manifest),
    commit_policy: normalizeStage25CommitPolicy(additional_commit_policy)
  };
}

export function validateStage25CommitInput(input = {}) {
  const concerns = [];
  if (!isObject(input) || input.version !== 1 || input.schema !== STAGE25_INPUT_SCHEMA) {
    return [issue('STAGE25_INPUT_SCHEMA_INVALID', 'commit_gate_input version 1 is required.', 'input')];
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_STAGE25_INPUT_KEYS.has(key)) concerns.push(issue('STAGE25_FORBIDDEN_INPUT_FIELD', `Forbidden Stage 25 input field: ${key}.`, key));
  }
  if (!text(input.request_id)) concerns.push(issue('STAGE25_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  concerns.push(...validatePartyCreationContext(input.party_creation_context, input.request_id));
  concerns.push(...validateStage24ApprovalBinding(input));
  concerns.push(...validateManifestStructure(input.approved_pipeline_manifest, input.request_id));
  for (const item of validatePartyDatabaseSchemaSnapshot(input.party_database_schema)) {
    concerns.push(issue('STAGE25_DB_SCHEMA_INVALID', item.message, item.path ?? 'party_database_schema'));
  }
  for (const item of validateWorldBaseReferenceSnapshot(input.world_base_reference_snapshot)) {
    concerns.push(issue('STAGE25_WORLD_REFERENCE_INVALID', item.message, item.path ?? 'world_base_reference_snapshot'));
  }
  for (const [key, expected] of Object.entries(REQUIRED_COMMIT_POLICY)) {
    if (input.commit_policy?.[key] !== expected) concerns.push(issue('STAGE25_POLICY_WEAKENED', `commit_policy.${key} must remain ${String(expected)}.`, `commit_policy.${key}`));
  }
  if (input.party_db_write_plan?.schema !== STAGE24_PLAN_SCHEMA || input.party_db_write_plan?.version !== 1) {
    concerns.push(issue('STAGE25_PLAN_SCHEMA_INVALID', 'party_db_write_plan version 1 is required.', 'party_db_write_plan'));
  }
  return concerns;
}

function validatePartyCreationContext(context, requestId) {
  const concerns = [];
  if (!isObject(context)) return [issue('STAGE25_PARTY_CONTEXT_INVALID', 'party_creation_context is required.', 'party_creation_context')];
  for (const key of ['party_id', 'player_character_id', 'schema_version', 'idempotency_key', 'payload_hash']) {
    if (!text(context[key])) concerns.push(issue('STAGE25_PARTY_CONTEXT_INVALID', `party_creation_context.${key} is required.`, `party_creation_context.${key}`));
  }
  if (context.schema_version !== 'party_runtime_v2') concerns.push(issue('STAGE25_PARTY_CONTEXT_INVALID', 'New parties require party_runtime_v2; legacy v1 is unsupported.', 'party_creation_context.schema_version'));
  for (const key of ['world_revision_id', 'world_catalog_digest', 'materializer_version', 'rng_version', 'command_catalog_digest', 'profile_bundle_digest']) {
    if (!text(context.version_pins?.[key])) concerns.push(issue('STAGE25_PARTY_CONTEXT_INVALID', `party_creation_context.version_pins.${key} is required.`, `party_creation_context.version_pins.${key}`));
  }
  if (text(context.payload_hash) && !SHA256_PATTERN.test(context.payload_hash)) concerns.push(issue('STAGE25_IDEMPOTENCY_CONTEXT_INVALID', 'party_creation_context.payload_hash must be sha256.', 'party_creation_context.payload_hash'));
  if (context.request_id != null && context.request_id !== requestId) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'party_creation_context.request_id mismatch.', 'party_creation_context.request_id'));
  return concerns;
}

function validateStage24ApprovalBinding(input) {
  const concerns = [];
  const approval = input.stage24_result_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== 'stage24_party_db_write_plan_approval' || approval.pass !== true) return [issue('STAGE25_STAGE24_APPROVAL_INVALID', 'Successful Stage 24 approval is required.', 'stage24_result_approval')];
  if (approval.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Stage 24 approval request_id mismatch.', 'stage24_result_approval.request_id'));
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) if (approval.permissions?.[key] !== true) concerns.push(issue('STAGE25_STAGE24_PERMISSION_DENIED', `Stage 24 permission ${key} must be true.`, `stage24_result_approval.permissions.${key}`));
  if (approval.party_db_write_plan_digest !== computePartyDbWritePlanDigest(input.party_db_write_plan)) concerns.push(issue('STAGE25_PLAN_DIGEST_MISMATCH', 'Stage 24 plan digest mismatch.', 'party_db_write_plan'));
  if (approval.party_database_schema_digest !== computeStage24Digest(input.party_database_schema)) concerns.push(issue('STAGE25_DB_SCHEMA_DIGEST_MISMATCH', 'Party database schema digest mismatch.', 'party_database_schema'));
  if (approval.world_base_reference_digest !== computeStage24Digest(input.world_base_reference_snapshot)) concerns.push(issue('STAGE25_WORLD_DIGEST_MISMATCH', 'World-base reference digest mismatch.', 'world_base_reference_snapshot'));
  if (approval.approved_pipeline_manifest_digest !== computeStage24Digest(input.approved_pipeline_manifest)) concerns.push(issue('STAGE25_MANIFEST_DIGEST_MISMATCH', 'Approved pipeline manifest digest mismatch.', 'approved_pipeline_manifest'));
  const tx = input.party_db_write_plan?.transaction;
  if (tx?.party_id !== input.party_creation_context?.party_id || tx?.idempotency_key !== input.party_creation_context?.idempotency_key || tx?.is_atomic !== true || tx?.is_dry_run_first !== true) concerns.push(issue('STAGE25_TRANSACTION_CONTRACT_INVALID', 'Stage 24 transaction contract does not match party_creation_context.', 'party_db_write_plan.transaction'));
  return concerns;
}

function validateManifestStructure(manifest, requestId) {
  const concerns = [];
  if (!isObject(manifest) || manifest.version !== 1 || manifest.schema !== STAGE24_MANIFEST_SCHEMA || manifest.request_id !== requestId) return [issue('STAGE25_MANIFEST_INVALID', 'Approved pipeline manifest schema/version/request_id is invalid.', 'approved_pipeline_manifest')];
  const entries = array(manifest.artifacts);
  const byKey = new Map();
  const stageKeys = new Set();
  for (const entry of entries) {
    if (!text(entry?.artifact_key) || !Number.isInteger(entry?.stage_id) || !text(entry?.artifact_schema) || !SHA256_PATTERN.test(entry?.artifact_digest ?? '')) {
      concerns.push(issue('STAGE25_MANIFEST_INVALID', 'Manifest entry is incomplete.', 'approved_pipeline_manifest.artifacts'));
      continue;
    }
    if (byKey.has(entry.artifact_key)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Duplicate manifest artifact_key ${entry.artifact_key}.`, 'approved_pipeline_manifest.artifacts'));
    const stageKey = `${entry.stage_id}:${entry.artifact_schema}`;
    if (stageKeys.has(stageKey)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Duplicate manifest stage/schema ${stageKey}.`, 'approved_pipeline_manifest.artifacts'));
    byKey.set(entry.artifact_key, entry);
    stageKeys.add(stageKey);
  }
  for (const key of REQUIRED_MANIFEST_ARTIFACT_KEYS) if (!byKey.has(key)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Manifest artifact missing: ${key}.`, 'approved_pipeline_manifest.artifacts'));
  for (const key of REQUIRED_AUDIT_ARTIFACT_KEYS) if (!byKey.has(key)) concerns.push(issue('STAGE25_AUDIT_CHAIN_INCOMPLETE', `Audit-chain artifact missing: ${key}.`, 'approved_pipeline_manifest.artifacts'));
  return concerns;
}
