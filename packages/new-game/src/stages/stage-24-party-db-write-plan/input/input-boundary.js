import {
  computeMaterializationEnvelopeDigest,
  PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA,
  STAGE24_INPUT_SCHEMA,
  STAGE24_MANIFEST_SCHEMA,
  WORLD_BASE_REFERENCE_SCHEMA
} from '@rus/contracts';
import {
  artifactStageIdForProfile,
  FORBIDDEN_INPUT_KEYS,
  isLowerDvinaTracePhase1AInput,
  LOWER_DVINA_TRACE_PHASE_1A_PIPELINE_PROFILE,
  requiredArtifactKeysForInput,
  REQUIRED_WRITE_POLICY
} from '../policy/constants.js';
import {
  array,
  computeStage24Digest,
  isObject,
  issue,
  safeClone,
  tableName,
  text
} from '../shared/utils.js';

export function normalizeStage24WritePolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 24 additional_write_policy must be an object.');
  for (const [key, value] of Object.entries(additionalPolicy)) {
    if (Object.hasOwn(REQUIRED_WRITE_POLICY, key) && value !== true) {
      throw new Error(`Stage 24 write policy cannot weaken required invariant: ${key}.`);
    }
  }
  return Object.freeze({ ...REQUIRED_WRITE_POLICY, ...safeClone(additionalPolicy) });
}

export function buildApprovedPipelineManifest({ request_id, artifacts, pipeline_profile } = {}) {
  if (!text(request_id)) throw new Error('approved pipeline manifest requires request_id.');
  if (!isObject(artifacts)) throw new Error('approved pipeline manifest requires artifacts.');
  const profileInput = { pipeline_profile };
  const artifactKeys = requiredArtifactKeysForInput(profileInput);
  return {
    version: 1,
    schema: STAGE24_MANIFEST_SCHEMA,
    request_id,
    ...(pipeline_profile ? { manifest_kind: pipeline_profile } : {}),
    artifacts: artifactKeys.map((artifactKey) => ({
      artifact_key: artifactKey,
      stage_id: artifactStageIdForProfile(artifactKey, pipeline_profile),
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
  pipeline_profile = null,
  additional_write_policy = {}
} = {}) {
  if (!isObject(approved_pipeline_outputs)) throw new Error('Stage 24 requires approved_pipeline_outputs.');
  if (!isObject(party_database_schema)) throw new Error('Stage 24 requires party_database_schema snapshot.');
  if (!isObject(world_base_reference_snapshot)) throw new Error('Stage 24 requires world_base_reference_snapshot.');
  const outputs = safeClone(approved_pipeline_outputs ?? {});
  const manifest = approved_pipeline_manifest
    ? safeClone(approved_pipeline_manifest)
    : buildApprovedPipelineManifest({ request_id, artifacts: outputs, pipeline_profile });
  const schemaSnapshot = safeClone(party_database_schema);
  const worldSnapshot = safeClone(world_base_reference_snapshot);
  const input = {
    version: 1,
    schema: STAGE24_INPUT_SCHEMA,
    request_id,
    ...(pipeline_profile ? { pipeline_profile } : {}),
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
  input.party_db_write_plan_input_digest = computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  return input;
}

export function validateStage24Input(input = {}) {
  const concerns = [];
  if (!isObject(input) || input.version !== 1 || input.schema !== STAGE24_INPUT_SCHEMA) {
    return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 input must be party_db_write_plan_input version 1.', 'input')];
  }
  for (const key of Object.keys(input)) if (FORBIDDEN_INPUT_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Forbidden Stage 24 input field: ${key}.`, key));
  if (!text(input.request_id)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'request_id is required.', 'request_id'));
  const party = input.party_creation_context;
  if (!isObject(party)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'party_creation_context is required.', 'party_creation_context'));
  else for (const key of ['party_id', 'player_character_id', 'idempotency_key', 'schema_version']) if (!text(party[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `party_creation_context.${key} is required.`, `party_creation_context.${key}`));
  if (party?.schema_version !== 'party_runtime_v2') concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'New parties require party_runtime_v2; legacy party v1 is unsupported.', 'party_creation_context.schema_version'));
  for (const key of ['world_revision_id', 'world_catalog_digest', 'materializer_version', 'rng_version', 'command_catalog_digest', 'profile_bundle_digest']) {
    if (!text(party?.version_pins?.[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `party_creation_context.version_pins.${key} is required.`, `party_creation_context.version_pins.${key}`));
  }
  const phase1A = isLowerDvinaTracePhase1AInput(input);
  if (!phase1A && input.pipeline_profile != null && input.pipeline_profile !== 'standard_new_game') {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Unsupported Stage 24 pipeline_profile: ${input.pipeline_profile}.`, 'pipeline_profile'));
  }
  concerns.push(...validateDomainCatalogPin(party?.domain_catalog_pin, party?.version_pins));
  if (!isObject(input.approved_pipeline_outputs)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'approved_pipeline_outputs is required.', 'approved_pipeline_outputs'));
  else for (const key of requiredArtifactKeysForInput(input)) if (input.approved_pipeline_outputs[key] == null) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `approved_pipeline_outputs.${key} is required.`, `approved_pipeline_outputs.${key}`));
  concerns.push(...validateApprovedPipelineManifest(input.approved_pipeline_manifest, input.approved_pipeline_outputs, input.request_id, input));
  if (input.approved_pipeline_manifest_digest !== computeStage24Digest(input.approved_pipeline_manifest)) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'approved_pipeline_manifest_digest mismatch.', 'approved_pipeline_manifest_digest'));
  concerns.push(...validatePartyDatabaseSchemaSnapshot(input.party_database_schema));
  if (input.party_database_schema_digest !== computeStage24Digest(input.party_database_schema)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party_database_schema_digest mismatch.', 'party_database_schema_digest'));
  concerns.push(...validateWorldBaseReferenceSnapshot(input.world_base_reference_snapshot));
  if (input.world_base_reference_digest !== computeStage24Digest(input.world_base_reference_snapshot)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'world_base_reference_digest mismatch.', 'world_base_reference_digest'));
  for (const [key, expected] of Object.entries(REQUIRED_WRITE_POLICY)) if (input.write_policy?.[key] !== expected) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `write_policy.${key} cannot be weakened.`, `write_policy.${key}`));
  if (phase1A) concerns.push(...validateLowerDvinaTracePhase1AArtifacts(input.approved_pipeline_outputs, party, input.request_id));
  else {
    concerns.push(...validateMaterializationVersionPins(
      input.approved_pipeline_outputs?.g5_scene_graph?.materialization_run,
      party?.version_pins,
      party?.domain_catalog_pin
    ));
    concerns.push(...validateMaterializationIdentity(input.approved_pipeline_outputs?.g5_scene_graph, party));
  }
  const expectedInputDigest = computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  if (input.party_db_write_plan_input_digest !== expectedInputDigest) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'party_db_write_plan_input_digest mismatch.', 'party_db_write_plan_input_digest'));
  if (!phase1A) concerns.push(...validateAuditApprovals(input.approved_pipeline_outputs, input.request_id));
  return concerns;
}

