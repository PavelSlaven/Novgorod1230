import { concern } from '../llm-stage.js';

export const STAGE13_INPUT_SCHEMA = 'g5_materialization_input';
export const STAGE13_OUTPUT_SCHEMA = 'g5_scene_graph_draft';
export const STAGE13_CODE_PRECHECK_SCHEMA = 'g5_scene_code_precheck';

export const STAGE13_MINILOCATION_LIMITS = Object.freeze({ min: 1, max: 3 });
export const STAGE13_ANCHOR_LIMITS = Object.freeze({ min: 3, max: 9 });
export const STAGE13_EDGE_LIMITS = Object.freeze({ min: 2, max: 12 });

export function normalizeStage13MaterializationPolicy(policy = {}) {
  return {
    materialize_only_selected_g4: policy.materialize_only_selected_g4 ?? true,
    require_g5_template_match: policy.require_g5_template_match ?? true,
    require_start_anchor: policy.require_start_anchor ?? true,
    require_minilocation: policy.require_minilocation ?? true,
    require_edges_between_reachable_anchors: policy.require_edges_between_reachable_anchors ?? true,
    require_visibility_model: policy.require_visibility_model ?? true,
    require_access_model: policy.require_access_model ?? true,
    require_clock_light_consistency: policy.require_clock_light_consistency ?? true,
    require_weather_consistency: policy.require_weather_consistency ?? true,
    require_source_trace: policy.require_source_trace ?? true,
    do_not_place_final_npcs_yet: policy.do_not_place_final_npcs_yet ?? true,
    do_not_place_final_items_yet: policy.do_not_place_final_items_yet ?? true,
    do_not_write_intro_prose: policy.do_not_write_intro_prose ?? true,
    do_not_create_hidden_event: policy.do_not_create_hidden_event ?? true,
    do_not_change_weather_state: policy.do_not_change_weather_state ?? true,
    preserve_player_identity: policy.preserve_player_identity ?? true,
    preserve_social_status: policy.preserve_social_status ?? true,
    preserve_inventory: policy.preserve_inventory ?? true,
    preserve_character_knowledge_limits: policy.preserve_character_knowledge_limits ?? true,
    do_not_change_player_character_without_repair: policy.do_not_change_player_character_without_repair ?? true
  };
}

