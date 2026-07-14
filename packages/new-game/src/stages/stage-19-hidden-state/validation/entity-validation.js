import { array, deepEqual, hasOwnRecursive, issue, text } from '../shared/utils.js';
import { registerFact, registerId, validateRef, validateTypedTarget } from './validation-helpers.js';
export function validateFrameAndParent(output, input, refs, concerns) {
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

export function validateForbiddenSurfaces(output, concerns) {
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

export function validateNpcState(output, refs, factRegistry, idRegistry, concerns) {
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

export function validateAccessState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_access_state).entries()) {
    const path = `hidden_access_state[${i}]`;
    registerFact(factRegistry, state?.hidden_access_state_id, state, path, 'hidden_access');
    validateTypedTarget(state?.access_target, refs, `${path}.access_target`, concerns);
    if (state?.access_requirements?.requires_npc_permission_id) validateRef(state.access_requirements.requires_npc_permission_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.access_requirements.requires_npc_permission_id`, concerns);
    if (state?.control?.controller_type === 'npc' && state?.control?.controller_id) validateRef(state.control.controller_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.control.controller_id`, concerns);
  }
}

export function validatePropertyState(output, refs, factRegistry, concerns) {
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

export function validateContainerState(output, input, refs, factRegistry, concerns) {
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

export function validateItemState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_item_state).entries()) {
    const path = `hidden_item_state[${i}]`;
    registerFact(factRegistry, state?.hidden_item_state_id, state, path, 'hidden_item');
    validateRef(state?.item_instance_id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.item_instance_id`, concerns);
    for (const [j, npcId] of array(state?.known_layers?.known_to_npc_ids).entries()) validateRef(npcId, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.known_layers.known_to_npc_ids[${j}]`, concerns);
  }
}

export function validateRiskState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_risk_state).entries()) {
    const path = `hidden_risk_state[${i}]`;
    registerFact(factRegistry, state?.hidden_risk_state_id, state, path, 'hidden_risk');
    validateTypedTarget(state?.risk_target, refs, `${path}.risk_target`, concerns, true);
    if (array(state?.trigger_conditions).length === 0) concerns.push(issue('HIDDEN_STATE_RISK_WITHOUT_TRIGGER', 'Every hidden risk requires trigger_conditions.', `${path}.trigger_conditions`));
  }
}

export function validateEventState(output, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_event_state).entries()) {
    const path = `hidden_event_state[${i}]`;
    registerFact(factRegistry, state?.hidden_event_state_id, state, path, 'future_event');
    if (!isObject(state?.trigger) || !text(state.trigger.trigger_type)) concerns.push(issue('HIDDEN_STATE_EVENT_WITHOUT_TRIGGER', 'Every hidden event requires a trigger.', `${path}.trigger`));
    if (!isObject(state?.effect) || !text(state.effect.effect_type)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Every hidden event requires an effect.', `${path}.effect`));
    if (state?.event_visibility?.known_to_player === true || state?.event_visibility?.must_not_reveal_until_triggered === false) concerns.push(issue('HIDDEN_STATE_FUTURE_EVENT_VISIBLE', 'Future event cannot be directly visible.', `${path}.event_visibility`));
  }
}

export function validateSocialState(output, refs, factRegistry, concerns) {
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

export function validateRouteState(output, refs, factRegistry, concerns) {
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

export function validateEnvironmentState(output, refs, factRegistry, concerns) {
  for (const [i, state] of array(output.hidden_environment_state).entries()) {
    const path = `hidden_environment_state[${i}]`;
    registerFact(factRegistry, state?.hidden_environment_state_id, state, path, 'hidden_environment');
    validateTypedTarget(state?.environment_target, refs, `${path}.environment_target`, concerns, true);
  }
}

