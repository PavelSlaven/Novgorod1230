export const STAGE19_INPUT_SCHEMA = 'hidden_state_builder_input';
export const STAGE19_OUTPUT_SCHEMA = 'full_hidden_scene_state';
export const STAGE19_PRECHECK_SCHEMA = 'full_hidden_state_code_precheck';
export const STAGE19_AUDIT_SCHEMA = 'full_hidden_state_audit';
export const STAGE19_RESULT_SCHEMA = 'stage19_hidden_state_result';

export const DEFAULT_STAGE19_HIDDEN_STATE_POLICY = Object.freeze({
  require_no_player_output: true,
  require_reveal_conditions_for_every_hidden_fact: true,
  require_source_trace: true,
  require_hidden_fact_ids: true,
  require_risk_triggers: true,
  require_consequence_hooks: true,
  require_npc_private_state_for_scene_or_key_npcs: true,
  allow_minimal_background_npc_hidden_state: true,
  allow_unresolved_container_contents: true,
  allow_materialized_container_contents_only_with_causal_basis: true,
  do_not_create_new_npcs: true,
  do_not_create_new_items: true,
  do_not_create_new_containers: true,
  do_not_create_new_places: true,
  do_not_create_new_anchors: true,
  do_not_create_new_routes: true,
  do_not_write_visible_scene: true,
  do_not_write_intro_prose: true,
  do_not_write_narrator_text: true
});

const OUTPUT_ARRAYS = Object.freeze([
  'hidden_npc_state',
  'hidden_access_state',
  'hidden_property_state',
  'hidden_container_state',
  'hidden_item_state',
  'hidden_risk_state',
  'hidden_event_state',
  'hidden_social_state',
  'hidden_route_state',
  'hidden_environment_state',
  'discovery_rules',
  'reveal_conditions',
  'consequence_hooks',
  'forbidden_output_rules',
  'source_trace'
]);

const BLOCK_ID_FIELDS = Object.freeze({
  hidden_npc_state: 'hidden_npc_state_id',
  hidden_access_state: 'hidden_access_state_id',
  hidden_property_state: 'hidden_property_state_id',
  hidden_container_state: 'hidden_container_state_id',
  hidden_item_state: 'hidden_item_state_id',
  hidden_risk_state: 'hidden_risk_state_id',
  hidden_event_state: 'hidden_event_state_id',
  hidden_social_state: 'hidden_social_state_id',
  hidden_route_state: 'hidden_route_state_id',
  hidden_environment_state: 'hidden_environment_state_id',
  discovery_rules: 'discovery_rule_id',
  reveal_conditions: 'reveal_condition_id',
  consequence_hooks: 'consequence_hook_id',
  forbidden_output_rules: 'forbidden_output_rule_id'
});

const STATUS = new Set(['formed', 'empty_limited', 'blocked', 'requires_repair']);
const FORMAT_STATE_CODES = new Set([
  'HIDDEN_STATE_INVALID_JSON',
  'HIDDEN_STATE_SCHEMA_MISMATCH',
  'HIDDEN_STATE_REQUIRED_BLOCK_MISSING',
  'HIDDEN_STATE_ARRAY_INVALID'
]);
const FORMAT_AUDIT_CODES = new Set([
  'HIDDEN_STATE_AUDIT_INVALID_JSON',
  'HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH',
  'HIDDEN_STATE_AUDIT_REQUIRED_BLOCK_MISSING'
]);

export function normalizeStage19HiddenStatePolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE19_HIDDEN_STATE_POLICY,
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

export function buildStage19HiddenStateInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE19_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    player_character: input.player_character ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    character_knowledge_map: input.character_knowledge_map ?? null,
    character_knowledge_map_audit: input.character_knowledge_map_audit ?? null,
    regional_context_package: input.regional_context_package ?? null,
    world_base_route_snapshot: normalizeRouteSnapshot(input.world_base_route_snapshot),
    hidden_state_policy: normalizeStage19HiddenStatePolicy(input.hidden_state_policy ?? input.policy ?? {})
  };
}

