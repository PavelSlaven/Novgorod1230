import { createHash } from 'node:crypto';

export const STAGE18_INPUT_SCHEMA = 'character_knowledge_map_input';
export const STAGE18_OUTPUT_SCHEMA = 'character_knowledge_map';
export const STAGE18_PRECHECK_SCHEMA = 'character_knowledge_map_code_precheck';
export const STAGE18_AUDIT_SCHEMA = 'character_knowledge_map_audit';
export const STAGE18_WRITE_PLAN_SCHEMA = 'character_knowledge_write_projection';
export const STAGE18_RESULT_SCHEMA = 'stage18_character_knowledge_result';

export const DEFAULT_STAGE18_KNOWLEDGE_POLICY = Object.freeze({
  require_knowledge_basis: true,
  require_source_trace: true,
  separate_player_and_character_knowledge: true,
  separate_known_and_visible: true,
  separate_fact_and_rumor: true,
  separate_exact_and_approximate_routes: true,
  allow_mistaken_beliefs: true,
  allow_uncertain_knowledge: true,
  do_not_grant_full_map: true,
  do_not_grant_hidden_state: true,
  do_not_create_new_routes: true,
  do_not_create_new_places: true,
  do_not_create_new_npcs: true,
  do_not_write_visible_scene: true,
  do_not_write_intro_prose: true
});

const KNOWLEDGE_ARRAYS = Object.freeze([
  'known_routes',
  'known_nearby_paths',
  'known_places',
  'known_addresses',
  'known_landmarks',
  'known_people',
  'known_authorities',
  'known_dangers',
  'known_social_rules',
  'known_resources',
  'rumors',
  'mistaken_beliefs',
  'uncertain_knowledge',
  'forbidden_knowledge',
  'knowledge_gaps',
  'source_trace'
]);

const KNOWN_ARRAYS = Object.freeze([
  'known_routes',
  'known_nearby_paths',
  'known_places',
  'known_addresses',
  'known_landmarks',
  'known_people',
  'known_authorities',
  'known_dangers',
  'known_social_rules',
  'known_resources'
]);

const ALLOWED_BASIS = new Set([
  'origin', 'occupation', 'social_role', 'visible_now', 'audible_now', 'personal_travel',
  'personal_relation', 'common_knowledge', 'npc_told', 'rumor', 'order', 'work_duty',
  'family_memory', 'authority_instruction', 'previous_party_event'
]);

const STATUS = new Set(['formed', 'empty_limited', 'blocked', 'requires_repair']);
const FORMAT_OUTPUT_CODES = new Set([
  'KNOWLEDGE_MAP_INVALID_JSON',
  'KNOWLEDGE_MAP_SCHEMA_MISMATCH',
  'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING',
  'KNOWLEDGE_MAP_ARRAY_INVALID'
]);
const FORMAT_AUDIT_CODES = new Set([
  'KNOWLEDGE_MAP_AUDIT_INVALID_JSON',
  'KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH',
  'KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING'
]);

export function normalizeStage18KnowledgePolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE18_KNOWLEDGE_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}

export function emptyWorldBaseRouteSnapshot() {
  return {
    version: 1,
    schema: 'world_base_route_snapshot',
    nearby_graph_edges: [],
    known_route_candidates: [],
    historical_anchor_candidates: [],
    route_knowledge_rule_candidates: []
  };
}

export function buildStage18CharacterKnowledgeInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE18_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    start_place_audit: input.start_place_audit ?? null,
    player_character: input.player_character ?? null,
    player_character_audit: input.player_character_audit ?? null,
    current_position: input.current_position ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    regional_context_package: input.regional_context_package ?? null,
    world_base_route_snapshot: normalizeRouteSnapshot(input.world_base_route_snapshot),
    knowledge_policy: normalizeStage18KnowledgePolicy(input.knowledge_policy ?? input.policy ?? {})
  };
}

