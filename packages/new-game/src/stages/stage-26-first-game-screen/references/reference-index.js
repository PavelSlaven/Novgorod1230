import { array, isObject, safeClone, text } from '../shared/utils.js';

export function buildStage26ReferenceIndex(input = {}) {
  const publicState = input.committed_public_read_model ?? {};
  const visible = input.approved_visible_context ?? {};
  const index = {
    visibleNpcRefs: new Set(),
    visibleItemRefs: new Set(),
    visibleContainerRefs: new Set(),
    visibleExitRefs: new Set(),
    visibleCueRefs: new Set(),
    attentionTargetRefs: new Set(),
    actionTargetRefs: new Set(),
    knownNodeRefs: new Set(),
    knownRouteRefs: new Set(),
    approvedActionOptionIds: new Set(),
    approvedNarratorUsedRefs: new Set(),
    availableActions: new Map()
  };
  collectRecordRefs(publicList(publicState, 'npcs'), index.visibleNpcRefs, ['npc_instance_id', 'npc_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'items'), index.visibleItemRefs, ['item_instance_id', 'item_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'containers'), index.visibleContainerRefs, ['container_instance_id', 'container_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'exits'), index.visibleExitRefs, ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'cues'), index.visibleCueRefs, ['cue_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'attention_targets'), index.attentionTargetRefs, ['target_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'action_targets'), index.actionTargetRefs, ['target_ref', 'source_ref', 'anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'id']);
  collectRecordRefs(mapList(publicState, 'known_nodes'), index.knownNodeRefs, ['node_ref', 'node_id', 'anchor_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'known_routes'), index.knownRouteRefs, ['route_ref', 'route_id', 'edge_id', 'source_ref', 'id']);
  collectVisibleContextRefs(visible, index);
  for (const option of array(input.approved_narrator_output?.action_options)) {
    if (text(option?.option_id)) index.approvedActionOptionIds.add(option.option_id);
  }
  for (const ref of array(input.approved_narrator_output?.used_visible_context_refs)) {
    if (text(ref)) index.approvedNarratorUsedRefs.add(ref);
  }
  for (const action of array(visible.available_actions_context)) {
    if (!text(action?.action_id)) continue;
    index.availableActions.set(action.action_id, safeClone(action));
    const target = targetRefValue(action.target_ref);
    if (target) index.actionTargetRefs.add(target);
  }
  return index;
}

export function collectVisibleContextRefs(visible, index) {
  collectRecordRefs(array(visible.visible_npcs), index.visibleNpcRefs, ['npc_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_items), index.visibleItemRefs, ['item_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_containers), index.visibleContainerRefs, ['container_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_exits), index.visibleExitRefs, ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.audible_context), index.visibleCueRefs, ['cue_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_anchors), index.knownNodeRefs, ['anchor_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_exits), index.knownRouteRefs, ['route_id', 'edge_id', 'exit_id', 'source_ref', 'id']);
  for (const action of array(visible.available_actions_context)) {
    const target = targetRefValue(action?.target_ref);
    if (target) index.actionTargetRefs.add(target);
  }
}

export function publicList(state, kind) {
  const keys = {
    npcs: ['public_visible_npcs', 'visible_npcs'],
    items: ['public_visible_items', 'visible_items'],
    containers: ['public_visible_containers', 'visible_containers'],
    exits: ['public_visible_exits', 'visible_exits'],
    cues: ['public_visible_cues', 'visible_cues', 'public_attention_targets'],
    context_hints: ['public_context_hints', 'known_context_hints'],
    attention_targets: ['public_attention_targets', 'attention_targets'],
    action_targets: ['public_action_targets', 'action_targets'],
    known_routes: ['public_known_routes', 'known_routes']
  };
  for (const key of keys[kind] ?? []) if (Array.isArray(state?.[key])) return state[key];
  return [];
}

export function mapList(state, kind) {
  const map = state?.public_visible_map ?? state?.known_map ?? {};
  if (kind === 'known_nodes') return [map.known_current_node, ...array(map.known_nearby_nodes)].filter(Boolean);
  return [];
}

export function collectRecordRefs(records, target, candidates) {
  for (const item of array(records)) {
    const ref = resolveRecordRef(item, candidates);
    if (ref) target.add(ref);
  }
}

export function referenceCandidatesForType(type) {
  if (type === 'visible_npc') return ['npc_instance_id', 'npc_ref', 'source_ref', 'id'];
  if (type === 'visible_item') return ['item_instance_id', 'item_ref', 'source_ref', 'id'];
  if (type === 'visible_container') return ['container_instance_id', 'container_ref', 'source_ref', 'id'];
  if (type === 'visible_exit') return ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id'];
  if (type === 'sensory_cue') return ['cue_id', 'source_ref', 'id'];
  return ['target_ref', 'source_ref', 'id'];
}

export function resolveRecordRef(item, candidates) {
  if (!isObject(item)) return null;
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (isObject(value)) {
      const target = targetRefValue(value);
      if (target) return target;
    }
  }
  return targetRefValue(item.target_ref);
}

export function targetRefValue(ref) {
  if (!isObject(ref)) return null;
  for (const key of ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'exit_id', 'route_id', 'node_id']) if (text(ref[key])) return ref[key];
  return null;
}

export function serializeReferenceIndex(index) {
  return Object.fromEntries(Object.entries(index).map(([key, value]) => [key, value instanceof Set ? [...value] : value instanceof Map ? [...value.entries()] : value]));
}

export function summarizeReferenceIndex(index) {
  return Object.fromEntries(Object.entries(index).filter(([, value]) => value instanceof Set || value instanceof Map).map(([key, value]) => [key, value.size]));
}