export function validateStage19Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('HIDDEN_STATE_INPUT_INVALID', 'Stage 19 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE19_INPUT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE19_INPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (!text(input.request_id)) concerns.push(issue('HIDDEN_STATE_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));

  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'HIDDEN_STATE_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'HIDDEN_STATE_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'HIDDEN_STATE_SELECTED_START_NODE_INVALID');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'HIDDEN_STATE_PLAYER_CHARACTER_INVALID');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'HIDDEN_STATE_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'HIDDEN_STATE_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'HIDDEN_STATE_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'HIDDEN_STATE_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'HIDDEN_STATE_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'HIDDEN_STATE_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'HIDDEN_STATE_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.character_knowledge_map, 'character_knowledge_map', 'character_knowledge_map', 'HIDDEN_STATE_KNOWLEDGE_MAP_INVALID');
  requireAudit(concerns, input.character_knowledge_map_audit, 'character_knowledge_map_audit', 'character_knowledge_map_audit', 'HIDDEN_STATE_KNOWLEDGE_AUDIT_FAILED');
  requireSchema(concerns, input.regional_context_package, 'regional_context_package', 'regional_context_package', 'HIDDEN_STATE_REGIONAL_CONTEXT_INVALID');
  requireSchema(concerns, input.world_base_route_snapshot, 'world_base_route_snapshot', 'world_base_route_snapshot', 'HIDDEN_STATE_ROUTE_SNAPSHOT_INVALID');

  for (const key of ['nearby_graph_edges', 'known_route_candidates', 'historical_anchor_candidates', 'route_knowledge_rule_candidates']) {
    if (!Array.isArray(input.world_base_route_snapshot?.[key])) {
      concerns.push(issue('HIDDEN_STATE_ROUTE_SNAPSHOT_INVALID', `${key} must be an array.`, `world_base_route_snapshot.${key}`));
    }
  }

  if (input.character_knowledge_map_audit?.commit_permission
    && input.character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state !== true) {
    concerns.push(issue('HIDDEN_STATE_KNOWLEDGE_AUDIT_FAILED', 'Knowledge audit must allow continuation to hidden state.', 'character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state'));
  }
  if (input.time_light_consistency_audit?.commit_permission
    && input.time_light_consistency_audit.commit_permission.can_continue_to_visible_context !== true) {
    concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_AUDIT_FAILED', 'Time/light audit must allow visible-context construction.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  }

  const authoritativeWeather = input.time_light_consistency_audit?.authoritative_frame?.weather_state;
  if (authoritativeWeather && !deepEqual(authoritativeWeather, input.weather_state)) {
    concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'weather_state differs from Stage 17 authoritative weather.', 'weather_state'));
  }

  for (const [key, expected] of Object.entries(DEFAULT_STAGE19_HIDDEN_STATE_POLICY)) {
    if (input.hidden_state_policy?.[key] !== expected) {
      concerns.push(issue('HIDDEN_STATE_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `hidden_state_policy.${key}`, expected, input.hidden_state_policy?.[key]));
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (!isObject(value) || !text(value.request_id)) continue;
    if (value.request_id !== input.request_id) {
      concerns.push(issue('HIDDEN_STATE_REQUEST_ID_MISMATCH', `${key}.request_id differs from Stage 19 request_id.`, `${key}.request_id`, input.request_id, value.request_id));
    }
  }
  return dedupe(concerns);
}

export function buildStage19ReferenceIndex(input) {
  const refs = {
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    anchorIds: new Set(),
    minilocationIds: new Set(),
    g5EdgeIds: new Set(),
    graphEdgeIds: new Set(),
    nodeIds: new Set(),
    propertyBindingIds: new Set(),
    playerCharacterIds: new Set(),
    containerContentIds: new Map(),
    accessStateByTarget: new Map(),
    propertyBindingByTarget: new Map()
  };

  collectByKeys(input.initial_npc_placement, refs.npcIds, ['npc_instance_id', 'npc_id']);
  collectByKeys(input.initial_item_placement, refs.itemIds, ['item_instance_id', 'item_id']);
  collectByKeys(input.initial_item_placement, refs.containerIds, ['container_instance_id', 'container_id']);
  collectByKeys(input.initial_item_placement, refs.propertyBindingIds, ['property_binding_id']);
  collectByKeys(input.player_character, refs.playerCharacterIds, ['player_character_id', 'character_id']);

  const anchors = array(input.g5_scene_graph?.g5_anchors ?? input.g5_scene_graph?.anchors ?? input.g5_scene_graph?.scene_anchors);
  for (const anchor of anchors) addText(refs.anchorIds, anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id);
  const minilocations = array(input.g5_scene_graph?.g5_minilocations ?? input.g5_scene_graph?.minilocations);
  for (const location of minilocations) addText(refs.minilocationIds, location?.g5_minilocation_id ?? location?.minilocation_id ?? location?.id);
  const g5Edges = array(input.g5_scene_graph?.g5_edges ?? input.g5_scene_graph?.edges);
  for (const edge of g5Edges) addText(refs.g5EdgeIds, edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id);

  for (const edge of routeSnapshotEdges(input.world_base_route_snapshot)) {
    addText(refs.graphEdgeIds, edge?.graph_edge_id ?? edge?.edge_id ?? edge?.id);
  }

  collectByKeys(input.selected_start_node, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id', 'selected_node_id', 'graph_node_id']);
  collectByKeys(input.g5_scene_graph?.parent_location, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);

  for (const container of array(input.initial_item_placement?.container_instances ?? input.initial_item_placement?.containers)) {
    const containerId = container?.container_instance_id ?? container?.container_id ?? container?.id;
    if (!text(containerId)) continue;
    const ids = new Set(array(container?.content_instance_ids ?? container?.item_instance_ids ?? container?.contents)
      .map((value) => isObject(value) ? value.item_instance_id ?? value.item_id ?? value.id : value)
      .filter(text));
    refs.containerContentIds.set(containerId, ids);
  }

  indexAccessStates(input.g5_scene_graph?.access_model, refs.accessStateByTarget);
  indexPropertyBindings(input.initial_item_placement, refs.propertyBindingByTarget);
  return refs;
}

export function validateFullHiddenSceneState(output, input, refs = buildStage19ReferenceIndex(input)) {
  const concerns = [];
  if (!isObject(output)) return [issue('HIDDEN_STATE_INVALID_JSON', 'full_hidden_scene_state must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE19_OUTPUT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `Expected ${STAGE19_OUTPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (output.request_id !== input?.request_id) {
    concerns.push(issue('HIDDEN_STATE_REQUEST_ID_MISMATCH', 'Stage 19 output request_id must match input.', 'request_id', input?.request_id, output.request_id));
  }
  if (!STATUS.has(output.hidden_state_status)) {
    concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', 'hidden_state_status is outside the allowed enum.', 'hidden_state_status'));
  }
  for (const key of OUTPUT_ARRAYS) {
    if (!Array.isArray(output[key])) concerns.push(issue('HIDDEN_STATE_ARRAY_INVALID', `${key} must be an array.`, key));
  }
  if (!isObject(output.frame)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'frame must be an object.', 'frame'));
  if (!isObject(output.parent_scene)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'parent_scene must be an object.', 'parent_scene'));
  if (!isObject(output.player_facing_boundary)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'player_facing_boundary must be an object.', 'player_facing_boundary'));
  if (!isObject(output.audit_self_check)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'audit_self_check must be an object.', 'audit_self_check'));

  validateFrameAndParent(output, input, refs, concerns);
  validateForbiddenSurfaces(output, concerns);

  const idRegistry = new Map();
  for (const [arrayName, idField] of Object.entries(BLOCK_ID_FIELDS)) {
    for (const [index, item] of array(output[arrayName]).entries()) {
      const path = `${arrayName}[${index}]`;
      if (!isObject(item)) {
        concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `${path} must be an object.`, path));
        continue;
      }
      registerId(item[idField], path, idRegistry, concerns);
    }
  }

  const factRegistry = new Map();
  validateNpcState(output, refs, factRegistry, idRegistry, concerns);
  validateAccessState(output, refs, factRegistry, concerns);
  validatePropertyState(output, refs, factRegistry, concerns);
  validateContainerState(output, input, refs, factRegistry, concerns);
  validateItemState(output, refs, factRegistry, concerns);
  validateRiskState(output, refs, factRegistry, concerns);
  validateEventState(output, factRegistry, concerns);
  validateSocialState(output, refs, factRegistry, concerns);
  validateRouteState(output, refs, factRegistry, concerns);
  validateEnvironmentState(output, refs, factRegistry, concerns);

  const revealIds = new Set(array(output.reveal_conditions).map((x) => x?.reveal_condition_id).filter(text));
  const discoveryIds = new Set(array(output.discovery_rules).map((x) => x?.discovery_rule_id).filter(text));
  const consequenceIds = new Set(array(output.consequence_hooks).map((x) => x?.consequence_hook_id).filter(text));

  validateDiscoveryRules(output, refs, factRegistry, consequenceIds, concerns);
  validateRevealConditions(output, factRegistry, concerns);
  validateConsequenceHooks(output, refs, concerns);
  validateFactDisclosureLinks(factRegistry, revealIds, discoveryIds, output, concerns);
  validateConsequenceReferences(output, consequenceIds, concerns);
  validateForbiddenCoverage(output, factRegistry, concerns);
  validateKnowledgeBoundary(output, input, concerns);
  validatePropertyBindings(output, refs, concerns);
  validateEmptyLimited(output, input, concerns);

  if (input?.hidden_state_policy?.require_source_trace === true && array(output.source_trace).length === 0) {
    concerns.push(issue('HIDDEN_STATE_SOURCE_MISSING', 'source_trace must not be empty.', 'source_trace'));
  }
  if (!Array.isArray(output.audit_self_check?.evidence) || output.audit_self_check.evidence.length === 0) {
    concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', 'audit_self_check.evidence'));
  }
  if (output.audit_self_check?.pass === false && array(output.audit_self_check?.concerns).length === 0) {
    concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'Failed audit_self_check requires concerns.', 'audit_self_check.concerns'));
  }
  if (output.audit_self_check?.pass !== true) {
    concerns.push(issue('HIDDEN_STATE_SELF_CHECK_FAILED', 'audit_self_check.pass must be true before semantic audit.', 'audit_self_check.pass'));
  }
  return dedupe(concerns);
}

