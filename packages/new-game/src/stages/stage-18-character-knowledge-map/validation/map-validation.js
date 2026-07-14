import { STAGE18_OUTPUT_SCHEMA, STAGE18_PRECHECK_SCHEMA, KNOWLEDGE_ARRAYS, KNOWN_ARRAYS, ALLOWED_BASIS, STATUS } from '../policy/constants.js';
import { buildStage18ReferenceIndex } from '../references/reference-index.js';
import { array, basisValues, canonicalRecordText, dedupe, firstText, firstTextFromObject, hasOwnRecursive, isObject, issue, text, walk } from '../shared/utils.js';
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
export function formatOnlyOutputValidation(output) {
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