function validateLowerDvinaTracePhase1AArtifacts(outputs, party, requestId) {
  const concerns = [];
  const result = outputs?.materialization_result;
  const semantic = outputs?.player_character_audit;
  const closure = outputs?.sealed_selection_closure;
  if (!isObject(result)
    || result.schema !== 'rus.lower_dvina_trace_party_materialization_result.v1'
    || result.status !== 'materialized'
    || result.validation_report?.pass !== true
    || result.party_id !== party?.party_id
    || result.immediate?.player?.instance_id !== party?.player_character_id) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Phase 1A materialization result is incomplete or bound to another party.', 'approved_pipeline_outputs.materialization_result'));
  } else {
    const identity = result.request_identity;
    for (const [resultKey, pinKey] of [
      ['world_revision_id', 'world_revision_id'],
      ['world_catalog_digest', 'world_catalog_digest'],
      ['materializer_version', 'materializer_version'],
      ['rng_algorithm_id', 'rng_version'],
      ['scenario_manifest_digest', 'command_catalog_digest']
    ]) {
      if (identity?.[resultKey] !== party?.version_pins?.[pinKey]) {
        concerns.push(issue('WRITE_PLAN_VERSION_PIN_MISMATCH', `Phase 1A ${resultKey} does not match party version pins.`, `approved_pipeline_outputs.materialization_result.request_identity.${resultKey}`));
      }
    }
    if (identity?.idempotency_key !== party?.idempotency_key || identity?.idempotency_key !== requestId) {
      concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Phase 1A idempotency identity does not match Stage 24.', 'approved_pipeline_outputs.materialization_result.request_identity.idempotency_key'));
    }
    if (result.trace?.result_digest !== computeMaterializationEnvelopeDigest(result)) {
      concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Phase 1A materialization result digest mismatch.', 'approved_pipeline_outputs.materialization_result.trace.result_digest'));
    }
    concerns.push(...validateMaterializationVersionPins(
      result.trace,
      party?.version_pins,
      party?.domain_catalog_pin
    ));
  }
  if (semantic?.pass !== true || semantic?.stage11?.pass !== true || semantic?.stage12?.pass !== true) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Phase 1A player audit must contain passing Stage 11 and Stage 12 proofs.', 'approved_pipeline_outputs.player_character_audit'));
  }
  if (!isObject(closure)
    || closure.schema !== 'rus.lower_dvina_trace_sealed_selection_closure.v1'
    || closure.pass !== true
    || closure.party_id !== party?.party_id
    || closure.materialization_result_digest !== result?.trace?.result_digest
    || closure.sealed_selections_digest !== computeStage24Digest(result?.sealed_selections)) {
    concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Phase 1A sealed selection closure does not match the materialization result.', 'approved_pipeline_outputs.sealed_selection_closure'));
  }
  return concerns;
}