export function buildFullHiddenStateCodePrecheck(output, input, refs = buildStage19ReferenceIndex(input)) {
  const concerns = [
    ...validateStage19Input(input),
    ...validateFullHiddenSceneState(output, input, refs)
  ];
  const failed = (code) => concerns.some((item) => item.code === code && item.severity !== 'warning');
  const prefixFailed = (prefix) => concerns.some((item) => item.code.startsWith(prefix) && item.severity !== 'warning');
  return {
    version: 1,
    schema: STAGE19_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: concerns.every((item) => item.severity === 'warning'),
    checks: {
      schema_valid: !failed('HIDDEN_STATE_SCHEMA_MISMATCH') && !failed('HIDDEN_STATE_INVALID_JSON'),
      all_hidden_fact_ids_present: !failed('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID'),
      all_npc_refs_exist: !failed('HIDDEN_STATE_NPC_REF_NOT_FOUND'),
      all_item_refs_exist: !failed('HIDDEN_STATE_ITEM_REF_NOT_FOUND'),
      all_container_refs_exist: !failed('HIDDEN_STATE_CONTAINER_REF_NOT_FOUND'),
      all_anchor_refs_exist: !failed('HIDDEN_STATE_ANCHOR_REF_NOT_FOUND'),
      all_route_refs_exist: !failed('HIDDEN_STATE_ROUTE_REF_NOT_FOUND') && !failed('HIDDEN_STATE_ROUTE_ID_FORBIDDEN_BEFORE_COMMIT'),
      no_new_entities_created: !prefixFailed('HIDDEN_STATE_CREATED_'),
      reveal_conditions_present: !failed('HIDDEN_STATE_NO_REVEAL_CONDITION'),
      discovery_rules_present: !failed('HIDDEN_STATE_NO_DISCOVERY_RULE'),
      consequence_hooks_valid: !prefixFailed('HIDDEN_STATE_CONSEQUENCE_'),
      forbidden_output_rules_present: !failed('HIDDEN_STATE_FORBIDDEN_OUTPUT_RULE_MISSING'),
      no_visible_scene_created: !failed('HIDDEN_STATE_CREATED_VISIBLE_SCENE'),
      no_intro_prose_created: !failed('HIDDEN_STATE_CREATED_INTRO_PROSE'),
      no_narrator_text_created: !failed('HIDDEN_STATE_CREATED_NARRATOR_TEXT'),
      source_trace_present: !failed('HIDDEN_STATE_SOURCE_MISSING'),
      character_knowledge_consistent: !failed('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT'),
      time_light_consistent: !failed('HIDDEN_STATE_TIME_LIGHT_CONFLICT'),
      property_bindings_consistent: !failed('HIDDEN_STATE_PROPERTY_CONFLICT')
    },
    concerns,
    evidence: concerns.length === 0
      ? [{ kind: 'stage19_code_precheck', result: 'passed' }]
      : concerns.map((item) => ({ kind: 'validation_issue', code: item.code, field: item.field }))
  };
}

export function buildFullHiddenStateAuditInput(input, output, precheck, refs = buildStage19ReferenceIndex(input)) {
  return {
    version: 1,
    schema: 'full_hidden_state_audit_input',
    request_id: input?.request_id ?? null,
    hidden_state_builder_input: structuredClone(input),
    full_hidden_scene_state: structuredClone(output),
    full_hidden_state_code_precheck: structuredClone(precheck),
    reference_index_summary: {
      npc_ids: [...refs.npcIds],
      item_ids: [...refs.itemIds],
      container_ids: [...refs.containerIds],
      anchor_ids: [...refs.anchorIds],
      g5_edge_ids: [...refs.g5EdgeIds],
      graph_edge_ids: [...refs.graphEdgeIds],
      route_ids_allowed_before_commit: []
    },
    audit_policy: {
      do_not_repair: true,
      require_evidence: true,
      reject_new_entities: true,
      reject_player_facing_output: true,
      reject_hidden_leaks: true
    }
  };
}