export function validateStage18Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('KNOWLEDGE_MAP_INPUT_INVALID', 'Stage 18 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE18_INPUT_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE18_INPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (!text(input.request_id)) concerns.push(issue('KNOWLEDGE_MAP_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'KNOWLEDGE_MAP_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'KNOWLEDGE_MAP_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'KNOWLEDGE_MAP_SELECTED_START_NODE_INVALID');
  requireAudit(concerns, input.start_place_audit, 'start_place_audit', 'start_place_audit', 'KNOWLEDGE_MAP_START_PLACE_AUDIT_FAILED');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'KNOWLEDGE_MAP_PLAYER_CHARACTER_INVALID');
  requireAudit(concerns, input.player_character_audit, 'player_character_audit', 'player_character_audit', 'KNOWLEDGE_MAP_PLAYER_CHARACTER_AUDIT_FAILED');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'KNOWLEDGE_MAP_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'KNOWLEDGE_MAP_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'KNOWLEDGE_MAP_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'KNOWLEDGE_MAP_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'KNOWLEDGE_MAP_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'KNOWLEDGE_MAP_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'KNOWLEDGE_MAP_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.regional_context_package, 'regional_context_package', 'regional_context_package', 'KNOWLEDGE_MAP_REGIONAL_CONTEXT_INVALID');
  requireSchema(concerns, input.world_base_route_snapshot, 'world_base_route_snapshot', 'world_base_route_snapshot', 'KNOWLEDGE_MAP_ROUTE_SNAPSHOT_INVALID');
  validateCurrentPositionInput(input, concerns);

  for (const key of ['nearby_graph_edges', 'known_route_candidates', 'historical_anchor_candidates', 'route_knowledge_rule_candidates']) {
    if (!Array.isArray(input.world_base_route_snapshot?.[key])) {
      concerns.push(issue('KNOWLEDGE_MAP_ROUTE_SNAPSHOT_INVALID', `${key} must be an array.`, `world_base_route_snapshot.${key}`));
    }
  }
  for (const [key, expected] of Object.entries(DEFAULT_STAGE18_KNOWLEDGE_POLICY)) {
    if (input.knowledge_policy?.[key] !== expected) {
      concerns.push(issue('KNOWLEDGE_MAP_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `knowledge_policy.${key}`, expected, input.knowledge_policy?.[key]));
    }
  }
  if (input.time_light_consistency_audit?.commit_permission
    && input.time_light_consistency_audit.commit_permission.can_continue_to_visible_context !== true) {
    concerns.push(issue('KNOWLEDGE_MAP_TIME_LIGHT_AUDIT_FAILED', 'Stage 17 must allow continuation to visible-context construction.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  }
  return dedupe(concerns);
}

export function buildStage18ReferenceIndex(input) {
  const refs = {
    routeIds: new Set(),
    graphEdgeIds: new Set(),
    g5EdgeIds: new Set(),
    placeIds: new Set(),
    nodeIds: new Set(),
    anchorIds: new Set(),
    minilocationIds: new Set(),
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    playerCharacterIds: new Set(),
    sourceIds: new Set()
  };
  for (const edge of routeSnapshotRows(input?.world_base_route_snapshot)) {
    addText(refs.graphEdgeIds, edge?.graph_edge_id ?? edge?.edge_id ?? edge?.id);
    addText(refs.routeIds, edge?.route_id);
    collectByKeys(edge, refs.nodeIds, ['from_node_id', 'to_node_id', 'node_id', 'g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);
    collectByKeys(edge, refs.placeIds, ['place_id', 'location_id']);
    collectSourceIds(edge, refs.sourceIds);
  }
  for (const edge of array(input?.g5_scene_graph?.g5_edges ?? input?.g5_scene_graph?.edges)) {
    addText(refs.g5EdgeIds, edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id);
  }
  for (const anchor of array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors)) {
    addText(refs.anchorIds, anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id);
  }
  for (const miniloc of array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations)) {
    addText(refs.minilocationIds, miniloc?.g5_minilocation_id ?? miniloc?.minilocation_id ?? miniloc?.id);
  }
  collectByKeys(input?.selected_start_node, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id', 'selected_node_id', 'graph_node_id']);
  collectByKeys(input?.selected_start_node, refs.placeIds, ['place_id', 'location_id']);
  collectByKeys(input?.g5_scene_graph?.parent_location, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);
  collectByKeys(input?.g5_scene_graph?.parent_location, refs.placeIds, ['place_id', 'location_id']);
  collectByKeys(input?.initial_npc_placement, refs.npcIds, ['npc_instance_id', 'npc_id', 'npc_candidate_id', 'key_npc_seed_id']);
  collectByKeys(input?.initial_item_placement, refs.itemIds, ['item_instance_id', 'item_id']);
  collectByKeys(input?.initial_item_placement, refs.containerIds, ['container_instance_id', 'container_id']);
  collectByKeys(input?.player_character, refs.playerCharacterIds, ['player_character_id', 'character_id']);
  collectSourceIds(input?.regional_context_package, refs.sourceIds);
  collectSourceIds(input?.world_base_route_snapshot, refs.sourceIds);
  collectSourceIds(input?.player_character, refs.sourceIds);
  return refs;
}

export function validateCharacterKnowledgeMap(output, input, refs = buildStage18ReferenceIndex(input)) {
  const concerns = [];
  if (!isObject(output)) return [issue('KNOWLEDGE_MAP_INVALID_JSON', 'character_knowledge_map must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE18_OUTPUT_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_SCHEMA_MISMATCH', `Expected ${STAGE18_OUTPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (output.request_id !== input?.request_id) {
    concerns.push(issue('KNOWLEDGE_MAP_SCHEMA_MISMATCH', 'request_id must match Stage 18 input.', 'request_id', input?.request_id, output.request_id));
  }
  if (!STATUS.has(output.knowledge_status)) concerns.push(issue('KNOWLEDGE_MAP_SCHEMA_MISMATCH', 'knowledge_status is outside the allowed enum.', 'knowledge_status'));
  for (const key of KNOWLEDGE_ARRAYS) {
    if (!Array.isArray(output[key])) concerns.push(issue('KNOWLEDGE_MAP_ARRAY_INVALID', `${key} must be an array.`, key));
  }
  for (const [field, code] of [
    ['character_ref', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING'],
    ['current_position_ref', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING'],
    ['knowledge_scope_summary', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING'],
    ['player_vs_character_knowledge_boundary', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING'],
    ['downstream_constraints', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING'],
    ['audit_self_check', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING']
  ]) {
    if (!isObject(output[field])) concerns.push(issue(code, `${field} must be an object.`, field));
  }

  validateCharacterRef(output, input, refs, concerns);
  validatePositionRef(output, input, refs, concerns);
  validateKnowledgeRecords(output, input, refs, concerns);
  validateRumorsAndBoundaries(output, concerns);
  validateScope(output, input, concerns);
  validateForbiddenSurfaceKeys(output, concerns);

  if (input?.knowledge_policy?.require_source_trace === true && array(output.source_trace).length === 0) {
    concerns.push(issue('KNOWLEDGE_MAP_SOURCE_MISSING', 'source_trace must not be empty.', 'source_trace'));
  }
  if (array(output.audit_self_check?.evidence).length === 0) {
    concerns.push(issue('KNOWLEDGE_MAP_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', 'audit_self_check.evidence'));
  }
  if (output.audit_self_check?.pass === false && array(output.audit_self_check?.concerns).length === 0) {
    concerns.push(issue('KNOWLEDGE_MAP_EMPTY_AUDIT_EVIDENCE', 'Failed audit_self_check requires concerns.', 'audit_self_check.concerns'));
  }
  return dedupe(concerns);
}

export function buildCharacterKnowledgeCodePrecheck(output, input, refs = buildStage18ReferenceIndex(input)) {
  const concerns = validateCharacterKnowledgeMap(output, input, refs);
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...items) => items.every((code) => !codes.has(code));
  return {
    version: 1,
    schema: STAGE18_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: concerns.length === 0,
    checks: {
      schema_valid: none('KNOWLEDGE_MAP_INVALID_JSON', 'KNOWLEDGE_MAP_SCHEMA_MISMATCH', 'KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING', 'KNOWLEDGE_MAP_ARRAY_INVALID'),
      character_ref_valid: none('KNOWLEDGE_MAP_CHARACTER_REF_MISMATCH'),
      current_position_ref_valid: none('KNOWLEDGE_MAP_POSITION_REF_MISMATCH'),
      route_refs_valid: none('KNOWLEDGE_MAP_ROUTE_REF_NOT_FOUND', 'KNOWLEDGE_MAP_CREATED_ROUTE'),
      place_refs_valid: none('KNOWLEDGE_MAP_PLACE_REF_NOT_FOUND', 'KNOWLEDGE_MAP_CREATED_PLACE'),
      npc_refs_valid: none('KNOWLEDGE_MAP_NPC_REF_NOT_FOUND', 'KNOWLEDGE_MAP_CREATED_NPC'),
      item_refs_valid: none('KNOWLEDGE_MAP_ITEM_REF_NOT_FOUND', 'KNOWLEDGE_MAP_CREATED_ITEM'),
      all_known_facts_have_basis: none('KNOWLEDGE_MAP_KNOWLEDGE_WITHOUT_BASIS', 'KNOWLEDGE_MAP_INVALID_BASIS'),
      rumors_separated_from_facts: none('KNOWLEDGE_MAP_RUMOR_WITHOUT_SOURCE', 'KNOWLEDGE_MAP_RUMOR_TREATED_AS_FACT', 'KNOWLEDGE_MAP_MISTAKEN_BELIEF_TREATED_AS_FACT'),
      forbidden_knowledge_present: none('KNOWLEDGE_MAP_FORBIDDEN_KNOWLEDGE_MISSING'),
      no_hidden_state_leak: none('KNOWLEDGE_MAP_HIDDEN_STATE_LEAK', 'KNOWLEDGE_MAP_CLOSED_CONTAINER_CONTENTS_LEAK', 'KNOWLEDGE_MAP_PRIVATE_NPC_MOTIVE_LEAK'),
      no_future_knowledge: none('KNOWLEDGE_MAP_FUTURE_KNOWLEDGE_LEAK'),
      no_full_map_granted: none('KNOWLEDGE_MAP_FULL_MAP_GRANTED', 'KNOWLEDGE_MAP_ROUTE_KNOWLEDGE_TOO_STRONG'),
      no_new_world_entities_created: none('KNOWLEDGE_MAP_CREATED_ROUTE', 'KNOWLEDGE_MAP_CREATED_PLACE', 'KNOWLEDGE_MAP_CREATED_NPC', 'KNOWLEDGE_MAP_CREATED_ITEM'),
      no_visible_scene_created: none('KNOWLEDGE_MAP_CREATED_VISIBLE_SCENE', 'KNOWLEDGE_MAP_CREATED_INTRO_PROSE'),
      source_trace_present: none('KNOWLEDGE_MAP_SOURCE_MISSING'),
      audit_self_check_valid: none('KNOWLEDGE_MAP_EMPTY_AUDIT_EVIDENCE')
    },
    concerns,
    evidence: [{
      kind: 'stage18_code_precheck',
      known_record_count: KNOWN_ARRAYS.reduce((sum, key) => sum + array(output?.[key]).length, 0),
      rumor_count: array(output?.rumors).length,
      forbidden_count: array(output?.forbidden_knowledge).length
    }]
  };
}

export function buildCharacterKnowledgeAuditInput(input, output, precheck, refs = buildStage18ReferenceIndex(input)) {
  return {
    version: 1,
    schema: 'character_knowledge_map_audit_input',
    request_id: input.request_id,
    historical_frame: structuredClone(input.historical_frame),
    weather_state: structuredClone(input.weather_state),
    current_position: structuredClone(input.current_position),
    selected_start_node: structuredClone(input.selected_start_node),
    player_character: structuredClone(input.player_character),
    g5_scene_graph: structuredClone(input.g5_scene_graph),
    initial_npc_placement: structuredClone(input.initial_npc_placement),
    initial_item_placement: structuredClone(input.initial_item_placement),
    regional_context_package: structuredClone(input.regional_context_package),
    world_base_route_snapshot: structuredClone(input.world_base_route_snapshot),
    character_knowledge_map: structuredClone(output),
    character_knowledge_map_code_precheck: structuredClone(precheck),
    reference_index_summary: referenceSummary(refs),
    audit_policy: {
      reject_unbased_knowledge: true,
      reject_hidden_state_knowledge: true,
      reject_future_knowledge: true,
      reject_full_map: true,
      reject_new_world_entities: true,
      reject_visible_scene: true,
      require_source_trace: true
    }
  };
}

export function validateCharacterKnowledgeAudit(audit, output, precheck) {
  const concerns = [];
  if (!isObject(audit)) return [issue('KNOWLEDGE_MAP_AUDIT_INVALID_JSON', 'character_knowledge_map_audit must be an object.', 'audit')];
  if (audit.version !== 1 || audit.schema !== STAGE18_AUDIT_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE18_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  }
  if (audit.request_id != null && audit.request_id !== output?.request_id) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', 'Audit request_id must match output.', 'audit.request_id'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.pass must be boolean.', 'audit.pass'));
  if (!Array.isArray(audit.concerns)) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence)) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.evidence must be an array.', 'audit.evidence'));
  if (audit.pass === false && (array(audit.concerns).length === 0 || array(audit.evidence).length === 0)) {
    concerns.push(issue('KNOWLEDGE_MAP_AUDIT_REQUIRED_BLOCK_MISSING', 'Failed audit requires concerns and evidence.', 'audit'));
  }
  if (audit.pass === true && precheck?.pass !== true) concerns.push(issue('KNOWLEDGE_MAP_AUDIT_SCHEMA_MISMATCH', 'Audit cannot pass when code precheck failed.', 'audit.pass'));
  return concerns;
}

export function buildCharacterKnowledgeWriteProjection(output, precheck, audit, repairHistory = []) {
  const normalizedGroups = Object.fromEntries([
    ...KNOWN_ARRAYS,
    'rumors', 'mistaken_beliefs', 'uncertain_knowledge', 'forbidden_knowledge', 'knowledge_gaps'
  ].map((key) => [key, structuredClone(array(output?.[key]))]));
  normalizedGroups.player_vs_character_knowledge_boundary = structuredClone(output?.player_vs_character_knowledge_boundary ?? {});
  const sourceContentHash = hashJson(output);
  const expectedCounts = Object.fromEntries(Object.entries(normalizedGroups).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1]));
  return {
    version: 1,
    schema: STAGE18_WRITE_PLAN_SCHEMA,
    request_id: output?.request_id ?? null,
    knowledge_map_id: output?.knowledge_map_id ?? `knowledge_map:${output?.request_id ?? sourceContentHash.slice(0, 12)}`,
    root_record: {
      player_character_id: output?.character_ref?.player_character_id ?? null,
      knowledge_status: output?.knowledge_status ?? null,
      knowledge_scope_summary: structuredClone(output?.knowledge_scope_summary ?? {}),
      current_position_ref: structuredClone(output?.current_position_ref ?? {}),
      status: 'pending',
      is_current: false
    },
    normalized_groups: normalizedGroups,
    snapshot_payload: {
      character_knowledge_map: structuredClone(output),
      code_precheck: structuredClone(precheck),
      audit: structuredClone(audit),
      repair_history: structuredClone(repairHistory)
    },
    projection_manifest: {
      source_content_hash: sourceContentHash,
      expected_counts: expectedCounts,
      expected_record_keys: Object.keys(normalizedGroups),
      group_hashes: Object.fromEntries(Object.entries(normalizedGroups).map(([key, value]) => [key, hashJson(value)])),
      requires_snapshot: true,
      requires_root_record: true,
      requires_current_switch_after_validation: true
    }
  };
}

export function validateCharacterKnowledgeWriteProjection(projection, output) {
  const concerns = [];
  if (!isObject(projection) || projection.version !== 1 || projection.schema !== STAGE18_WRITE_PLAN_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_WRITE_PROJECTION_INVALID', `Expected ${STAGE18_WRITE_PLAN_SCHEMA} version 1.`, 'write_projection'));
    return concerns;
  }
  if (!text(projection.projection_manifest?.source_content_hash)) concerns.push(issue('KNOWLEDGE_MAP_PROJECTION_HASH_MISSING', 'source_content_hash is required.', 'write_projection.projection_manifest.source_content_hash'));
  if (projection.projection_manifest?.source_content_hash !== hashJson(output)) concerns.push(issue('KNOWLEDGE_MAP_PROJECTION_HASH_MISSING', 'source_content_hash does not match character_knowledge_map.', 'write_projection.projection_manifest.source_content_hash'));
  if (!isObject(projection.normalized_groups) || !Array.isArray(projection.normalized_groups.known_nearby_paths)) concerns.push(issue('KNOWLEDGE_MAP_NEARBY_PATH_MAPPING_INVALID', 'known_nearby_paths must remain a separate semantic group.', 'write_projection.normalized_groups.known_nearby_paths'));
  return concerns;
}

export async function runStage18CharacterKnowledgeMapBlock({
  input,
  build,
  audit,
  formatRepair,
  semanticRepair,
  seniorRepair
} = {}) {
  const inputConcerns = validateStage18Input(input);
  if (inputConcerns.length > 0) throw stage18Error('Stage 18 input gate failed.', inputConcerns, { failedGate: 'stage18_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ build, audit, formatRepair, semanticRepair, seniorRepair })) {
    if (typeof callback !== 'function') throw new Error(`Stage 18 requires ${name} callback.`);
  }
  const refs = buildStage18ReferenceIndex(input);
  const repairHistory = [];
  let candidate = await callRole(build, structuredClone(input), 'CharacterKnowledgeMapBuilder');
  candidate = await normalizeOutputFormat(candidate, input, formatRepair, repairHistory, 'CharacterKnowledgeMapBuilder');
  let lastPrecheck = null;
  let lastAudit = null;

  for (let semanticAttempt = 0; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildCharacterKnowledgeCodePrecheck(candidate.value, input, refs);
    if (lastPrecheck.pass === true) {
      let auditResult = await callRole(audit, buildCharacterKnowledgeAuditInput(input, candidate.value, lastPrecheck, refs), 'CharacterKnowledgeMapAuditor');
      auditResult = await normalizeAuditFormat(auditResult, input, candidate.value, lastPrecheck, formatRepair, repairHistory);
      const auditValidation = validateCharacterKnowledgeAudit(auditResult.value, candidate.value, lastPrecheck);
      if (auditValidation.length > 0) throw stage18Error('Stage 18 audit output is invalid after format repair.', auditValidation, { failedGate: 'stage18_audit_contract', terminal: true });
      lastAudit = withAuditPermissions(auditResult.value);
      if (lastAudit.pass === true) {
        const writePlan = buildCharacterKnowledgeWriteProjection(candidate.value, lastPrecheck, lastAudit, repairHistory);
        const writeIssues = validateCharacterKnowledgeWriteProjection(writePlan, candidate.value);
        if (writeIssues.length > 0) throw stage18Error('Stage 18 write projection is invalid.', writeIssues, { failedGate: 'stage18_write_projection', terminal: true });
        return {
          version: 1,
          schema: STAGE18_RESULT_SCHEMA,
          request_id: input.request_id,
          pass: true,
          character_knowledge_map: structuredClone(candidate.value),
          code_precheck: structuredClone(lastPrecheck),
          character_knowledge_map_audit: structuredClone(lastAudit),
          write_plan: writePlan,
          repair_history: structuredClone(repairHistory),
          diagnostics: { reference_index_summary: referenceSummary(refs) },
          commit_permission: true
        };
      }
    }

    const semanticIssues = lastPrecheck.pass === true ? array(lastAudit?.concerns) : array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) throw stage18Error('Stage 18 semantic repair escalation exhausted.', semanticIssues, { failedGate: lastPrecheck.pass === true ? 'stage18_semantic_audit' : 'stage18_code_precheck', terminal: true });
    const role = semanticAttempt === 0 ? 'CharacterKnowledgeMapSemanticRepairer' : 'CharacterKnowledgeMapSeniorRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repaired = await callRole(repair, {
      version: 1,
      schema: 'character_knowledge_map_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE18_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      failed_character_knowledge_map: safeClone(candidate.value),
      validationErrors: safeClone(lastPrecheck?.concerns ?? []),
      audit: safeClone(lastAudit),
      repair_history: safeClone(repairHistory),
      forbidden_changes: ['world_state', 'player_character', 'g5_scene_graph', 'new_route', 'new_place', 'new_npc', 'new_item', 'visible_scene', 'intro_prose']
    }, role);
    repairHistory.push({ attempt_index: repairHistory.length + 1, kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic', role, issue_codes: semanticIssues.map((item) => item?.code).filter(Boolean) });
    candidate = await normalizeOutputFormat(repaired, input, formatRepair, repairHistory, role);
    lastAudit = null;
  }
  throw stage18Error('Stage 18 failed unexpectedly.', [issue('KNOWLEDGE_MAP_UNKNOWN_FAILURE', 'Unknown Stage 18 failure.', 'root')], { terminal: true });
}

export function validateProvidedStage18Result() {
  throw new Error('Provided Stage 18 output is forbidden in production, development and tests. Stub the Stage 18 role executor instead.');
}

async function normalizeOutputFormat(result, input, formatRepair, repairHistory, sourceRole) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('KNOWLEDGE_MAP_INVALID_JSON', parsed.parseError, 'root')] : formatOnlyOutputValidation(parsed.value);
  if (validation.length === 0) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'character_knowledge_map_format_repair_input',
    request_id: input.request_id,
    target: STAGE18_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    constraints: { change_format_only: true, do_not_add_knowledge: true, do_not_remove_knowledge: true, do_not_change_basis: true, do_not_create_entities: true }
  }, 'CharacterKnowledgeMapFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'format', role: 'CharacterKnowledgeMapFormatRepairer', source: sourceRole, issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}

async function normalizeAuditFormat(result, input, output, precheck, formatRepair, repairHistory) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('KNOWLEDGE_MAP_AUDIT_INVALID_JSON', parsed.parseError, 'audit')] : validateCharacterKnowledgeAudit(parsed.value, output, precheck);
  if (validation.length === 0 || validation.every((item) => !FORMAT_AUDIT_CODES.has(item.code))) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'character_knowledge_map_format_repair_input',
    request_id: input.request_id,
    target: STAGE18_AUDIT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    character_knowledge_map: structuredClone(output),
    character_knowledge_map_code_precheck: structuredClone(precheck),
    constraints: { change_format_only: true, do_not_change_pass_semantics: true, do_not_repair_map: true }
  }, 'CharacterKnowledgeMapFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'audit_format', role: 'CharacterKnowledgeMapFormatRepairer', source: 'CharacterKnowledgeMapAuditor', issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}

function formatOnlyOutputValidation(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('KNOWLEDGE_MAP_INVALID_JSON', 'Output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE18_OUTPUT_SCHEMA) concerns.push(issue('KNOWLEDGE_MAP_SCHEMA_MISMATCH', `Expected ${STAGE18_OUTPUT_SCHEMA} version 1.`, 'schema'));
  for (const key of KNOWLEDGE_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('KNOWLEDGE_MAP_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['character_ref', 'current_position_ref', 'knowledge_scope_summary', 'player_vs_character_knowledge_boundary', 'downstream_constraints', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('KNOWLEDGE_MAP_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));
  return concerns;
}

function validateCurrentPositionInput(input, concerns) {
  const position = input?.current_position;
  if (!isObject(position)) {
    concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position is required.', 'current_position'));
    return;
  }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('KNOWLEDGE_MAP_CREATED_ROUTE', 'last_route_id must be null before initial commit.', 'current_position.last_route_id', null, position.last_route_id));
  const start = input?.g5_scene_graph?.player_start_position ?? {};
  const parent = input?.g5_scene_graph?.parent_location ?? {};
  const expected = {
    region_id: start.region_id ?? parent.region_id ?? null,
    place_id: start.place_id ?? parent.place_id ?? null,
    location_id: start.location_id ?? start.g4_node_id ?? parent.location_id ?? parent.g4_node_id ?? null,
    minilocation_id: start.minilocation_id ?? start.g5_minilocation_id ?? null,
    anchor_id: start.anchor_id ?? start.g5_anchor_id ?? null
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!text(value)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `Stage 13 player_start_position/parent_location must define ${key}.`, `g5_scene_graph.player_start_position.${key}`));
    else if (position[key] !== value) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `current_position.${key} must come only from audited Stage 13 G5 state.`, `current_position.${key}`, value, position[key]));
  }
  if (position.region_id !== input?.historical_frame?.region?.region_id) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.region_id must match historical_frame.', 'current_position.region_id'));
  const anchors = new Map(array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors).map((item) => [item?.g5_anchor_id ?? item?.anchor_id ?? item?.id, item]));
  const minilocIds = new Set(array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations).map((item) => item?.g5_minilocation_id ?? item?.minilocation_id ?? item?.id).filter(text));
  if (!anchors.has(position.anchor_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.anchor_id must exist in G5.', 'current_position.anchor_id'));
  if (!minilocIds.has(position.minilocation_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.minilocation_id must exist in G5.', 'current_position.minilocation_id'));
  const anchor = anchors.get(position.anchor_id);
  const anchorParent = anchor?.parent_minilocation_id ?? anchor?.minilocation_id ?? anchor?.g5_minilocation_id;
  if (text(anchorParent) && anchorParent !== position.minilocation_id) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position anchor must belong to current minilocation.', 'current_position.anchor_id'));
}

function validateCharacterRef(output, input, refs, concerns) {
  const actual = output?.character_ref?.player_character_id;
  const expected = firstTextFromObject(input?.player_character, ['player_character_id', 'character_id']);
  if (!text(actual) || (expected && actual !== expected) || (refs.playerCharacterIds.size > 0 && !refs.playerCharacterIds.has(actual))) concerns.push(issue('KNOWLEDGE_MAP_CHARACTER_REF_MISMATCH', 'player_character_id must match the approved player character.', 'character_ref.player_character_id', expected, actual));
}

function validatePositionRef(output, input, refs, concerns) {
  const actual = output?.current_position_ref ?? {};
  const expected = input?.current_position ?? {};
  for (const [outputKey, inputKeys] of Object.entries({
    region_id: ['region_id'],
    g1_node_id: ['g1_node_id'],
    g2_node_id: ['g2_node_id'],
    g3_node_id: ['g3_node_id'],
    g4_node_id: ['g4_node_id', 'location_id'],
    minilocation_id: ['minilocation_id'],
    anchor_id: ['anchor_id']
  })) {
    const expectedValue = firstText(expected, inputKeys);
    if (expectedValue && actual[outputKey] !== expectedValue) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `${outputKey} must match current_position.`, `current_position_ref.${outputKey}`, expectedValue, actual[outputKey]));
  }
  if (text(actual.anchor_id) && !refs.anchorIds.has(actual.anchor_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'anchor_id does not exist in G5.', 'current_position_ref.anchor_id'));
  if (text(actual.minilocation_id) && !refs.minilocationIds.has(actual.minilocation_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'minilocation_id does not exist in G5.', 'current_position_ref.minilocation_id'));
}

function validateKnowledgeRecords(output, input, refs, concerns) {
  const knownTexts = new Set();
  for (const arrayName of KNOWN_ARRAYS) {
    for (const [index, record] of array(output?.[arrayName]).entries()) {
      const path = `${arrayName}[${index}]`;
      const basis = basisValues(record);
      if (basis.length === 0) concerns.push(issue('KNOWLEDGE_MAP_KNOWLEDGE_WITHOUT_BASIS', 'Every known record requires basis.', `${path}.basis`));
      for (const [basisIndex, value] of basis.entries()) if (!ALLOWED_BASIS.has(value)) concerns.push(issue('KNOWLEDGE_MAP_INVALID_BASIS', `Invalid knowledge basis: ${value}.`, `${path}.basis[${basisIndex}]`));
      validateRecordReferences(arrayName, record, refs, path, concerns);
      validateKnownRecordHiddenFields(record, path, concerns);
      if (input?.knowledge_policy?.require_source_trace === true && array(record?.source_trace).length === 0) concerns.push(issue('KNOWLEDGE_MAP_SOURCE_MISSING', 'Known record requires source_trace.', `${path}.source_trace`));
      const label = canonicalRecordText(record);
      if (label) knownTexts.add(label);
    }
  }
  for (const [index, rumor] of array(output?.rumors).entries()) {
    const label = canonicalRecordText(rumor);
    if (label && knownTexts.has(label)) concerns.push(issue('KNOWLEDGE_MAP_RUMOR_TREATED_AS_FACT', 'Rumor duplicates a known fact.', `rumors[${index}]`));
  }
  for (const [index, belief] of array(output?.mistaken_beliefs).entries()) {
    const label = canonicalRecordText(belief);
    if (label && knownTexts.has(label)) concerns.push(issue('KNOWLEDGE_MAP_MISTAKEN_BELIEF_TREATED_AS_FACT', 'Mistaken belief duplicates a known fact.', `mistaken_beliefs[${index}]`));
  }
}

function validateRecordReferences(arrayName, record, refs, path, concerns) {
  const routeId = record?.route_id;
  if (text(routeId)) concerns.push(issue('KNOWLEDGE_MAP_CREATED_ROUTE', 'route_id is forbidden before initial commit; use graph_edge_id or g5_edge_id.', `${path}.route_id`, null, routeId));
  const graphEdgeId = record?.graph_edge_id ?? record?.edge_id;
  if (text(graphEdgeId) && !refs.graphEdgeIds.has(graphEdgeId)) concerns.push(issue('KNOWLEDGE_MAP_ROUTE_REF_NOT_FOUND', 'graph_edge_id does not exist in world_base_route_snapshot.', `${path}.graph_edge_id`, 'existing graph edge', graphEdgeId));
  const g5EdgeId = record?.g5_edge_id;
  if (text(g5EdgeId) && !refs.g5EdgeIds.has(g5EdgeId)) concerns.push(issue('KNOWLEDGE_MAP_ROUTE_REF_NOT_FOUND', 'g5_edge_id does not exist in G5.', `${path}.g5_edge_id`, 'existing G5 edge', g5EdgeId));
  for (const key of ['place_id', 'location_id']) if (text(record?.[key]) && !refs.placeIds.has(record[key]) && !refs.nodeIds.has(record[key])) concerns.push(issue('KNOWLEDGE_MAP_PLACE_REF_NOT_FOUND', `${key} does not exist in approved inputs.`, `${path}.${key}`, 'existing place', record[key]));
  for (const key of ['node_id', 'g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']) if (text(record?.[key]) && !refs.nodeIds.has(record[key])) concerns.push(issue('KNOWLEDGE_MAP_CREATED_PLACE', `${key} does not exist in approved inputs.`, `${path}.${key}`, 'existing node', record[key]));
  const npcId = record?.npc_instance_id ?? record?.npc_id;
  if (text(npcId) && !refs.npcIds.has(npcId)) concerns.push(issue('KNOWLEDGE_MAP_NPC_REF_NOT_FOUND', 'NPC reference does not exist.', `${path}.npc_instance_id`, 'existing NPC', npcId));
  const itemId = record?.item_instance_id ?? record?.item_id;
  if (text(itemId) && !refs.itemIds.has(itemId) && !refs.containerIds.has(itemId)) concerns.push(issue('KNOWLEDGE_MAP_ITEM_REF_NOT_FOUND', 'Item reference does not exist.', `${path}.item_instance_id`, 'existing item', itemId));
  if (arrayName === 'known_routes' && !text(graphEdgeId) && !text(g5EdgeId) && !['approximate', 'direction_only', 'named_only'].includes(record?.precision_level)) concerns.push(issue('KNOWLEDGE_MAP_ROUTE_REF_NOT_FOUND', 'Exact known route requires graph_edge_id or g5_edge_id.', path));
}

function validateKnownRecordHiddenFields(record, path, concerns) {
  const forbiddenKeys = new Set(['hidden_state', 'hidden_truth', 'private_motive', 'future_event', 'event_timer', 'container_contents', 'actual_truth_hidden_from_character']);
  walk(record, (key, value, currentPath) => {
    if (!forbiddenKeys.has(key) || value == null || value === '' || (Array.isArray(value) && value.length === 0)) return;
    if (key === 'future_event' || key === 'event_timer') concerns.push(issue('KNOWLEDGE_MAP_FUTURE_KNOWLEDGE_LEAK', 'Known record contains future knowledge.', currentPath));
    else if (key === 'container_contents') concerns.push(issue('KNOWLEDGE_MAP_CLOSED_CONTAINER_CONTENTS_LEAK', 'Known record contains container contents.', currentPath));
    else if (key === 'private_motive') concerns.push(issue('KNOWLEDGE_MAP_PRIVATE_NPC_MOTIVE_LEAK', 'Known record contains private NPC motive.', currentPath));
    else concerns.push(issue('KNOWLEDGE_MAP_HIDDEN_STATE_LEAK', 'Known record contains hidden-state truth.', currentPath));
  }, path);
}

function validateRumorsAndBoundaries(output, concerns) {
  for (const [index, rumor] of array(output?.rumors).entries()) {
    if (!text(rumor?.source_type) && !text(rumor?.source) && array(rumor?.source_trace).length === 0) concerns.push(issue('KNOWLEDGE_MAP_RUMOR_WITHOUT_SOURCE', 'Rumor requires source/source_type/source_trace.', `rumors[${index}]`));
  }
  if (!Array.isArray(output?.forbidden_knowledge)) concerns.push(issue('KNOWLEDGE_MAP_FORBIDDEN_KNOWLEDGE_MISSING', 'forbidden_knowledge block is required.', 'forbidden_knowledge'));
  const boundary = output?.player_vs_character_knowledge_boundary;
  if (!isObject(boundary) || !isObject(boundary?.ui_guidance)) concerns.push(issue('KNOWLEDGE_MAP_FORBIDDEN_KNOWLEDGE_MISSING', 'player_vs_character_knowledge_boundary.ui_guidance is required.', 'player_vs_character_knowledge_boundary.ui_guidance'));
}

function validateScope(output, input, concerns) {
  const scope = output?.knowledge_scope_summary ?? {};
  if (scope.map_detail_level === 'full_map' || scope.map_detail_level === 'global') concerns.push(issue('KNOWLEDGE_MAP_FULL_MAP_GRANTED', 'Character cannot receive a full map.', 'knowledge_scope_summary.map_detail_level'));
  if (scope.route_knowledge_level === 'exact_routes' && array(input?.world_base_route_snapshot?.known_route_candidates).length === 0) concerns.push(issue('KNOWLEDGE_MAP_ROUTE_KNOWLEDGE_TOO_STRONG', 'Exact routes require approved route candidates.', 'knowledge_scope_summary.route_knowledge_level'));
}

function validateForbiddenSurfaceKeys(output, concerns) {
  for (const key of ['visible_scene', 'intro_prose', 'narrator_prose']) {
    if (hasOwnRecursive(output, key)) concerns.push(issue(key === 'visible_scene' ? 'KNOWLEDGE_MAP_CREATED_VISIBLE_SCENE' : 'KNOWLEDGE_MAP_CREATED_INTRO_PROSE', `${key} is forbidden in Stage 18.`, key));
  }
}

function withAuditPermissions(audit) {
  const pass = audit?.pass === true;
  return {
    ...structuredClone(audit),
    request_id: audit?.request_id ?? null,
    commit_permission: {
      can_commit_character_knowledge: pass,
      can_continue_to_hidden_state: pass
    }
  };
}

function referenceSummary(refs) {
  return {
    graph_edge_count: refs.graphEdgeIds.size,
    g5_edge_count: refs.g5EdgeIds.size,
    place_count: refs.placeIds.size + refs.nodeIds.size,
    npc_count: refs.npcIds.size,
    item_count: refs.itemIds.size,
    container_count: refs.containerIds.size,
    anchor_count: refs.anchorIds.size
  };
}

function basisValues(record) {
  const values = record?.basis ?? record?.knowledge_basis ?? record?.basis_refs ?? [];
  return array(values).map((value) => isObject(value) ? value.basis_type ?? value.type ?? value.id : value).filter(text);
}

function canonicalRecordText(record) {
  const value = record?.statement ?? record?.knowledge_text ?? record?.rumor_text ?? record?.belief_text ?? record?.label ?? record?.name ?? null;
  return text(value) ? String(value).trim().toLowerCase() : '';
}

function routeSnapshotRows(snapshot) {
  return [
    ...array(snapshot?.nearby_graph_edges),
    ...array(snapshot?.known_route_candidates),
    ...array(snapshot?.historical_anchor_candidates),
    ...array(snapshot?.route_knowledge_rule_candidates)
  ];
}

function normalizeRouteSnapshot(value) {
  const source = isObject(value) ? value : emptyWorldBaseRouteSnapshot();
  return {
    version: source.version ?? 1,
    schema: source.schema ?? 'world_base_route_snapshot',
    nearby_graph_edges: array(source.nearby_graph_edges),
    known_route_candidates: array(source.known_route_candidates),
    historical_anchor_candidates: array(source.historical_anchor_candidates),
    route_knowledge_rule_candidates: array(source.route_knowledge_rule_candidates)
  };
}

async function callRole(callback, input, role) {
  try {
    return await callback(structuredClone(input));
  } catch (error) {
    throw stage18Error(`${role} failed: ${error?.message ?? String(error)}`, [issue('KNOWLEDGE_MAP_ROLE_CALL_FAILED', error?.message ?? String(error), role)], { failedGate: role, cause: error });
  }
}

function parseRoleResult(result) {
  const raw = result?.output ?? result?.content ?? result;
  if (isObject(raw)) return { value: structuredClone(raw), raw: structuredClone(raw), parseError: null };
  if (typeof raw !== 'string') return { value: null, raw, parseError: 'Role output is neither object nor JSON string.' };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return { value: JSON.parse(cleaned), raw, parseError: null }; }
  catch (error) { return { value: null, raw, parseError: error.message }; }
}

function stage18Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage18CharacterKnowledgeError';
  error.code = concerns[0]?.code ?? 'KNOWLEDGE_MAP_STAGE_FAILED';
  error.concerns = safeClone(concerns);
  Object.assign(error, details);
  return error;
}

function issue(code, message, field, expected = undefined, actual = undefined) {
  return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) };
}
function requireSchema(concerns, value, schema, field, code) { if (!isObject(value) || value.version !== 1 || value.schema !== schema) concerns.push(issue(code, `${field} must be ${schema} version 1.`, field)); }
function requireAudit(concerns, value, schema, field, code) { requireSchema(concerns, value, schema, field, code); if (value?.pass !== true) concerns.push(issue(code, `${field}.pass must be true.`, `${field}.pass`, true, value?.pass)); }
function collectByKeys(value, set, keys) { walk(value, (key, child) => { if (keys.includes(key)) addText(set, child); }); }
function collectSourceIds(value, set) { collectByKeys(value, set, ['source_id', 'source_ref', 'source_record_id', 'fact_id', 'rule_id']); }
function addText(set, value) { if (text(value)) set.add(String(value)); }
function firstText(value, keys) { for (const key of keys) if (text(value?.[key])) return value[key]; return null; }
function firstTextFromObject(value, keys) { return firstText(value, keys); }
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
function hashJson(value) { return createHash('sha256').update(stableStringify(value)).digest('hex'); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function dedupe(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasOwnRecursive(value, target) { let found = false; walk(value, (key) => { if (key === target) found = true; }); return found; }
function walk(value, visitor, path = 'root') { if (foundTerminal(value)) return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } if (!isObject(value)) return; for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
function foundTerminal(value) { return value == null || typeof value !== 'object'; }
