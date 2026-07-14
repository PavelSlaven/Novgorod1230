import { deepFreeze } from '@rus/kernel';
import { validateSemanticState } from './semantic-state-validation.js';

export function validateDomainMaterialization(domain, startAnchorId) {
  const ids = new Set(Object.values(domain).flat().map((item) => item.instance_id));
  const concerns = [];
  const nodeIds = new Set(domain.g5_nodes.map((item) => item.instance_id));
  const anchorIds = new Set(domain.g5_anchors.map((item) => item.instance_id));
  if (nodeIds.size === 0 || anchorIds.size === 0 || !anchorIds.has(startAnchorId)) concerns.push({ code: 'G5_GRAPH_EMPTY_OR_START_INVALID' });
  for (const anchor of domain.g5_anchors) if (!nodeIds.has(anchor.attributes?.g5_node_instance_id)) concerns.push({ code: 'G5_ANCHOR_REFERENCE_INVALID', instance_id: anchor.instance_id });
  const anchoredNodeIds = new Set(domain.g5_anchors.map((anchor) => anchor.attributes?.g5_node_instance_id));
  for (const nodeId of nodeIds) if (!anchoredNodeIds.has(nodeId)) concerns.push({ code: 'G5_NODE_ORPHANED', instance_id: nodeId });
  const adjacency = new Map([...anchorIds].map((id) => [id, new Set()]));
  for (const edge of domain.g5_edges) {
    const from = edge.attributes?.from_instance_id;
    const to = edge.attributes?.to_instance_id;
    if (!from || !to || from === to || !anchorIds.has(from) || !anchorIds.has(to)) concerns.push({ code: 'G5_EDGE_REFERENCE_INVALID', instance_id: edge.instance_id });
    else {
      const fromAnchor = domain.g5_anchors.find((anchor) => anchor.instance_id === from);
      const toAnchor = domain.g5_anchors.find((anchor) => anchor.instance_id === to);
      const fromNode = domain.g5_nodes.find((node) => node.instance_id === fromAnchor?.attributes?.g5_node_instance_id);
      const toNode = domain.g5_nodes.find((node) => node.instance_id === toAnchor?.attributes?.g5_node_instance_id);
      if ([edge, fromAnchor, toAnchor, fromNode, toNode].every((value) => traversable(value?.attributes?.access_state))) { adjacency.get(from).add(to); adjacency.get(to).add(from); }
    }
  }
  const visited = new Set();
  const queue = anchorIds.has(startAnchorId) ? [startAnchorId] : [];
  while (queue.length) { const id = queue.shift(); if (visited.has(id)) continue; visited.add(id); queue.push(...adjacency.get(id)); }
  if (visited.size !== anchorIds.size) concerns.push({ code: 'G5_GRAPH_DISCONNECTED', unreachable_anchor_ids: [...anchorIds].filter((id) => !visited.has(id)) });
  const exitIds = domain.g5_anchors.filter((anchor) => ['exit', 'start_and_exit'].includes(anchor.attributes?.entry_role)).map((anchor) => anchor.instance_id);
  if (exitIds.length === 0 || exitIds.some((id) => !visited.has(id))) concerns.push({ code: 'G5_EXIT_UNREACHABLE', unreachable_anchor_ids: exitIds.filter((id) => !visited.has(id)) });
  for (const item of [...domain.npcs, ...domain.items, ...domain.containers]) {
    const anchor = item.attributes?.anchor_instance_id;
    if (anchor && !ids.has(anchor)) concerns.push({ code: 'INSTANCE_ANCHOR_REFERENCE_INVALID', instance_id: item.instance_id });
  }
  const anchorUsage = new Map([...anchorIds].map((id) => [id, { npc: 0, item: 0, container: 0 }]));
  const countAnchor = (instance, kind, anchorId) => {
    if (!anchorId || !anchorUsage.has(anchorId)) return;
    const usage = anchorUsage.get(anchorId);
    usage[kind] += 1;
    const anchor = domain.g5_anchors.find((record) => record.instance_id === anchorId);
    const capacity = anchor?.attributes?.[`${kind}_capacity`];
    if (!Number.isInteger(capacity) || capacity < 0 || usage[kind] > capacity) concerns.push({ code: 'G5_ANCHOR_CAPACITY_EXCEEDED', instance_id: instance.instance_id, anchor_instance_id: anchorId, domain: kind, capacity, used: usage[kind] });
    const anchorAccess = anchor?.attributes?.access_state?.access ?? anchor?.attributes?.access_state?.state;
    if (['forbidden', 'locked', 'closed'].includes(anchorAccess) && instance.attributes?.access_state?.anchor_permission !== true) concerns.push({ code: 'INSTANCE_ACCESS_INCOMPATIBLE', instance_id: instance.instance_id, anchor_instance_id: anchorId, anchor_access: anchorAccess });
    const anchorVisibility = anchor?.attributes?.visibility_state?.visibility ?? anchor?.attributes?.visibility_state?.state;
    const visible = instance.attributes?.visibility_state?.visible === true || instance.attributes?.visibility_state?.visibility === 'visible';
    if (['hidden', 'blocked', 'offscreen'].includes(anchorVisibility) && visible && !instance.attributes?.visibility_state?.visibility_basis) concerns.push({ code: 'INSTANCE_VISIBILITY_INCOMPATIBLE', instance_id: instance.instance_id, anchor_instance_id: anchorId, anchor_visibility: anchorVisibility });
  };
  for (const npc of domain.npcs) {
    countAnchor(npc, 'npc', npc.attributes?.anchor_instance_id);
    validateSemanticState(npc, concerns, ['identity_state', 'machine_state', 'presence_reason', 'access_state', 'visibility_state', 'causal_basis']);
  }
  for (const item of domain.items) {
    countAnchor(item, 'item', item.attributes?.placement?.anchor_instance_id);
    validateSemanticState(item, concerns, ['item_category_id', 'causal_basis', 'property_state', 'access_state', 'visibility_state', 'risk_state', 'state']);
    if (!item.profile_id) concerns.push({ code: 'ITEM_PROFILE_MISSING', instance_id: item.instance_id });
  }
  for (const container of domain.containers) {
    countAnchor(container, 'container', container.attributes?.anchor_instance_id);
    const placementTargets = ['anchor_instance_id', 'parent_container_instance_id', 'holder_npc_instance_id', 'holder_character_id']
      .filter((key) => typeof container.attributes?.[key] === 'string' && container.attributes[key].trim());
    if (placementTargets.length !== 1) concerns.push({ code: 'CONTAINER_PLACEMENT_INVALID', instance_id: container.instance_id });
    if (container.attributes?.parent_container_instance_id && !domain.containers.some((record) => record.instance_id === container.attributes.parent_container_instance_id)) concerns.push({ code: 'CONTAINER_PARENT_INVALID', instance_id: container.instance_id });
    if (container.attributes?.holder_npc_instance_id && !domain.npcs.some((record) => record.instance_id === container.attributes.holder_npc_instance_id)) concerns.push({ code: 'CONTAINER_HOLDER_NPC_INVALID', instance_id: container.instance_id });
    validateSemanticState(container, concerns, ['causal_basis', 'property_state', 'access_state', 'visibility_state', 'risk_state', 'state']);
  }
  for (const graphInstance of [...domain.g5_nodes, ...domain.g5_anchors, ...domain.g5_edges]) validateSemanticState(graphInstance, concerns, ['access_state', 'visibility_state', 'state']);
  const ownershipCounts = new Map([...domain.items, ...domain.containers].map((instance) => [instance.instance_id, 0]));
  const ownershipByTarget = new Map();
  for (const ownership of domain.ownership) {
    const target = ownership.attributes?.item_instance_id ?? ownership.attributes?.container_instance_id;
    if (ownershipCounts.has(target)) {
      ownershipCounts.set(target, ownershipCounts.get(target) + 1);
      ownershipByTarget.set(target, ownership);
    }
  }
  for (const [instanceId, count] of ownershipCounts) if (count !== 1) concerns.push({ code: 'INSTANCE_OWNERSHIP_INVALID', instance_id: instanceId, ownership_count: count });
  for (const resource of [...domain.items, ...domain.containers]) {
    const ownership = ownershipByTarget.get(resource.instance_id);
    if (!ownership) continue;
    const ownerModel = resource.attributes?.property_state?.owner_model;
    const actualOwnerModel = ownership.attributes?.owner_party === true ? 'party' : ownership.attributes?.owner_npc_instance_id ? 'npc' : ownership.attributes?.owner_character_id ? 'character' : null;
    if (typeof ownerModel !== 'string' || !ownerModel || ownerModel !== actualOwnerModel) concerns.push({ code: 'INSTANCE_OWNERSHIP_POLICY_MISMATCH', instance_id: resource.instance_id, owner_model: ownerModel ?? null, actual_owner_model: actualOwnerModel });
  }
  return deepFreeze({ pass: concerns.length === 0, concerns, checked_instance_count: ids.size });
}

function traversable(policy) {
  const state = policy?.access_state ?? policy?.access ?? policy?.state;
  if (['forbidden', 'closed', 'locked', 'blocked', 'sealed'].includes(state)) return policy?.traversal_permission === true;
  return typeof state === 'string' && state.length > 0;
}
