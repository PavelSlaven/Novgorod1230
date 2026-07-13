import { STAGE20_VISIBILITY_FILTER_SCHEMA } from '@rus/contracts';
import { addText, array, collectByKeys, collectRecordIds, meaningful, sorted, text } from './shared.js';

const KNOWLEDGE_GROUPS = Object.freeze([
  'known_routes', 'known_nearby_paths', 'known_places', 'known_addresses', 'known_landmarks',
  'known_people', 'known_authorities', 'known_dangers', 'known_social_rules', 'known_resources',
  'rumors', 'mistaken_beliefs', 'uncertain_knowledge', 'forbidden_knowledge', 'knowledge_gaps'
]);
export function buildVisibleContextReferenceIndex(input) {
  const refs = {
    anchorIds: new Set(),
    minilocationIds: new Set(),
    g5EdgeIds: new Set(),
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    knowledgeIds: new Set(),
    knowledgeSourceIds: new Set(),
    hiddenFactIds: new Set(),
    sensitiveHiddenFactIds: new Set(),
    revealConditionIds: new Set(),
    discoveryRuleIds: new Set(),
    allowedVisibleHintRefs: new Set(),
    npcById: new Map(),
    itemById: new Map(),
    containerById: new Map(),
    anchorById: new Map(),
    edgeById: new Map()
  };
  for (const anchor of array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors)) {
    const id = anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id;
    if (text(id)) { refs.anchorIds.add(id); refs.anchorById.set(id, anchor); }
  }
  for (const miniloc of array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations)) addText(refs.minilocationIds, miniloc?.g5_minilocation_id ?? miniloc?.minilocation_id ?? miniloc?.id);
  for (const edge of array(input?.g5_scene_graph?.g5_edges ?? input?.g5_scene_graph?.edges)) {
    const id = edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id;
    if (text(id)) { refs.g5EdgeIds.add(id); refs.edgeById.set(id, edge); }
  }
  for (const npc of array(input?.initial_npc_placement?.npc_instances ?? input?.initial_npc_placement?.placements)) {
    const id = npc?.npc_instance_id ?? npc?.npc_id ?? npc?.id;
    if (text(id)) { refs.npcIds.add(id); refs.npcById.set(id, npc); }
  }
  for (const item of array(input?.initial_item_placement?.item_instances ?? input?.initial_item_placement?.items)) {
    const id = item?.item_instance_id ?? item?.item_id ?? item?.id;
    if (text(id)) { refs.itemIds.add(id); refs.itemById.set(id, item); }
  }
  for (const container of array(input?.initial_item_placement?.container_instances ?? input?.initial_item_placement?.containers)) {
    const id = container?.container_instance_id ?? container?.container_id ?? container?.id;
    if (text(id)) { refs.containerIds.add(id); refs.containerById.set(id, container); }
  }
  for (const key of KNOWLEDGE_GROUPS) {
    for (const record of array(input?.character_knowledge_map?.[key])) {
      collectRecordIds(record, refs.knowledgeIds);
      collectByKeys(record?.source_trace, refs.knowledgeSourceIds, ['source_id', 'source_ref', 'source_record_id', 'fact_id', 'rule_id']);
    }
  }
  collectByKeys(input?.character_knowledge_map?.source_trace, refs.knowledgeSourceIds, ['source_id', 'source_ref', 'source_record_id', 'fact_id', 'rule_id']);
  indexHiddenFacts(input?.full_hidden_scene_state, refs);
  return refs;
}

export function buildVisibleContextVisibilityFilter(input, refs = buildVisibleContextReferenceIndex(input)) {
  const normalized = input?.time_light_consistency_audit?.normalized_visibility_constraints ?? {};
  const visibleAnchors = new Set(array(normalized.visible_without_action).filter((id) => refs.anchorIds.has(id)));
  const audibleAnchors = new Set(array(normalized.audible_but_not_visible).filter((id) => refs.anchorIds.has(id)));
  const inspectAnchors = new Set(array(normalized.visible_only_on_inspection).filter((id) => refs.anchorIds.has(id)));
  const hiddenUntilAction = new Set(array(normalized.hidden_until_action).filter((id) => refs.anchorIds.has(id)));
  if (refs.anchorIds.has(input?.current_position?.anchor_id)) visibleAnchors.add(input.current_position.anchor_id);

  const visibleNpcIds = new Set();
  const audibleNpcIds = new Set();
  const identifiedNpcIds = new Set();
  for (const [id, npc] of refs.npcById.entries()) {
    const state = npc?.visibility_state ?? {};
    if (state.visible_to_player === true || state.visible_to_player_now === true) visibleNpcIds.add(id);
    if (state.audible_to_player === true || state.audible_to_player_now === true || state.heard_by_player === true) audibleNpcIds.add(id);
    const nameStatus = npc?.identity?.name_status;
    if (['known_name', 'nickname', 'identified'].includes(nameStatus) || npc?.identity?.known_to_player === true) identifiedNpcIds.add(id);
  }

  const visibleItemIds = new Set();
  const inspectableItemIds = new Set();
  for (const [id, item] of refs.itemById.entries()) {
    const state = item?.visibility_state ?? {};
    if (state.visible_to_player_now === true || state.visible_to_player === true) visibleItemIds.add(id);
    if (state.visible_if_inspected === true || state.requires_inspection === true || ['visible_on_inspection', 'searchable', 'inspection_required'].includes(state.visibility)) inspectableItemIds.add(id);
  }
  const visibleContainerIds = new Set();
  for (const [id, container] of refs.containerById.entries()) {
    const state = container?.visibility_state ?? {};
    if (state.visible_to_player_now === true || state.visible_to_player === true) visibleContainerIds.add(id);
    if (state.visible_if_inspected === true || state.requires_inspection === true) hiddenUntilAction.add(id);
  }

  const knownButNotVisible = new Set();
  for (const id of refs.knowledgeIds) if (!visibleNpcIds.has(id) && !visibleItemIds.has(id) && !visibleContainerIds.has(id) && !visibleAnchors.has(id)) knownButNotVisible.add(id);
  for (const id of inspectAnchors) hiddenUntilAction.add(id);
  for (const id of inspectableItemIds) hiddenUntilAction.add(id);
  const forbiddenHiddenFactIds = new Set([...refs.hiddenFactIds].filter((id) => !refs.allowedVisibleHintRefs.has(id)));

  return {
    version: 1,
    schema: STAGE20_VISIBILITY_FILTER_SCHEMA,
    current_anchor_id: input?.current_position?.anchor_id ?? null,
    current_minilocation_id: input?.current_position?.minilocation_id ?? null,
    visible_anchor_ids: sorted(visibleAnchors),
    audible_anchor_ids: sorted(audibleAnchors),
    reachable_anchor_ids: buildReachableAnchors(input, refs),
    visible_npc_ids: sorted(visibleNpcIds),
    audible_npc_ids: sorted(audibleNpcIds),
    identified_npc_ids: sorted(identifiedNpcIds),
    visible_item_ids: sorted(visibleItemIds),
    inspectable_item_ids: sorted(inspectableItemIds),
    visible_container_ids: sorted(visibleContainerIds),
    known_but_not_visible_refs: sorted(knownButNotVisible),
    hidden_until_action_refs: sorted(hiddenUntilAction),
    allowed_visible_hint_refs: sorted(refs.allowedVisibleHintRefs),
    forbidden_hidden_fact_ids: sorted(forbiddenHiddenFactIds)
  };
}