function validateMaterializationIdentity(g5, party) {
  const trace = g5?.materialization_run;
  const seed = trace?.seed_context;
  const g4Id = g5?.parent_location?.g4_node_id;
  const concerns = [];
  if (!text(seed?.party_id) || seed.party_id !== party?.party_id) concerns.push(issue('WRITE_PLAN_MATERIALIZATION_IDENTITY_MISMATCH', 'materialization_run.seed_context.party_id must match party_creation_context.party_id.', 'approved_pipeline_outputs.g5_scene_graph.materialization_run.seed_context.party_id'));
  if (!text(seed?.g4_id) || seed.g4_id !== g4Id) concerns.push(issue('WRITE_PLAN_MATERIALIZATION_IDENTITY_MISMATCH', 'materialization_run.seed_context.g4_id must match the materialized parent G4.', 'approved_pipeline_outputs.g5_scene_graph.materialization_run.seed_context.g4_id'));
  return concerns;
}

export function validateMaterializationVersionPins(trace, pins, domainPin) {
  if (!isObject(trace) || !isObject(pins) || !isObject(domainPin)) return [issue('WRITE_PLAN_VERSION_PIN_MISMATCH', 'Materialization trace, world pins and domain catalog pin are required.', 'approved_pipeline_outputs.g5_scene_graph.materialization_run')];
  const pairs = [
    ['world_revision_id', 'world_revision_id'],
    ['materializer_version', 'materializer_version'],
    ['rng_version', 'rng_version']
  ];
  const concerns = pairs.flatMap(([traceKey, pinKey]) => trace[traceKey] === pins[pinKey] ? [] : [issue('WRITE_PLAN_VERSION_PIN_MISMATCH', `materialization_run.${traceKey} must match version_pins.${pinKey}.`, `approved_pipeline_outputs.g5_scene_graph.materialization_run.${traceKey}`)]);
  if (trace.catalog_digest !== domainPin.catalog_digest) concerns.push(issue('WRITE_PLAN_VERSION_PIN_MISMATCH', 'materialization_run.catalog_digest must match domain_catalog_pin.catalog_digest.', 'approved_pipeline_outputs.g5_scene_graph.materialization_run.catalog_digest'));
  return concerns;
}

function validateDomainCatalogPin(pin, worldPins) {
  if (!isObject(pin) || pin.schema !== 'rus.runtime_catalog_pin.v2') {
    return [issue('PARTY_CATALOG_PIN_MISSING', 'Exact item/container domain catalog pin is required.', 'party_creation_context.domain_catalog_pin')];
  }
  const required = [
    'catalog_scope', 'catalog_revision_id', 'catalog_digest', 'import_id',
    'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest',
    'compatible_world_revision_id', 'compatible_world_catalog_digest',
    'compatible_world_pin_manifest_digest', 'activation_event_id'
  ];
  const concerns = required.flatMap((key) => text(pin[key])
    ? []
    : [issue('PARTY_CATALOG_PIN_MISSING', `domain_catalog_pin.${key} is required.`, `party_creation_context.domain_catalog_pin.${key}`)]);
  if (pin.catalog_scope !== 'item_container_materialization_v2') concerns.push(issue('PARTY_CATALOG_PIN_MISMATCH', 'Unsupported domain catalog scope.', 'party_creation_context.domain_catalog_pin.catalog_scope'));
  if (pin.compatible_world_revision_id !== worldPins?.world_revision_id
      || pin.compatible_world_catalog_digest !== worldPins?.world_catalog_digest) {
    concerns.push(issue('PARTY_CATALOG_PIN_MISMATCH', 'Domain catalog compatible world tuple must match the full party world pin.', 'party_creation_context.domain_catalog_pin'));
  }
  return concerns;
}

export function validatePartyDatabaseSchemaSnapshot(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA) return [issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `Expected ${PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA} version 1.`, 'party_database_schema')];
  if (!text(snapshot.schema_version)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database schema_version is required.', 'party_database_schema.schema_version'));
  if (snapshot.schema_version !== 'party_runtime_v2') concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Party database snapshot must be party_runtime_v2.', 'party_database_schema.schema_version'));
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party database readonly_checksum is required.', 'party_database_schema.readonly_checksum'));
  for (const key of ['tables', 'foreign_keys', 'unique_constraints', 'check_constraints', 'enum_definitions', 'indexes', 'allowed_operations']) if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', `party_database_schema.${key} must be an array.`, `party_database_schema.${key}`));
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length === 0) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'party_database_schema.tables must be non-empty.', 'party_database_schema.tables'));
  else for (const [index, table] of snapshot.tables.entries()) {
    if (!text(tableName(table))) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires name/table_name.', `party_database_schema.tables[${index}]`));
    if (!Array.isArray(table.columns) || table.columns.length === 0) concerns.push(issue('WRITE_PLAN_DATABASE_SCHEMA_INVALID', 'Each schema table requires non-empty columns.', `party_database_schema.tables[${index}].columns`));
  }
  return concerns;
}