export function validateFullHiddenStateAudit(audit, output, precheck) {
  const concerns = [];
  if (!isObject(audit)) return [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', 'FullHiddenStateAuditor must return a JSON object.', 'audit')];
  if (audit.version !== 1 || audit.schema !== STAGE19_AUDIT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE19_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  }
  if (typeof audit.pass !== 'boolean') concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'audit.pass must be boolean.', 'audit.pass'));
  if (!Array.isArray(audit.concerns)) concerns.push(issue('HIDDEN_STATE_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence)) concerns.push(issue('HIDDEN_STATE_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.evidence must be an array.', 'audit.evidence'));
  if (audit.pass === true) {
    if (array(audit.concerns).length > 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Passing audit must have empty concerns.', 'audit.concerns'));
    if (array(audit.evidence).length === 0) concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'Passing audit requires evidence.', 'audit.evidence'));
    if (precheck?.pass !== true) concerns.push(issue('HIDDEN_STATE_AUDIT_PRECHECK_MISMATCH', 'Audit cannot pass when code precheck failed.', 'audit.pass'));
    if (output?.audit_self_check?.pass !== true) concerns.push(issue('HIDDEN_STATE_AUDIT_PRECHECK_MISMATCH', 'Audit cannot pass when output self-check failed.', 'audit.pass'));
  } else {
    if (array(audit.concerns).length === 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Failed audit requires concerns.', 'audit.concerns'));
    if (array(audit.evidence).length === 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Failed audit requires evidence.', 'audit.evidence'));
  }
  if (hasForbiddenRepairFields(audit)) {
    concerns.push(issue('HIDDEN_STATE_AUDITOR_MUTATED_OUTPUT', 'Auditor output must not contain repaired hidden state.', 'audit'));
  }
  return dedupe(concerns);
}

export function classifyStage19Failure({ parseError = null, validationIssues = [], audit = null } = {}) {
  if (parseError) return 'format';
  const issues = array(validationIssues);
  if (issues.length > 0 && issues.every((item) => FORMAT_STATE_CODES.has(item.code) || FORMAT_AUDIT_CODES.has(item.code))) return 'format';
  if (audit?.pass === false || issues.length > 0) return 'semantic';
  return 'unknown';
}

export function validateStage19CommitPermission(output, precheck, audit) {
  const reasons = [];
  if (output?.schema !== STAGE19_OUTPUT_SCHEMA || output?.version !== 1) reasons.push('invalid_hidden_state_schema');
  if (!['formed', 'empty_limited'].includes(output?.hidden_state_status)) reasons.push('hidden_state_not_commit_ready');
  if (precheck?.schema !== STAGE19_PRECHECK_SCHEMA || precheck?.pass !== true) reasons.push('code_precheck_failed');
  if (audit?.schema !== STAGE19_AUDIT_SCHEMA || audit?.pass !== true) reasons.push('semantic_audit_failed');
  return {
    can_continue_to_visible_context: reasons.length === 0,
    reasons
  };
}

export async function runStage19HiddenStateBlock({
  input,
  build,
  audit,
  formatRepair,
  semanticRepair,
  seniorRepair
} = {}) {
  const inputConcerns = validateStage19Input(input);
  if (inputConcerns.length > 0) {
    throw stage19Error('Stage 19 input gate failed.', inputConcerns, {
      failedGate: 'stage19_input_gate',
      input_snapshot: safeClone(input),
      terminal: true
    });
  }
  for (const [name, callback] of Object.entries({ build, audit, formatRepair, semanticRepair, seniorRepair })) {
    if (typeof callback !== 'function') throw new Error(`Stage 19 requires ${name} callback.`);
  }

  const refs = buildStage19ReferenceIndex(input);
  const repairHistory = [];
  let candidate = await callRole(build, structuredClone(input), 'FullHiddenStateBuilder');
  candidate = await normalizeStateFormat(candidate, input, formatRepair, repairHistory, 'builder');

  let lastPrecheck = null;
  let lastAudit = null;
  for (let semanticAttempt = 0; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildFullHiddenStateCodePrecheck(candidate.value, input, refs);
    if (lastPrecheck.pass === true) {
      let auditResult = await callRole(
        audit,
        buildFullHiddenStateAuditInput(input, candidate.value, lastPrecheck, refs),
        'FullHiddenStateAuditor'
      );
      auditResult = await normalizeAuditFormat(auditResult, input, candidate.value, lastPrecheck, formatRepair, repairHistory);
      const auditValidation = validateFullHiddenStateAudit(auditResult.value, candidate.value, lastPrecheck);
      if (auditValidation.length > 0) {
        throw stage19Error('Stage 19 audit output is invalid after format repair.', auditValidation, {
          failedGate: 'full_hidden_state_audit_contract',
          full_hidden_scene_state: safeClone(candidate.value),
          code_precheck: safeClone(lastPrecheck),
          full_hidden_state_audit: safeClone(auditResult.value),
          repair_history: safeClone(repairHistory),
          terminal: true
        });
      }
      lastAudit = auditResult.value;
      if (lastAudit.pass === true) {
        const commitPermission = validateStage19CommitPermission(candidate.value, lastPrecheck, lastAudit);
        if (!commitPermission.can_continue_to_visible_context) {
          throw stage19Error('Stage 19 commit gate denied continuation.', commitPermission.reasons.map((reason) => issue('HIDDEN_STATE_COMMIT_DENIED', reason, 'commit_permission')), {
            failedGate: 'stage19_commit_gate',
            full_hidden_scene_state: safeClone(candidate.value),
            code_precheck: safeClone(lastPrecheck),
            full_hidden_state_audit: safeClone(lastAudit),
            terminal: true
          });
        }
        return {
          version: 1,
          schema: STAGE19_RESULT_SCHEMA,
          request_id: input.request_id,
          pass: true,
          full_hidden_scene_state: structuredClone(candidate.value),
          full_hidden_state_code_precheck: structuredClone(lastPrecheck),
          full_hidden_state_audit: structuredClone(lastAudit),
          repair_history: structuredClone(repairHistory),
          diagnostics: {
            reference_index_summary: {
              npc_count: refs.npcIds.size,
              item_count: refs.itemIds.size,
              container_count: refs.containerIds.size,
              anchor_count: refs.anchorIds.size,
              g5_edge_count: refs.g5EdgeIds.size,
              graph_edge_count: refs.graphEdgeIds.size,
              route_id_count_before_commit: 0
            }
          },
          commit_permission: commitPermission
        };
      }
    }

    const semanticIssues = lastPrecheck.pass === true
      ? array(lastAudit?.concerns)
      : array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) {
      throw stage19Error('Stage 19 semantic repair escalation exhausted.', semanticIssues, {
        failedGate: lastPrecheck.pass === true ? 'full_hidden_state_semantic_audit' : 'full_hidden_state_code_precheck',
        full_hidden_scene_state: safeClone(candidate.value),
        code_precheck: safeClone(lastPrecheck),
        full_hidden_state_audit: safeClone(lastAudit),
        repair_history: safeClone(repairHistory),
        terminal: true
      });
    }

    const role = semanticAttempt === 0 ? 'FullHiddenStateSemanticRepairer' : 'FullHiddenStateSeniorRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repairInput = {
      version: 1,
      schema: 'full_hidden_state_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE19_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      original_full_hidden_scene_state: safeClone(candidate.value),
      validationErrors: safeClone(lastPrecheck.concerns ?? []),
      audit: safeClone(lastAudit),
      audit_concerns: safeClone(lastAudit?.concerns ?? []),
      audit_evidence: safeClone(lastAudit?.evidence ?? []),
      repair_history: safeClone(repairHistory),
      forbidden_changes: [
        'new_npc', 'new_item', 'new_container', 'new_g5_anchor', 'new_graph_edge', 'new_route_id',
        'visible_scene', 'intro_prose', 'narrator_text', 'character_knowledge_map', 'clock', 'season', 'weather_state'
      ]
    };
    const repaired = await callRole(repair, repairInput, role);
    repairHistory.push({
      attempt_index: repairHistory.length + 1,
      kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic',
      role,
      source: lastPrecheck.pass === true ? 'semantic_audit' : 'code_precheck',
      issue_codes: semanticIssues.map((item) => item?.code).filter(Boolean)
    });
    candidate = await normalizeStateFormat(repaired, input, formatRepair, repairHistory, role);
    lastAudit = null;
  }

  throw stage19Error('Stage 19 failed unexpectedly.', [issue('HIDDEN_STATE_UNKNOWN_FAILURE', 'Unknown Stage 19 failure.', 'root')], { terminal: true });
}

async function normalizeStateFormat(result, input, formatRepair, repairHistory, sourceRole) {
  const parsed = isParsedRoleResult(result) ? result : parseRoleResult(result);
  let value = parsed.value;
  let validation = parsed.parseError
    ? [issue('HIDDEN_STATE_INVALID_JSON', parsed.parseError, 'root')]
    : formatOnlyStateValidation(value);
  if (validation.length === 0) return parsed;

  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'full_hidden_state_format_repair_input',
    request_id: input.request_id,
    target: STAGE19_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(value),
    validation_errors: validation,
    original_input: structuredClone(input),
    constraints: {
      change_format_only: true,
      do_not_add_hidden_facts: true,
      do_not_remove_hidden_facts: true,
      do_not_create_entities: true,
      remove_player_facing_prose: true
    }
  }, 'FullHiddenStateFormatRepairer');
  repairHistory.push({
    attempt_index: repairHistory.length + 1,
    kind: 'format',
    role: 'FullHiddenStateFormatRepairer',
    source: sourceRole,
    issue_codes: validation.map((item) => item.code)
  });
  const normalized = isParsedRoleResult(repaired) ? repaired : parseRoleResult(repaired);
  if (normalized.parseError) return normalized;
  validation = formatOnlyStateValidation(normalized.value);
  if (validation.length > 0) return { ...normalized, formatValidation: validation };
  return normalized;
}

async function normalizeAuditFormat(result, input, state, precheck, formatRepair, repairHistory) {
  const parsed = isParsedRoleResult(result) ? result : parseRoleResult(result);
  const validation = parsed.parseError
    ? [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', parsed.parseError, 'audit')]
    : validateFullHiddenStateAudit(parsed.value, state, precheck);
  const formatIssues = validation.filter((item) => FORMAT_AUDIT_CODES.has(item.code));
  if (validation.length === 0 || formatIssues.length === 0) return parsed;

  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'full_hidden_state_format_repair_input',
    request_id: input.request_id,
    target: STAGE19_AUDIT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    full_hidden_scene_state: structuredClone(state),
    full_hidden_state_code_precheck: structuredClone(precheck),
    constraints: {
      change_format_only: true,
      do_not_change_pass_semantics: true,
      do_not_repair_hidden_state: true
    }
  }, 'FullHiddenStateFormatRepairer');
  repairHistory.push({
    attempt_index: repairHistory.length + 1,
    kind: 'audit_format',
    role: 'FullHiddenStateFormatRepairer',
    source: 'FullHiddenStateAuditor',
    issue_codes: validation.map((item) => item.code)
  });
  return isParsedRoleResult(repaired) ? repaired : parseRoleResult(repaired);
}