export function buildStage13G5MaterializationInput(context, options = {}) {
  const allowedG5TemplateSet = normalizeAllowedG5TemplateSet(options.allowed_g5_template_set ?? options.allowedG5TemplateSet ?? context.getStageOutput?.(1300) ?? {});
  const input = {
    version: 1,
    schema: STAGE13_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? options.normalizedRequest ?? context.requireStageOutput?.(2, 'normalized request'),
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput?.(3, 'historical frame'),
    weather_state: options.weather_state ?? options.weatherState ?? context.getFrozenArtifactBySchema?.('weather_state')?.artifact ?? null,
    regional_context_package: options.regional_context_package ?? options.regionalContextPackage ?? context.requireStageOutput?.(4, 'regional context package'),
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput?.(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? options.startPlaceAudit ?? context.requireStageOutput?.(10, 'start place audit'),
    player_character: options.player_character ?? options.playerCharacter ?? context.getStageOutput?.(1101) ?? context.requireStageOutput?.(11, 'player character'),
    player_character_audit: options.player_character_audit ?? options.playerCharacterAudit ?? context.requireStageOutput?.(12, 'player character audit'),
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput?.(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput?.(8, 'item profile candidate set'),
    allowed_g5_template_set: allowedG5TemplateSet,
    materialization_policy: normalizeStage13MaterializationPolicy(options.materialization_policy ?? options.policy ?? {})
  };
  return {
    ...input,
    allowed_g5_template_set: {
      ...input.allowed_g5_template_set,
      allowed_g5_templates: filterAllowedG5Templates(input)
    }
  };
}

export function validateStage13G5MaterializationInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('G5_MATERIALIZATION_INPUT_NOT_OBJECT', 'Stage 13 input must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (input.version !== 1) {
    concerns.push(concern('G5_MATERIALIZATION_INPUT_VERSION_MISMATCH', 'Stage 13 input.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (input.schema !== STAGE13_INPUT_SCHEMA) {
    concerns.push(concern('G5_MATERIALIZATION_INPUT_SCHEMA_MISMATCH', `Stage 13 input.schema must be ${STAGE13_INPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  for (const field of [
    'normalized_request',
    'historical_frame',
    'weather_state',
    'regional_context_package',
    'selected_start_node',
    'start_place_audit',
    'player_character',
    'player_character_audit',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'allowed_g5_template_set',
    'materialization_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('G5_MATERIALIZATION_INPUT_MISSING_BLOCK', `Stage 13 input.${field} must be an object.`, { field, severity: 'hard_block' }));
    }
  }
  if (input.weather_state?.version !== 1 || input.weather_state?.schema !== 'weather_state') {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_STATE_INVALID', 'Stage 13 requires approved weather_state version 1.', { field: 'weather_state', severity: 'hard_block' }));
  }
  if (input.materialization_policy?.require_weather_consistency !== true || input.materialization_policy?.do_not_change_weather_state !== true) {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_POLICY_INVALID', 'Stage 13 weather policy must require consistency and forbid weather mutation.', { field: 'materialization_policy', severity: 'hard_block' }));
  }
  if (input.weather_state?.request_id && input.request_id && input.weather_state.request_id !== input.request_id) {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_REQUEST_MISMATCH', 'weather_state.request_id must match Stage 13 request_id.', { field: 'weather_state.request_id', severity: 'hard_block' }));
  }
  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern('G5_MATERIALIZATION_START_PLACE_AUDIT_NOT_PASSED', 'Stage 13 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character_audit?.pass !== true) {
    concerns.push(concern('G5_MATERIALIZATION_PLAYER_CHARACTER_AUDIT_NOT_PASSED', 'Stage 13 requires player_character_audit.pass=true.', { field: 'player_character_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('G5_MATERIALIZATION_PLAYER_CHARACTER_NOT_GAME_PROFILE', 'Stage 13 requires shaped player_character_game_profile.', { field: 'player_character.schema', severity: 'hard_block' }));
  }
  if (readSelectedScaleLevel(input.selected_start_node) !== 'G4') {
    concerns.push(concern('G5_MATERIALIZATION_SELECTED_SCALE_NOT_G4', 'Stage 13 requires selected_start_node.selected.selected_scale_level=G4.', { field: 'selected_start_node.selected.selected_scale_level', severity: 'hard_block' }));
  }
  if (!readSelectedChain(input.selected_start_node).g4_node_id) {
    concerns.push(concern('G5_MATERIALIZATION_SELECTED_G4_MISSING', 'Stage 13 requires selected_start_node.selected_node_chain.g4_node_id.', { field: 'selected_start_node.selected_node_chain.g4_node_id', severity: 'hard_block' }));
  }
  if (!readSelectedPlaceTemplateId(input.selected_start_node)) {
    concerns.push(concern('G5_MATERIALIZATION_PLACE_TEMPLATE_MISSING', 'Stage 13 requires selected_start_node.selected.selected_place_template_id.', { field: 'selected_start_node.selected.selected_place_template_id', severity: 'hard_block' }));
  }
  const filteredTemplates = filterAllowedG5Templates(input);
  if (filteredTemplates.length === 0) {
    concerns.push(concern('G5_MATERIALIZATION_NO_ALLOWED_TEMPLATES', 'Stage 13 requires non-empty allowed_g5_template_set after G4/status filtering.', { field: 'allowed_g5_template_set.allowed_g5_templates', severity: 'hard_block' }));
  }
  return concerns;
}

export function filterAllowedG5Templates(input = {}) {
  const templateSet = normalizeAllowedG5TemplateSet(input.allowed_g5_template_set ?? input.allowedG5TemplateSet ?? {});
  const selectedG4TypeId = templateSet.selected_g4_type_id
    ?? readSelectedG4TypeId(input.selected_start_node)
    ?? input.selected_g4_type_id
    ?? null;
  return templateSet.allowed_g5_templates.filter((template) => {
    if (!isPlainObject(template)) return false;
    const status = String(template.status ?? template.template_status ?? 'active').toLowerCase();
    if (status === 'rejected' || status === 'conflict') return false;
    if (template.enabled === false) return false;
    const templateG4Type = template.g4_type_id ?? template.selected_g4_type_id ?? null;
    if (selectedG4TypeId && templateG4Type && templateG4Type !== selectedG4TypeId) return false;
    const anchorTypes = readTemplateAnchorTypes(template);
    const anchors = readTemplateAnchors(template);
    return anchorTypes.size > 0 || anchors.size > 0 || Boolean(readTemplateId(template));
  });
}

export function buildStage13G5CodePrecheck(output = {}, input = {}) {
  const concerns = validateStage13G5SceneGraphDraft(output, input);
  const has = (code) => !concerns.some((item) => item.code === code);
  return {
    version: 1,
    schema: STAGE13_CODE_PRECHECK_SCHEMA,
    pass: concerns.length === 0,
    checks: {
      schema_valid: has('G5_SCENE_GRAPH_SCHEMA_MISMATCH') && has('G5_SCENE_GRAPH_VERSION_MISMATCH'),
      selected_g4_valid: has('G5_SCENE_GRAPH_PARENT_G4_MISMATCH') && has('G5_SCENE_GRAPH_NEW_PARENT_LOCATION'),
      all_minilocations_inside_selected_g4: has('G5_SCENE_GRAPH_MINILOCATION_OUTSIDE_SELECTED_G4'),
      all_anchors_have_allowed_templates: has('G5_SCENE_GRAPH_ANCHOR_TEMPLATE_NOT_ALLOWED') && has('G5_SCENE_GRAPH_ANCHOR_TYPE_NOT_ALLOWED'),
      player_start_anchor_exists: has('G5_SCENE_GRAPH_START_ANCHOR_MISSING'),
      player_start_minilocation_exists: has('G5_SCENE_GRAPH_START_MINILOCATION_MISSING'),
      all_edges_reference_existing_anchors: has('G5_SCENE_GRAPH_EDGE_REF_MISSING'),
      clock_light_consistency: has('G5_SCENE_GRAPH_DARK_VISIBILITY_CONTRADICTION'),
      weather_consistency: has('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH') && has('G5_MATERIALIZATION_WEATHER_STATE_INVALID'),
      no_npcs_materialized: has('G5_MATERIALIZATION_CREATED_NPC'),
      no_items_materialized: has('G5_MATERIALIZATION_CREATED_ITEM'),
      no_intro_prose: has('G5_MATERIALIZATION_CREATED_INTRO_PROSE'),
      source_trace_present: has('G5_SCENE_GRAPH_SOURCE_TRACE_EMPTY')
    },
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 13 code precheck passed: G5 draft remains inside selected G4 and uses allowed templates.']
      : concerns.map((item) => item.code)
  };
}

export function validateStage13G5SceneGraphDraft(output = {}, input = {}) {
  const concerns = [];
  if (!isPlainObject(output)) {
    return [concern('G5_SCENE_GRAPH_NOT_OBJECT', 'Stage 13 output must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (output.version !== 1) {
    concerns.push(concern('G5_SCENE_GRAPH_VERSION_MISMATCH', 'g5_scene_graph_draft.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (output.schema !== STAGE13_OUTPUT_SCHEMA) {
    concerns.push(concern('G5_SCENE_GRAPH_SCHEMA_MISMATCH', `Stage 13 output.schema must be ${STAGE13_OUTPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  if (output.materialization_status !== 'materialized') {
    concerns.push(concern('G5_SCENE_GRAPH_STATUS_NOT_MATERIALIZED', 'Stage 13 materialization_status must be materialized; requires_repair/blocked cannot pass.', { field: 'materialization_status', severity: 'hard_block' }));
  }

  if (output.frame?.weather_state && JSON.stringify(output.frame.weather_state) !== JSON.stringify(input.weather_state)) {
    concerns.push(concern('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH', 'G5 frame.weather_state must match approved Stage 13 weather_state.', { field: 'frame.weather_state', severity: 'hard_block' }));
  }
  if (output.weather_state && JSON.stringify(output.weather_state) !== JSON.stringify(input.weather_state)) {
    concerns.push(concern('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH', 'Stage 13 output must not change weather_state.', { field: 'weather_state', severity: 'hard_block' }));
  }

  const selectedChain = readSelectedChain(input.selected_start_node);
  const selectedG4Id = selectedChain.g4_node_id;
  const selectedPlaceTemplateId = readSelectedPlaceTemplateId(input.selected_start_node);
  const parent = output.parent_location ?? {};
  for (const key of ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']) {
    if (selectedChain[key] && parent[key] !== selectedChain[key]) {
      concerns.push(concern('G5_SCENE_GRAPH_NEW_PARENT_LOCATION', `parent_location.${key} must match selected_start_node.selected_node_chain.${key}.`, { field: `parent_location.${key}`, severity: 'hard_block' }));
    }
  }
  if (selectedG4Id && parent.g4_node_id !== selectedG4Id) {
    concerns.push(concern('G5_SCENE_GRAPH_PARENT_G4_MISMATCH', 'G5 draft parent_location.g4_node_id must match selected G4.', { field: 'parent_location.g4_node_id', severity: 'hard_block' }));
  }
  if (selectedPlaceTemplateId && parent.place_template_id !== selectedPlaceTemplateId) {
    concerns.push(concern('G5_SCENE_GRAPH_PLACE_TEMPLATE_MISMATCH', 'G5 draft parent_location.place_template_id must match selected place template.', { field: 'parent_location.place_template_id', severity: 'hard_block' }));
  }

  const minilocations = normalizeArray(output.g5_minilocations);
  const anchors = normalizeArray(output.g5_anchors);
  const edges = normalizeArray(output.g5_edges);
  checkArrayBounds(concerns, minilocations, STAGE13_MINILOCATION_LIMITS, 'G5_SCENE_GRAPH_MINILOCATION_COUNT_OUT_OF_RANGE', 'g5_minilocations');
  checkArrayBounds(concerns, anchors, STAGE13_ANCHOR_LIMITS, 'G5_SCENE_GRAPH_ANCHOR_COUNT_OUT_OF_RANGE', 'g5_anchors');
  checkArrayBounds(concerns, edges, STAGE13_EDGE_LIMITS, 'G5_SCENE_GRAPH_EDGE_COUNT_OUT_OF_RANGE', 'g5_edges');

  const minilocationIds = new Set(minilocations.map(readMinilocationId).filter(Boolean));
  for (const minilocation of minilocations) {
    const parentG4 = minilocation.parent_g4_node_id ?? minilocation.g4_node_id ?? minilocation.location_id ?? parent.g4_node_id;
    if (selectedG4Id && parentG4 !== selectedG4Id) {
      concerns.push(concern('G5_SCENE_GRAPH_MINILOCATION_OUTSIDE_SELECTED_G4', 'Every minilocation must be inside selected G4.', { field: 'g5_minilocations', severity: 'hard_block' }));
      break;
    }
  }

  const allowed = buildAllowedTemplateIndex(input);
  const anchorIds = new Set();
  for (const anchor of anchors) {
    const anchorId = readAnchorId(anchor);
    if (anchorId) anchorIds.add(anchorId);
    const minilocationId = anchor.minilocation_id ?? anchor.g5_minilocation_id ?? null;
    if (!minilocationId || !minilocationIds.has(minilocationId)) {
      concerns.push(concern('G5_SCENE_GRAPH_ANCHOR_MINILOCATION_MISSING', 'Every anchor must reference an existing minilocation.', { field: 'g5_anchors.minilocation_id', severity: 'hard_block' }));
    }
    const templateId = readAnchorTemplateId(anchor);
    const anchorType = readAnchorType(anchor);
    if (templateId && allowed.templateIds.size > 0 && !allowed.templateIds.has(templateId)) {
      concerns.push(concern('G5_SCENE_GRAPH_ANCHOR_TEMPLATE_NOT_ALLOWED', 'Every anchor template must be present in allowed_g5_template_set.', { field: 'g5_anchors.template_id', severity: 'hard_block' }));
    }
    if (anchorType && allowed.anchorTypes.size > 0 && !allowed.anchorTypes.has(anchorType)) {
      concerns.push(concern('G5_SCENE_GRAPH_ANCHOR_TYPE_NOT_ALLOWED', 'Every anchor type must be allowed by allowed_g5_template_set.', { field: 'g5_anchors.anchor_type', severity: 'hard_block' }));
    }
  }

  const startPosition = output.player_start_position ?? {};
  if (!isPlainObject(startPosition)) {
    concerns.push(concern('G5_SCENE_GRAPH_START_POSITION_MISSING', 'player_start_position must be an object.', { field: 'player_start_position', severity: 'hard_block' }));
  }
  const startMinilocationId = startPosition.minilocation_id ?? startPosition.g5_minilocation_id ?? null;
  const startAnchorId = startPosition.anchor_id ?? startPosition.g5_anchor_id ?? null;
  const startLocationId = startPosition.location_id ?? startPosition.g4_node_id ?? null;
  if (!startMinilocationId || !minilocationIds.has(startMinilocationId)) {
    concerns.push(concern('G5_SCENE_GRAPH_START_MINILOCATION_MISSING', 'player_start_position.minilocation_id must reference existing minilocation.', { field: 'player_start_position.minilocation_id', severity: 'hard_block' }));
  }
  if (!startAnchorId || !anchorIds.has(startAnchorId)) {
    concerns.push(concern('G5_SCENE_GRAPH_START_ANCHOR_MISSING', 'player_start_position.anchor_id must reference existing anchor.', { field: 'player_start_position.anchor_id', severity: 'hard_block' }));
  }
  if (selectedG4Id && startLocationId !== selectedG4Id) {
    concerns.push(concern('G5_SCENE_GRAPH_START_LOCATION_MISMATCH', 'player_start_position.location_id must equal selected G4.', { field: 'player_start_position.location_id', severity: 'hard_block' }));
  }

  let startAnchorDegree = 0;
  for (const edge of edges) {
    const from = edge.from_anchor_id ?? edge.from ?? null;
    const to = edge.to_anchor_id ?? edge.to ?? null;
    if (!anchorIds.has(from) || !anchorIds.has(to)) {
      concerns.push(concern('G5_SCENE_GRAPH_EDGE_REF_MISSING', 'Every edge must reference existing anchors.', { field: 'g5_edges', severity: 'hard_block' }));
      break;
    }
    if (startAnchorId && (from === startAnchorId || to === startAnchorId)) startAnchorDegree += 1;
  }
  if (startAnchorId && startAnchorDegree === 0) {
    concerns.push(concern('G5_SCENE_GRAPH_START_ANCHOR_ISOLATED', 'Start anchor must have at least one edge.', { field: 'g5_edges', severity: 'hard_block' }));
  }

  if (!isPlainObject(output.visibility_model)) {
    concerns.push(concern('G5_SCENE_GRAPH_VISIBILITY_MODEL_MISSING', 'visibility_model must be present.', { field: 'visibility_model', severity: 'hard_block' }));
  }
  if (!isPlainObject(output.access_model)) {
    concerns.push(concern('G5_SCENE_GRAPH_ACCESS_MODEL_MISSING', 'access_model must be present.', { field: 'access_model', severity: 'hard_block' }));
  }
  if (modelsAreMerged(output.visibility_model, output.access_model)) {
    concerns.push(concern('G5_SCENE_GRAPH_VISIBILITY_ACCESS_MERGED', 'visibility_model and access_model must not be the same model.', { field: 'visibility_model', severity: 'hard_block' }));
  }
  if (hasDarkVisibilityContradiction(output, input)) {
    concerns.push(concern('G5_SCENE_GRAPH_DARK_VISIBILITY_CONTRADICTION', 'Dark light_profile cannot mark most anchors visible_now=true without light/open-space justification.', { field: 'g5_anchors.visible_now', severity: 'hard_block' }));
  }

  concerns.push(...validateNoDownstreamEntities(output));

  if (!Array.isArray(output.source_trace) || output.source_trace.length === 0) {
    concerns.push(concern('G5_SCENE_GRAPH_SOURCE_TRACE_EMPTY', 'source_trace must not be empty.', { field: 'source_trace', severity: 'hard_block' }));
  }
  if (output.audit_self_check?.pass !== true) {
    concerns.push(concern('G5_SCENE_GRAPH_SELF_CHECK_FAILED', 'audit_self_check.pass must be true.', { field: 'audit_self_check.pass', severity: 'hard_block' }));
  }
  if (!Array.isArray(output.audit_self_check?.evidence) || output.audit_self_check.evidence.length === 0) {
    concerns.push(concern('G5_SCENE_GRAPH_SELF_CHECK_EVIDENCE_EMPTY', 'audit_self_check.evidence must not be empty.', { field: 'audit_self_check.evidence', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

export async function runStage13G5MaterializationBlock({ input, materialize }) {
  const inputConcerns = validateStage13G5MaterializationInput(input);
  if (inputConcerns.length > 0) {
    return {
      pass: false,
      output: buildBlockedG5SceneDraft(input, inputConcerns),
      code_precheck: buildFailedInputPrecheck(inputConcerns),
      concerns: inputConcerns
    };
  }
  if (typeof materialize !== 'function') {
    throw new Error('Stage 13 requires materialize callback.');
  }
  const output = await materialize(input);
  const codePrecheck = buildStage13G5CodePrecheck(output, input);
  return {
    pass: codePrecheck.pass === true,
    output,
    code_precheck: codePrecheck,
    concerns: codePrecheck.concerns ?? []
  };
}

function normalizeAllowedG5TemplateSet(value = {}) {
  return {
    version: value.version ?? 1,
    schema: value.schema ?? 'allowed_g5_template_set',
    selected_g4_type_id: value.selected_g4_type_id ?? value.g4_type_id ?? null,
    allowed_g5_templates: normalizeArray(value.allowed_g5_templates ?? value.templates ?? value.g5_templates)
  };
}

function buildAllowedTemplateIndex(input = {}) {
  const templates = filterAllowedG5Templates(input);
  const templateIds = new Set();
  const anchorTypes = new Set();
  for (const template of templates) {
    const templateId = readTemplateId(template);
    if (templateId) templateIds.add(templateId);
    for (const type of readTemplateAnchorTypes(template)) anchorTypes.add(type);
    for (const anchor of readTemplateAnchors(template)) anchorTypes.add(anchor);
  }
  return { templateIds, anchorTypes, templates };
}

function validateNoDownstreamEntities(output) {
  const concerns = [];
  const forbiddenKeys = [
    ['visible_scene', 'G5_MATERIALIZATION_CREATED_VISIBLE_SCENE', 'Stage 13 must not create visible_scene.'],
    ['intro_prose', 'G5_MATERIALIZATION_CREATED_INTRO_PROSE', 'Stage 13 must not create intro_prose.'],
    ['narrator_prose', 'G5_MATERIALIZATION_CREATED_INTRO_PROSE', 'Stage 13 must not create prose.'],
    ['hidden_event', 'G5_MATERIALIZATION_CREATED_HIDDEN_EVENT', 'Stage 13 must not create hidden_event.'],
    ['hidden_events', 'G5_MATERIALIZATION_CREATED_HIDDEN_EVENT', 'Stage 13 must not create hidden events.'],
    ['new_g1_node_id', 'G5_MATERIALIZATION_CREATED_NEW_G4', 'Stage 13 must not create new G1-G4 ids.'],
    ['new_g2_node_id', 'G5_MATERIALIZATION_CREATED_NEW_G4', 'Stage 13 must not create new G1-G4 ids.'],
    ['new_g3_node_id', 'G5_MATERIALIZATION_CREATED_NEW_G4', 'Stage 13 must not create new G1-G4 ids.'],
    ['new_g4_node_id', 'G5_MATERIALIZATION_CREATED_NEW_G4', 'Stage 13 must not create new G1-G4 ids.'],
    ['modified_player_character', 'G5_MATERIALIZATION_CHANGED_PLAYER_CHARACTER', 'Stage 13 must not change player character.'],
    ['player_character_patch', 'G5_MATERIALIZATION_CHANGED_PLAYER_CHARACTER', 'Stage 13 must not change player character.']
  ];
  for (const [key, code, message] of forbiddenKeys) {
    if (hasOwnRecursive(output, key)) concerns.push(concern(code, message, { field: key, severity: 'hard_block' }));
  }

  for (const slot of normalizeArray(output.npc_materialization_slots)) {
    if (slot?.npc_id || slot?.npc_name || slot?.name || slot?.dialogue || slot?.materialized_npc || slot?.npc) {
      concerns.push(concern('G5_MATERIALIZATION_CREATED_NPC', 'Stage 13 may create NPC slots only, not materialized NPCs.', { field: 'npc_materialization_slots', severity: 'hard_block' }));
      break;
    }
  }
  for (const slot of normalizeArray(output.item_materialization_slots)) {
    if (slot?.item_id || slot?.concrete_item_id || slot?.materialized_item || slot?.item || slot?.contents || slot?.container_contents) {
      concerns.push(concern('G5_MATERIALIZATION_CREATED_ITEM', 'Stage 13 may create item slots only, not concrete items/container contents.', { field: 'item_materialization_slots', severity: 'hard_block' }));
      break;
    }
  }
  if (hasOwnRecursive(output, 'container_contents') || hasOwnRecursive(output, 'contents')) {
    concerns.push(concern('G5_MATERIALIZATION_CREATED_CONTAINER_CONTENTS', 'Stage 13 must not create container contents.', { field: 'container_contents', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

function buildBlockedG5SceneDraft(input, concerns) {
  return {
    version: 1,
    schema: STAGE13_OUTPUT_SCHEMA,
    request_id: input?.request_id ?? null,
    materialization_status: 'blocked',
    frame: {},
    parent_location: {},
    g5_minilocations: [],
    g5_anchors: [],
    g5_edges: [],
    player_start_position: {},
    visibility_model: {},
    access_model: {},
    npc_materialization_slots: [],
    item_materialization_slots: [],
    unmaterialized_possible_details: [],
    downstream_constraints: {
      must_preserve: ['selected_g4', 'player_character', 'historical_frame'],
      must_not_create_yet: ['npc', 'item', 'intro_prose', 'hidden_event'],
      must_resolve_later: []
    },
    source_trace: [],
    audit_self_check: {
      pass: false,
      concerns,
      evidence: concerns.map((item) => item.code)
    }
  };
}

function buildFailedInputPrecheck(concerns) {
  return {
    version: 1,
    schema: STAGE13_CODE_PRECHECK_SCHEMA,
    pass: false,
    checks: {
      schema_valid: !concerns.some((item) => /SCHEMA|VERSION/u.test(item.code)),
      selected_g4_valid: !concerns.some((item) => /SELECTED|G4/u.test(item.code)),
      all_minilocations_inside_selected_g4: false,
      all_anchors_have_allowed_templates: !concerns.some((item) => /TEMPLATE/u.test(item.code)),
      player_start_anchor_exists: false,
      player_start_minilocation_exists: false,
      all_edges_reference_existing_anchors: false,
      clock_light_consistency: false,
      no_npcs_materialized: true,
      no_items_materialized: true,
      no_intro_prose: true,
      source_trace_present: false
    },
    concerns,
    evidence: concerns.map((item) => item.code)
  };
}

function checkArrayBounds(concerns, value, limits, code, field) {
  if (value.length < limits.min || value.length > limits.max) {
    concerns.push(concern(code, `${field} length must be ${limits.min}..${limits.max}.`, { field, severity: 'hard_block' }));
  }
}

function hasDarkVisibilityContradiction(output, input) {
  const lightProfile = input?.historical_frame?.clock?.light_profile ?? input?.historical_frame?.calendar?.light_profile ?? null;
  if (lightProfile !== 'dark') return false;
  const anchors = normalizeArray(output.g5_anchors);
  if (anchors.length === 0) return false;
  const visibleAnchors = anchors.filter((anchor) => anchor.visible_now === true || anchor.visibility?.visible_now === true);
  if (visibleAnchors.length <= Math.ceil(anchors.length / 2)) return false;
  return !visibleAnchors.every((anchor) => Boolean(anchor.light_source || anchor.open_space === true || anchor.visibility_reason || anchor.visibility?.reason));
}

function modelsAreMerged(visibilityModel, accessModel) {
  if (!isPlainObject(visibilityModel) || !isPlainObject(accessModel)) return false;
  if (visibilityModel === accessModel) return true;
  const visibilityKeys = Object.keys(visibilityModel);
  const accessKeys = Object.keys(accessModel);
  if (visibilityKeys.length === 0 || accessKeys.length === 0) return false;
  return JSON.stringify(visibilityModel) === JSON.stringify(accessModel);
}

function readSelectedChain(selectedStartNode = {}) {
  return selectedStartNode.selected_node_chain ?? selectedStartNode.node_chain ?? selectedStartNode.selected?.selected_node_chain ?? {};
}

function readSelectedScaleLevel(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_scale_level ?? selectedStartNode.selected_scale_level ?? selectedStartNode.scale_level ?? null;
}

function readSelectedPlaceTemplateId(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_place_template_id
    ?? selectedStartNode.selected_place_template_id
    ?? selectedStartNode.place_template_id
    ?? selectedStartNode.selected_candidate_place_template_link_id
    ?? null;
}

function readSelectedG4TypeId(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_g4_type_id
    ?? selectedStartNode.selected?.g4_type_id
    ?? selectedStartNode.selected_g4_type_id
    ?? selectedStartNode.g4_type_id
    ?? selectedStartNode.selected?.g4_type
    ?? null;
}

function readMinilocationId(value = {}) {
  return value.minilocation_id ?? value.g5_minilocation_id ?? value.id ?? null;
}

function readAnchorId(value = {}) {
  return value.anchor_id ?? value.g5_anchor_id ?? value.id ?? null;
}

function readAnchorTemplateId(value = {}) {
  return value.template_id ?? value.g5_template_id ?? value.g5_template_ref ?? value.allowed_g5_template_id ?? null;
}

function readAnchorType(value = {}) {
  return value.anchor_type ?? value.type ?? value.anchor_kind ?? null;
}

function readTemplateId(value = {}) {
  return value.template_id ?? value.g5_template_id ?? value.id ?? null;
}

function readTemplateAnchorTypes(value = {}) {
  const raw = value.allowed_anchor_types ?? value.anchor_types ?? value.allowed_anchors ?? value.anchor_type_ids ?? [];
  return new Set(normalizeArray(raw).map((item) => typeof item === 'string' ? item : (item.anchor_type ?? item.type ?? item.id)).filter(Boolean));
}

function readTemplateAnchors(value = {}) {
  const raw = value.anchors ?? value.g5_anchors ?? value.anchor_templates ?? [];
  return new Set(normalizeArray(raw).map((item) => typeof item === 'string' ? item : (item.anchor_type ?? item.type ?? item.id)).filter(Boolean));
}

function hasOwnRecursive(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return true;
  if (Array.isArray(value)) return value.some((item) => hasOwnRecursive(item, key));
  return Object.values(value).some((item) => hasOwnRecursive(item, key));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dedupeConcerns(concerns) {
  const seen = new Set();
  const result = [];
  for (const item of concerns) {
    const key = `${item.code}:${item.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