export function validateWorldBaseReferenceSnapshot(snapshot = {}) {
  const concerns = [];
  if (!isObject(snapshot) || snapshot.version !== 1 || snapshot.schema !== WORLD_BASE_REFERENCE_SCHEMA) return [issue('WRITE_PLAN_INPUT_BINDING_INVALID', `Expected ${WORLD_BASE_REFERENCE_SCHEMA} version 1.`, 'world_base_reference_snapshot')];
  if (!text(snapshot.readonly_checksum)) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'world_base_reference_snapshot.readonly_checksum is required.', 'world_base_reference_snapshot.readonly_checksum'));
  for (const key of ['allowed_region_ids','allowed_graph_node_ids','allowed_graph_edge_ids','allowed_place_template_ids','allowed_npc_candidate_ids','allowed_item_profile_ids','allowed_container_profile_ids','allowed_property_rule_ids','allowed_source_ids']) if (!Array.isArray(snapshot[key])) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `world_base_reference_snapshot.${key} must be an array.`, `world_base_reference_snapshot.${key}`));
  return concerns;
}

export function validateApprovedPipelineManifest(manifest, outputs, requestId, input = {}) {
  const concerns = [];
  if (!isObject(manifest) || manifest.version !== 1 || manifest.schema !== STAGE24_MANIFEST_SCHEMA || manifest.request_id !== requestId) return [issue('WRITE_PLAN_MANIFEST_INVALID', `Expected ${STAGE24_MANIFEST_SCHEMA} version 1 with matching request_id.`, 'approved_pipeline_manifest')];
  if (isLowerDvinaTracePhase1AInput(input) && manifest.manifest_kind !== LOWER_DVINA_TRACE_PHASE_1A_PIPELINE_PROFILE) {
    concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'Phase 1A manifest_kind must match its exact internal pipeline profile.', 'approved_pipeline_manifest.manifest_kind'));
  }
  const entries = new Map(array(manifest.artifacts).map((item) => [item?.artifact_key, item]));
  const requiredKeys = requiredArtifactKeysForInput(input);
  if (entries.size !== requiredKeys.length || array(manifest.artifacts).length !== requiredKeys.length) {
    concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', 'Manifest must contain every required artifact exactly once and no extras.', 'approved_pipeline_manifest.artifacts'));
  }
  for (const key of requiredKeys) {
    const entry = entries.get(key);
    if (!entry) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest entry missing: ${key}.`, `approved_pipeline_manifest.artifacts.${key}`));
    else {
      if (entry.stage_id !== artifactStageIdForProfile(key, input.pipeline_profile)) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest stage mismatch: ${key}.`, `approved_pipeline_manifest.artifacts.${key}.stage_id`));
      if (entry.artifact_schema !== (outputs?.[key]?.schema ?? null)) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest schema mismatch: ${key}.`, `approved_pipeline_manifest.artifacts.${key}.artifact_schema`));
      if (entry.artifact_digest !== computeStage24Digest(outputs?.[key])) concerns.push(issue('WRITE_PLAN_MANIFEST_INVALID', `Manifest digest mismatch: ${key}.`, `approved_pipeline_manifest.artifacts.${key}.artifact_digest`));
    }
  }
  return concerns;
}

export function validateAuditApprovals(outputs, requestId) {
  const concerns = [];
  for (const key of ['start_place_audit','player_character_audit','g5_scene_audit','npc_placement_audit','item_placement_audit','time_light_consistency_audit','character_knowledge_map_audit','full_hidden_state_audit','visible_context_audit_approval','narrator_prose_audit_approval']) {
    const value = outputs?.[key];
    if (!isObject(value) || value.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key}.pass must be true.`, `approved_pipeline_outputs.${key}`));
    if (value?.request_id != null && value.request_id !== requestId) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key}.request_id mismatch.`, `approved_pipeline_outputs.${key}.request_id`));
  }
  return concerns;
}

export function validateArtifactApprovalDigest(approval, artifact) {
  if (!isObject(approval) || !artifact) return false;
  const expected = computeStage24Digest(artifact);
  return [approval.artifact_digest, approval.narrator_starting_prose_digest, approval.visible_context_package_digest].filter(text).some((value) => value === expected);
}