function formatOnlyStateValidation(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('HIDDEN_STATE_INVALID_JSON', 'Output must be an object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE19_OUTPUT_SCHEMA) concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `Expected ${STAGE19_OUTPUT_SCHEMA} version 1.`, 'schema'));
  for (const key of OUTPUT_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('HIDDEN_STATE_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['frame', 'parent_scene', 'player_facing_boundary', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));
  return concerns;
}

function validateFrameAndParent(output, input, refs, concerns) {
  const frame = output.frame ?? {};
  const historical = input?.historical_frame ?? {};
  const expectedRegion = historical?.region?.region_id ?? historical?.region_id ?? null;
  const expectedYear = historical?.year?.value ?? historical?.year ?? null;
  const expectedSeason = historical?.calendar?.season ?? null;
  if (expectedRegion && frame.region_id !== expectedRegion) concerns.push(issue('HIDDEN_STATE_CREATED_PARENT_LOCATION', 'frame.region_id must match historical_frame.', 'frame.region_id', expectedRegion, frame.region_id));
  if (expectedYear != null && frame.year !== expectedYear) concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'frame.year must match historical_frame.', 'frame.year', expectedYear, frame.year));
  if (expectedSeason && frame.season !== expectedSeason) concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'frame.season must match historical_frame.', 'frame.season', expectedSeason, frame.season));
  if (!deepEqual(frame.clock ?? null, historical?.clock ?? null)) concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'frame.clock must match historical_frame.clock.', 'frame.clock'));
  if (!deepEqual(frame.weather_state ?? null, input?.weather_state ?? null)) concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'frame.weather_state must match input weather_state.', 'frame.weather_state'));

  const selectedG4 = input?.selected_start_node?.selected_node_chain?.g4_node_id
    ?? input?.selected_start_node?.selected?.g4_node_id
    ?? input?.g5_scene_graph?.parent_location?.g4_node_id
    ?? null;
  if (selectedG4 && output.parent_scene?.g4_node_id !== selectedG4) concerns.push(issue('HIDDEN_STATE_CREATED_PARENT_LOCATION', 'parent_scene.g4_node_id must match selected G4.', 'parent_scene.g4_node_id', selectedG4, output.parent_scene?.g4_node_id));
  validateRef(output.parent_scene?.player_current_anchor_id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', 'parent_scene.player_current_anchor_id', concerns);
}

function validateForbiddenSurfaces(output, concerns) {
  const forbidden = [
    ['visible_scene', 'HIDDEN_STATE_CREATED_VISIBLE_SCENE'],
    ['intro_prose', 'HIDDEN_STATE_CREATED_INTRO_PROSE'],
    ['narrator_text', 'HIDDEN_STATE_CREATED_NARRATOR_TEXT'],
    ['narrator_prose', 'HIDDEN_STATE_CREATED_NARRATOR_TEXT'],
    ['player_choice_labels', 'HIDDEN_STATE_CREATED_VISIBLE_SCENE'],
    ['map_ui_visible_labels', 'HIDDEN_STATE_CREATED_VISIBLE_SCENE'],
    ['journal_player_text', 'HIDDEN_STATE_CREATED_VISIBLE_SCENE'],
    ['new_npcs', 'HIDDEN_STATE_CREATED_NPC'],
    ['new_items', 'HIDDEN_STATE_CREATED_ITEM'],
    ['new_containers', 'HIDDEN_STATE_CREATED_CONTAINER'],
    ['new_g5_anchors', 'HIDDEN_STATE_CREATED_G5_ANCHOR'],
    ['new_routes', 'HIDDEN_STATE_CREATED_ROUTE']
  ];
  for (const [key, code] of forbidden) {
    if (hasOwnRecursive(output, key)) concerns.push(issue(code, `${key} is forbidden in Stage 19 output.`, key));
  }
}

function validateNpcState(output, refs, factRegistry, idRegistry, concerns) {
  for (const [i, state] of array(output.hidden_npc_state).entries()) {
    const path = `hidden_npc_state[${i}]`;
    validateRef(state?.npc_instance_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.npc_instance_id`, concerns);
    if (['scene', 'key'].includes(state?.npc_profile_level)) {
      const meaningful = array(state?.private_motives).length + array(state?.private_constraints).length + array(state?.private_knowledge).length > 0;
      if (!meaningful) concerns.push(issue('HIDDEN_STATE_NPC_PRIVATE_STATE_MISSING', 'Scene/key NPC requires private state.', path));
    }
    for (const [key, idField] of [['private_motives', 'motive_id'], ['private_constraints', 'constraint_id'], ['private_knowledge', 'private_knowledge_id']]) {
      for (const [j, fact] of array(state?.[key]).entries()) {
        const factPath = `${path}.${key}[${j}]`;
        registerId(fact?.[idField], factPath, idRegistry, concerns);
        registerFact(factRegistry, fact?.[idField], fact, factPath, key === 'private_motives' ? 'npc_private_motive' : 'npc_private_fact');
        if (key === 'private_motives' && (fact?.known_to_player === true || fact?.visible === true)) concerns.push(issue('HIDDEN_STATE_NPC_PRIVATE_MOTIVE_VISIBLE', 'NPC private motive cannot be visible.', factPath));
      }
    }
  }
}

function validateAccessState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_access_state).entries()) {
    const path = `hidden_access_state[${i}]`;
    registerFact(factRegistry, state?.hidden_access_state_id, state, path, 'hidden_access');
    validateTypedTarget(state?.access_target, refs, `${path}.access_target`, concerns);
    if (state?.access_requirements?.requires_npc_permission_id) validateRef(state.access_requirements.requires_npc_permission_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.access_requirements.requires_npc_permission_id`, concerns);
    if (state?.control?.controller_type === 'npc' && state?.control?.controller_id) validateRef(state.control.controller_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.control.controller_id`, concerns);
  }
}

function validatePropertyState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_property_state).entries()) {
    const path = `hidden_property_state[${i}]`;
    registerFact(factRegistry, state?.hidden_property_state_id, state, path, 'true_ownership');
    validateTypedTarget(state?.property_target, refs, `${path}.property_target`, concerns);
    const targetId = state?.property_target?.target_id;
    if (state?.ownership_truth?.known_to_player === true && state?.ownership_truth?.known_to_character !== true) concerns.push(issue('HIDDEN_STATE_TRUE_OWNERSHIP_VISIBLE', 'True ownership cannot be player-visible when character does not know it.', `${path}.ownership_truth`));
    if (state?.ownership_truth?.controller_model === 'npc' && state?.ownership_truth?.controller_id) validateRef(state.ownership_truth.controller_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.ownership_truth.controller_id`, concerns);
    if (state?.ownership_truth?.holder_model === 'npc' && state?.ownership_truth?.holder_id) validateRef(state.ownership_truth.holder_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.ownership_truth.holder_id`, concerns);
    if (state?.ownership_truth?.holder_model === 'container' && state?.ownership_truth?.holder_id) validateRef(state.ownership_truth.holder_id, refs.containerIds, 'HIDDEN_STATE_CONTAINER_REF_NOT_FOUND', `${path}.ownership_truth.holder_id`, concerns);
    if (state?.ownership_truth?.holder_model === 'anchor' && state?.ownership_truth?.holder_id) validateRef(state.ownership_truth.holder_id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.ownership_truth.holder_id`, concerns);
    if (!text(targetId)) concerns.push(issue('HIDDEN_STATE_PROPERTY_CONFLICT', 'Property target id is required.', `${path}.property_target.target_id`));
  }
}