export function indexHiddenFacts(state, refs) {
  const groups = [
    ['hidden_npc_state', 'hidden_npc_state_id', true],
    ['hidden_access_state', 'hidden_access_state_id', false],
    ['hidden_property_state', 'hidden_property_state_id', true],
    ['hidden_container_state', 'hidden_container_state_id', true],
    ['hidden_item_state', 'hidden_item_state_id', false],
    ['hidden_risk_state', 'hidden_risk_state_id', true],
    ['hidden_event_state', 'hidden_event_state_id', true],
    ['hidden_social_state', 'hidden_social_state_id', false],
    ['hidden_route_state', 'hidden_route_state_id', true],
    ['hidden_environment_state', 'hidden_environment_state_id', false]
  ];
  for (const [group, idField, sensitive] of groups) {
    for (const record of array(state?.[group])) {
      const id = record?.[idField] ?? record?.hidden_fact_id ?? record?.id;
      if (!text(id)) continue;
      refs.hiddenFactIds.add(id);
      if (sensitive) refs.sensitiveHiddenFactIds.add(id);
      if (hasApprovedVisibleHint(record)) refs.allowedVisibleHintRefs.add(id);
    }
  }
  for (const condition of array(state?.reveal_conditions)) {
    const id = condition?.reveal_condition_id ?? condition?.id;
    addText(refs.revealConditionIds, id);
    if (condition?.triggered === true || ['triggered', 'revealed', 'satisfied'].includes(condition?.status)) for (const factId of array(condition?.hidden_fact_ids ?? condition?.target_hidden_fact_ids)) if (refs.hiddenFactIds.has(factId)) refs.allowedVisibleHintRefs.add(factId);
  }
  for (const rule of array(state?.discovery_rules)) addText(refs.discoveryRuleIds, rule?.discovery_rule_id ?? rule?.id);
}

export function hasApprovedVisibleHint(record) {
  return meaningful(record?.visible_hint_now) || meaningful(record?.visible_hint) || meaningful(record?.allowed_substitute) || meaningful(record?.observable_consequence);
}

export function countSensitiveHiddenFacts(state) {
  return ['hidden_npc_state', 'hidden_property_state', 'hidden_container_state', 'hidden_risk_state', 'hidden_event_state', 'hidden_route_state'].reduce((sum, key) => sum + array(state?.[key]).length, 0);
}

export function buildReachableAnchors(input, refs) {
  const start = input?.current_position?.anchor_id;
  if (!refs.anchorIds.has(start)) return [];
  const reachable = new Set([start]);
  for (const edge of refs.edgeById.values()) {
    const from = edge?.from_anchor_id ?? edge?.from;
    const to = edge?.to_anchor_id ?? edge?.to;
    if (from === start && refs.anchorIds.has(to)) reachable.add(to);
    if (to === start && refs.anchorIds.has(from) && edge?.one_way !== true) reachable.add(from);
  }
  return sorted(reachable);
}

export function isClosedContainer(container) {
  const physical = container?.physical_state?.condition;
  const access = container?.access_state?.access;
  return ['closed', 'locked', 'sealed', 'hidden', 'inaccessible'].includes(physical) || ['closed', 'locked', 'sealed', 'hidden', 'inaccessible'].includes(access);
}

export function buildVisibleContextReferenceSummary(refs) {
  return {
    anchor_count: refs.anchorIds.size,
    g5_edge_count: refs.g5EdgeIds.size,
    npc_count: refs.npcIds.size,
    item_count: refs.itemIds.size,
    container_count: refs.containerIds.size,
    knowledge_ref_count: refs.knowledgeIds.size,
    hidden_fact_count: refs.hiddenFactIds.size,
    allowed_visible_hint_count: refs.allowedVisibleHintRefs.size
  };
}
