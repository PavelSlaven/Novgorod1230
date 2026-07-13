import { STAGE13_ANCHOR_LIMITS, STAGE13_EDGE_LIMITS, STAGE13_MINILOCATION_LIMITS, STAGE13_OUTPUT_SCHEMA } from '@rus/contracts';
import { checkArrayBounds, concern, dedupeConcerns, hasDarkVisibilityContradiction, hasOwnRecursive, isPlainObject, modelsAreMerged, normalizeArray, readAnchorId, readAnchorTemplateId, readAnchorType, readMinilocationId, readSelectedChain, readSelectedPlaceTemplateId } from './shared.js';
import { buildAllowedTemplateIndex } from './templates.js';

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

export function validateNoDownstreamEntities(output) {
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
