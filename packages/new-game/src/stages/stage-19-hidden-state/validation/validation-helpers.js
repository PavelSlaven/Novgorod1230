import { array, isObject, issue, text } from '../shared/utils.js';
export function validateTypedTarget(target, refs, path, concerns, allowAction = false) {
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

export function validateKnownRecordRef(hook, refs, path, concerns) {
  for (const [i, write] of array(hook?.writes).entries()) {
    const ref = write?.record_ref;
    if (!text(ref)) continue;
    const known = refs.npcIds.has(ref) || refs.itemIds.has(ref) || refs.containerIds.has(ref) || refs.anchorIds.has(ref)
      || refs.g5EdgeIds.has(ref) || refs.graphEdgeIds.has(ref) || refs.nodeIds.has(ref) || refs.playerCharacterIds.has(ref)
      || ref.startsWith('party_') || ref.startsWith('hidden_') || ref.startsWith('consequence_');
    if (!known) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Consequence write record_ref is not tied to an approved entity.', `${path}.writes[${i}].record_ref`, null, ref));
  }
}

export function registerFact(registry, id, value, path, kind) {
  if (!text(id)) return;
  registry.set(id, { value, path, kind });
}

export function registerId(id, path, registry, concerns) {
  if (!text(id)) {
    concerns.push(issue('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID', 'Stable id is required.', path));
    return;
  }
  if (registry.has(id)) concerns.push(issue('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID', `Duplicate stable id: ${id}.`, path));
  registry.set(id, path);
}

export function validateRef(value, set, code, field, concerns) {
  if (!text(value) || !set.has(value)) concerns.push(issue(code, `Reference not found: ${value ?? 'null'}.`, field, 'approved existing id', value));
}