function validateContainerState(output, input, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_container_state).entries()) {
    const path = `hidden_container_state[${i}]`;
    registerFact(factRegistry, state?.hidden_container_state_id, state, path, 'closed_container');
    validateRef(state?.container_instance_id, refs.containerIds, 'HIDDEN_STATE_CONTAINER_REF_NOT_FOUND', `${path}.container_instance_id`, concerns);
    const contentIds = array(state?.content_truth?.content_instance_ids);
    for (const [j, id] of contentIds.entries()) validateRef(id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.content_truth.content_instance_ids[${j}]`, concerns);
    const approved = refs.containerContentIds.get(state?.container_instance_id) ?? new Set();
    if (contentIds.some((id) => !approved.has(id))) concerns.push(issue('HIDDEN_STATE_CREATED_ITEM', 'Stage 19 cannot materialize new container contents.', `${path}.content_truth.content_instance_ids`));
    if (state?.content_truth?.content_summary_for_system != null && approved.size === 0) concerns.push(issue('HIDDEN_STATE_CREATED_ITEM', 'Unmaterialized container content summary is forbidden.', `${path}.content_truth.content_summary_for_system`));
    if (state?.content_truth?.content_known_to_player === true || state?.content_truth?.visible === true) concerns.push(issue('HIDDEN_STATE_CONTAINER_CONTENTS_VISIBLE', 'Closed container contents cannot be player-visible.', `${path}.content_truth`));
    if (state?.access_truth?.controller_id) validateRef(state.access_truth.controller_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.access_truth.controller_id`, concerns);
  }
}

function validateItemState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_item_state).entries()) {
    const path = `hidden_item_state[${i}]`;
    registerFact(factRegistry, state?.hidden_item_state_id, state, path, 'hidden_item');
    validateRef(state?.item_instance_id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.item_instance_id`, concerns);
    for (const [j, npcId] of array(state?.known_layers?.known_to_npc_ids).entries()) validateRef(npcId, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.known_layers.known_to_npc_ids[${j}]`, concerns);
  }
}

function validateRiskState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_risk_state).entries()) {
    const path = `hidden_risk_state[${i}]`;
    registerFact(factRegistry, state?.hidden_risk_state_id, state, path, 'hidden_risk');
    validateTypedTarget(state?.risk_target, refs, `${path}.risk_target`, concerns, true);
    if (array(state?.trigger_conditions).length === 0) concerns.push(issue('HIDDEN_STATE_RISK_WITHOUT_TRIGGER', 'Every hidden risk requires trigger_conditions.', `${path}.trigger_conditions`));
  }
}

function validateEventState(output, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_event_state).entries()) {
    const path = `hidden_event_state[${i}]`;
    registerFact(factRegistry, state?.hidden_event_state_id, state, path, 'future_event');
    if (!isObject(state?.trigger) || !text(state.trigger.trigger_type)) concerns.push(issue('HIDDEN_STATE_EVENT_WITHOUT_TRIGGER', 'Every hidden event requires a trigger.', `${path}.trigger`));
    if (!isObject(state?.effect) || !text(state.effect.effect_type)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Every hidden event requires an effect.', `${path}.effect`));
    if (state?.event_visibility?.known_to_player === true || state?.event_visibility?.must_not_reveal_until_triggered === false) concerns.push(issue('HIDDEN_STATE_FUTURE_EVENT_VISIBLE', 'Future event cannot be directly visible.', `${path}.event_visibility`));
  }
}

function validateSocialState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_social_state).entries()) {
    const path = `hidden_social_state[${i}]`;
    registerFact(factRegistry, state?.hidden_social_state_id, state, path, 'hidden_social');
    for (const [j, id] of array(state?.applies_to?.npc_instance_ids).entries()) validateRef(id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.applies_to.npc_instance_ids[${j}]`, concerns);
    for (const [j, id] of array(state?.applies_to?.item_instance_ids).entries()) validateRef(id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.applies_to.item_instance_ids[${j}]`, concerns);
    for (const [j, id] of array(state?.applies_to?.container_instance_ids).entries()) validateRef(id, refs.containerIds, 'HIDDEN_STATE_CONTAINER_REF_NOT_FOUND', `${path}.applies_to.container_instance_ids[${j}]`, concerns);
    for (const [j, id] of array(state?.applies_to?.anchor_ids).entries()) validateRef(id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.applies_to.anchor_ids[${j}]`, concerns);
    for (const [j, id] of array(state?.who_enforces?.npc_instance_ids).entries()) validateRef(id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.who_enforces.npc_instance_ids[${j}]`, concerns);
  }
}

function validateRouteState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_route_state).entries()) {
    const path = `hidden_route_state[${i}]`;
    registerFact(factRegistry, state?.hidden_route_state_id, state, path, 'hidden_route');
    const route = state?.route_ref ?? {};
    if (route.route_id != null) concerns.push(issue('HIDDEN_STATE_ROUTE_ID_FORBIDDEN_BEFORE_COMMIT', 'route_id must be null before Stage 24-25 commit.', `${path}.route_ref.route_id`, null, route.route_id));
    if (route.g5_edge_id != null) validateRef(route.g5_edge_id, refs.g5EdgeIds, 'HIDDEN_STATE_ROUTE_REF_NOT_FOUND', `${path}.route_ref.g5_edge_id`, concerns);
    if (route.graph_edge_id != null) validateRef(route.graph_edge_id, refs.graphEdgeIds, 'HIDDEN_STATE_ROUTE_REF_NOT_FOUND', `${path}.route_ref.graph_edge_id`, concerns);
    if (!text(route.g5_edge_id) && !text(route.graph_edge_id)) concerns.push(issue('HIDDEN_STATE_ROUTE_REF_NOT_FOUND', 'Hidden route state requires g5_edge_id or graph_edge_id.', `${path}.route_ref`));
  }
}

function validateEnvironmentState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_environment_state).entries()) {
    const path = `hidden_environment_state[${i}]`;
    registerFact(factRegistry, state?.hidden_environment_state_id, state, path, 'hidden_environment');
    validateTypedTarget(state?.environment_target, refs, `${path}.environment_target`, concerns, true);
  }
}

function validateDiscoveryRules(output, refs, factRegistry, consequenceIds, concerns) {
  for (const [i, rule] of array(output.discovery_rules).entries()) {
    const path = `discovery_rules[${i}]`;
    for (const [j, id] of array(rule?.hidden_fact_ids).entries()) if (!factRegistry.has(id)) concerns.push(issue('HIDDEN_STATE_NO_DISCOVERY_RULE', 'Discovery rule references unknown hidden fact.', `${path}.hidden_fact_ids[${j}]`, null, id));
    if (rule?.requirements?.required_anchor_id) validateRef(rule.requirements.required_anchor_id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.requirements.required_anchor_id`, concerns);
    if (rule?.requirements?.required_tool_item_id) validateRef(rule.requirements.required_tool_item_id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.requirements.required_tool_item_id`, concerns);
    if (rule?.requirements?.required_npc_id) validateRef(rule.requirements.required_npc_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.requirements.required_npc_id`, concerns);
    for (const [j, id] of array(rule?.result_if_failure?.consequence_hook_ids).entries()) if (!consequenceIds.has(id)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Discovery rule references unknown consequence hook.', `${path}.result_if_failure.consequence_hook_ids[${j}]`, null, id));
  }
}

function validateRevealConditions(output, factRegistry, concerns) {
  for (const [i, condition] of array(output.reveal_conditions).entries()) {
    const path = `reveal_conditions[${i}]`;
    if (!factRegistry.has(condition?.hidden_fact_id)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Reveal condition references unknown hidden fact.', `${path}.hidden_fact_id`, null, condition?.hidden_fact_id));
    if (!text(condition?.condition_type)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Reveal condition requires condition_type.', `${path}.condition_type`));
  }
}

function validateConsequenceHooks(output, refs, concerns) {
  for (const [i, hook] of array(output.consequence_hooks).entries()) {
    const path = `consequence_hooks[${i}]`;
    if (array(hook?.trigger_conditions).length === 0) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Consequence hook requires trigger_conditions.', `${path}.trigger_conditions`));
    if (!text(hook?.effect_scope)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence hook requires effect_scope.', `${path}.effect_scope`));
    if (!text(hook?.effect_summary_for_system)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence hook requires effect_summary_for_system.', `${path}.effect_summary_for_system`));
    for (const [j, write] of array(hook?.writes).entries()) {
      if (!text(write?.table) || !['insert', 'update'].includes(write?.operation) || !text(write?.record_ref)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence write requires table, operation and record_ref.', `${path}.writes[${j}]`));
    }
    validateKnownRecordRef(hook, refs, path, concerns);
  }
}

function validateFactDisclosureLinks(factRegistry, revealIds, discoveryIds, output, concerns) {
  const revealByFact = new Map();
  for (const condition of array(output.reveal_conditions)) addMapSet(revealByFact, condition?.hidden_fact_id, condition?.reveal_condition_id);
  const discoveryByFact = new Map();
  for (const rule of array(output.discovery_rules)) for (const id of array(rule?.hidden_fact_ids)) addMapSet(discoveryByFact, id, rule?.discovery_rule_id);

  for (const [id, fact] of factRegistry.entries()) {
    const ownReveal = array(fact.value?.reveal_condition_ids);
    const ownDiscovery = array(fact.value?.discovery_rule_ids);
    for (const [i, ref] of ownReveal.entries()) if (!revealIds.has(ref)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Hidden fact references unknown reveal condition.', `${fact.path}.reveal_condition_ids[${i}]`, null, ref));
    for (const [i, ref] of ownDiscovery.entries()) if (!discoveryIds.has(ref)) concerns.push(issue('HIDDEN_STATE_NO_DISCOVERY_RULE', 'Hidden fact references unknown discovery rule.', `${fact.path}.discovery_rule_ids[${i}]`, null, ref));
    const implicitEventRule = fact.kind === 'future_event'
      && fact.value?.event_visibility?.must_not_reveal_until_triggered === true
      && text(fact.value?.trigger?.trigger_type);
    const systemOnly = fact.value?.system_only === true && text(fact.value?.system_only_reason ?? fact.value?.reason);
    const hasReveal = ownReveal.length > 0 || (revealByFact.get(id)?.size ?? 0) > 0;
    const hasDiscovery = ownDiscovery.length > 0 || (discoveryByFact.get(id)?.size ?? 0) > 0;
    if (!hasReveal && !hasDiscovery && !systemOnly && !implicitEventRule) {
      concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Hidden fact requires reveal/discovery or system_only reason.', fact.path, null, id));
      if (fact.value?.system_only === true && !text(fact.value?.system_only_reason ?? fact.value?.reason)) concerns.push(issue('HIDDEN_STATE_NO_SYSTEM_ONLY_REASON', 'system_only hidden fact requires a reason.', fact.path));
    }
  }
}

function validateConsequenceReferences(output, consequenceIds, concerns) {
  for (const arrayName of ['hidden_npc_state', 'hidden_access_state', 'hidden_property_state', 'hidden_container_state', 'hidden_item_state', 'hidden_risk_state', 'hidden_social_state']) {
    for (const [i, item] of array(output[arrayName]).entries()) {
      const ids = array(item?.consequence_hook_ids ?? item?.consequence_hooks);
      for (const [j, id] of ids.entries()) if (!consequenceIds.has(id)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Hidden fact references unknown consequence hook.', `${arrayName}[${i}].consequence_hook_ids[${j}]`, null, id));
    }
  }
}

function validateForbiddenCoverage(output, factRegistry, concerns) {
  const covered = new Set();
  for (const rule of array(output.forbidden_output_rules)) for (const id of array(rule?.hidden_fact_ids)) covered.add(id);
  for (const [id, fact] of factRegistry.entries()) {
    if (!['npc_private_motive', 'closed_container', 'future_event', 'true_ownership', 'hidden_risk'].includes(fact.kind)) continue;
    if (!covered.has(id)) concerns.push(issue('HIDDEN_STATE_FORBIDDEN_OUTPUT_RULE_MISSING', `Sensitive hidden fact ${id} is not covered by forbidden_output_rules.`, fact.path));
  }
}

function validateKnowledgeBoundary(output, input, concerns) {
  const forbiddenIds = new Set();
  collectByKeys(input?.character_knowledge_map?.forbidden_knowledge, forbiddenIds, ['hidden_fact_id', 'fact_id', 'target_id', 'item_instance_id', 'container_instance_id', 'npc_instance_id']);
  for (const state of array(output.hidden_property_state)) {
    const targetId = state?.property_target?.target_id;
    if (forbiddenIds.has(targetId) && state?.ownership_truth?.known_to_character === true) concerns.push(issue('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT', 'Ownership marked known despite forbidden knowledge.', 'hidden_property_state.ownership_truth.known_to_character', false, true));
  }
  for (const state of array(output.hidden_item_state)) {
    const known = new Set(array(state?.known_layers?.known_to_character));
    const unknown = new Set(array(state?.known_layers?.unknown_to_character));
    for (const fact of known) if (unknown.has(fact)) concerns.push(issue('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT', 'Item fact cannot be both known and unknown.', 'hidden_item_state.known_layers'));
  }
}

function validatePropertyBindings(output, refs, concerns) {
  for (const [i, state] of array(output.hidden_property_state).entries()) {
    const targetId = state?.property_target?.target_id;
    const binding = refs.propertyBindingByTarget.get(targetId);
    if (!binding) continue;
    const truth = state?.ownership_truth ?? {};
    for (const [outputKey, inputKeys] of Object.entries({
      owner_id: ['owner_id', 'owner_ref'],
      holder_id: ['holder_id', 'holder_ref'],
      controller_id: ['controller_id', 'controller_ref']
    })) {
      const expected = firstText(binding, inputKeys);
      const actual = truth[outputKey];
      if (expected && actual && expected !== actual) concerns.push(issue('HIDDEN_STATE_PROPERTY_CONFLICT', `${outputKey} conflicts with approved item/property binding.`, `hidden_property_state[${i}].ownership_truth.${outputKey}`, expected, actual));
    }
  }
}

function validateEmptyLimited(output, input, concerns) {
  if (output.hidden_state_status !== 'empty_limited') return;
  const nonEmpty = [
    'hidden_npc_state', 'hidden_access_state', 'hidden_property_state', 'hidden_container_state', 'hidden_item_state',
    'hidden_risk_state', 'hidden_event_state', 'hidden_social_state', 'hidden_route_state', 'hidden_environment_state',
    'discovery_rules', 'reveal_conditions', 'consequence_hooks', 'forbidden_output_rules'
  ].filter((key) => array(output[key]).length > 0);
  if (nonEmpty.length > 0) concerns.push(issue('HIDDEN_STATE_EMPTY_LIMITED_INVALID', `empty_limited cannot contain hidden facts: ${nonEmpty.join(', ')}.`, 'hidden_state_status'));
  const sceneOrKeyNpc = array(input?.initial_npc_placement?.npc_instances ?? input?.initial_npc_placement?.placements)
    .some((npc) => ['scene', 'key'].includes(npc?.npc_profile_level ?? npc?.profile_level));
  const containers = array(input?.initial_item_placement?.container_instances ?? input?.initial_item_placement?.containers);
  if (sceneOrKeyNpc || containers.length > 0) concerns.push(issue('HIDDEN_STATE_EMPTY_LIMITED_INVALID', 'empty_limited is not allowed when scene/key NPCs or containers exist.', 'hidden_state_status'));
}

function validateTypedTarget(target, refs, path, concerns, allowAction = false) {
  if (!isObject(target) || !text(target.target_type) || !text(target.target_id)) {
    concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', 'Target requires target_type and target_id.', path));
    return;
  }
  const type = target.target_type;
  const id = target.target_id;
  if (['npc'].includes(type)) validateRef(id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (['item', 'tool', 'weapon', 'money', 'document', 'sacred_object', 'stock'].includes(type)) validateRef(id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (['container'].includes(type)) validateRef(id, refs.containerIds, 'HIDDEN_STATE_CONTAINER_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (['g5_anchor', 'anchor', 'door', 'gate'].includes(type)) validateRef(id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (['minilocation', 'offscreen_zone'].includes(type)) validateRef(id, refs.minilocationIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (['g5_edge', 'edge'].includes(type)) validateRef(id, refs.g5EdgeIds, 'HIDDEN_STATE_ROUTE_REF_NOT_FOUND', `${path}.target_id`, concerns);
  else if (type === 'route') {
    if (!refs.g5EdgeIds.has(id) && !refs.graphEdgeIds.has(id)) concerns.push(issue('HIDDEN_STATE_ROUTE_REF_NOT_FOUND', 'Route target must reference an approved G5 or graph edge.', `${path}.target_id`, null, id));
  } else if (type === 'place') validateRef(id, refs.nodeIds, 'HIDDEN_STATE_CREATED_PARENT_LOCATION', `${path}.target_id`, concerns);
  else if (type === 'whole_scene' || (allowAction && type === 'action')) return;
}

function validateKnownRecordRef(hook, refs, path, concerns) {
  for (const [i, write] of array(hook?.writes).entries()) {
    const ref = write?.record_ref;
    if (!text(ref)) continue;
    const known = refs.npcIds.has(ref) || refs.itemIds.has(ref) || refs.containerIds.has(ref) || refs.anchorIds.has(ref)
      || refs.g5EdgeIds.has(ref) || refs.graphEdgeIds.has(ref) || refs.nodeIds.has(ref) || refs.playerCharacterIds.has(ref)
      || ref.startsWith('party_') || ref.startsWith('hidden_') || ref.startsWith('consequence_');
    if (!known) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Consequence write record_ref is not tied to an approved entity.', `${path}.writes[${i}].record_ref`, null, ref));
  }
}

function registerFact(registry, id, value, path, kind) {
  if (!text(id)) return;
  registry.set(id, { value, path, kind });
}

function registerId(id, path, registry, concerns) {
  if (!text(id)) {
    concerns.push(issue('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID', 'Stable id is required.', path));
    return;
  }
  if (registry.has(id)) concerns.push(issue('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID', `Duplicate stable id: ${id}.`, path));
  registry.set(id, path);
}

function validateRef(value, set, code, field, concerns) {
  if (!text(value) || !set.has(value)) concerns.push(issue(code, `Reference not found: ${value ?? 'null'}.`, field, 'approved existing id', value));
}

function routeSnapshotEdges(snapshot) {
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

function indexAccessStates(value, map) {
  walk(value, (node) => {
    if (!isObject(node)) return;
    const targetId = node.target_id ?? node.anchor_id ?? node.g5_anchor_id ?? node.g5_edge_id ?? node.minilocation_id;
    const state = node.actual_state ?? node.access_state ?? node.state;
    if (text(targetId) && text(state)) map.set(targetId, state);
  });
}

function indexPropertyBindings(value, map) {
  walk(value, (node) => {
    if (!isObject(node)) return;
    const targetId = node.item_instance_id ?? node.container_instance_id ?? node.target_id;
    const hasProperty = node.property_binding_id || node.owner_id || node.holder_id || node.controller_id || node.ownership;
    if (text(targetId) && hasProperty) map.set(targetId, node);
  });
}

function collectByKeys(value, target, keys) {
  const keySet = new Set(keys);
  walk(value, (node) => {
    if (!isObject(node)) return;
    for (const [key, raw] of Object.entries(node)) {
      if (!keySet.has(key)) continue;
      if (Array.isArray(raw)) raw.forEach((item) => addText(target, isObject(item) ? item.id ?? item[key.replace(/s$/, '')] : item));
      else addText(target, raw);
    }
  });
}

function walk(value, visitor, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visitor, seen));
  else Object.values(value).forEach((item) => walk(item, visitor, seen));
}

function addText(set, value) { if (text(value)) set.add(value); }
function addMapSet(map, key, value) { if (!text(key) || !text(value)) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); }
function firstText(object, keys) { for (const key of keys) if (text(object?.[key])) return object[key]; return null; }
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function safeClone(value) { try { return structuredClone(value); } catch { return value; } }
function issue(code, message, field, expected = null, actual = null, severity = 'error') { return { code, message, field, expected, actual, severity }; }
function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.code}|${item.field}|${item.actual ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function requireSchema(concerns, value, schema, path, code) { if (value?.version !== 1 || value?.schema !== schema) concerns.push(issue(code, `${path} must be ${schema} version 1.`, path)); }
function requireAudit(concerns, value, schema, path, code) { if (value?.version !== 1 || value?.schema !== schema || value?.pass !== true) concerns.push(issue(code, `${path} must be approved ${schema}.`, path)); }
function hasOwnRecursive(value, key, seen = new Set()) { if (value == null || typeof value !== 'object' || seen.has(value)) return false; seen.add(value); if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key)) return true; return Object.values(value).some((child) => hasOwnRecursive(child, key, seen)); }
function hasForbiddenRepairFields(audit) { return ['full_hidden_scene_state', 'repaired_output', 'replacement_state', 'patch'].some((key) => Object.prototype.hasOwnProperty.call(audit ?? {}, key)); }

function isParsedRoleResult(value) {
  return isObject(value)
    && Object.prototype.hasOwnProperty.call(value, 'value')
    && Object.prototype.hasOwnProperty.call(value, 'parseError')
    && Object.prototype.hasOwnProperty.call(value, 'raw');
}

function parseRoleResult(raw) {
  const unwrapped = raw?.output ?? raw;
  if (typeof unwrapped !== 'string') return { value: unwrapped, raw: unwrapped, parseError: null };
  try { return { value: JSON.parse(unwrapped), raw: unwrapped, parseError: null }; }
  catch (error) { return { value: unwrapped, raw: unwrapped, parseError: error.message }; }
}

async function callRole(callback, input, role) {
  const raw = await callback(structuredClone(input));
  return parseRoleResult(raw);
}

function stage19Error(message, concerns, { failedGate = 'stage19_hidden_state_gate', terminal = false, ...snapshots } = {}) {
  const error = new Error(message);
  error.lifecycle = {
    stage_id: 19,
    stage_slug: 'hidden_state',
    stage_type: 'isolated_semantic_generation',
    failed_gate: failedGate,
    concerns: array(concerns),
    terminal_status: terminal ? 'needs_manual_review' : 'stage_failed',
    ...snapshots
  };
  error.semanticRecoveryRoute = {
    repair_kind: 'semantic',
    return_to_stage: terminal ? 'manual_review' : 'hidden_state',
    rerun_from_stage: 19,
    reason_code: array(concerns)[0]?.code ?? 'HIDDEN_STATE_FAILED',
    terminal_status: terminal ? 'needs_manual_review' : null
  };
  return error;
}
