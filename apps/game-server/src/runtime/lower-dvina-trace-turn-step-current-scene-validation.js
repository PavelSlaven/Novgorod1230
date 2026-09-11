import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { plain } from './lower-dvina-trace-turn-step-runtime-common.js';

const ARRAY_FIELDS = ['visible_changes', 'sensory_details', 'visible_npc',
  'visible_objects', 'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'];

export function validCurrentScene(value) {
  return plain(value)
    && validateVisibleContext(value).ok
    && ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}

export function visibleNpc(npc, position, visibleLabels) {
  const entityId = npc?.instance_id ?? npc?.actor_id ?? npc?.npc_id;
  const prior = visibleLabels?.get(entityId);
  const displayLabel = prior?.display_label;
  if (!samePositionScope(npc, position) || !text(entityId) || !text(displayLabel)) {
    return null;
  }
  return {
    entity_ref: { entity_kind: 'npc', entity_id: entityId },
    display_label: displayLabel,
    recognition: prior?.recognition ?? 'recognized'
  };
}

export function failCurrentScene() {
  throw Object.assign(new Error(
    'The committed current scene cannot be projected safely.'),
  { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID', status: 409 });
}

function samePositionScope(npc, position) {
  const scopes = [['location_ref', 'location_ref'], ['anchor_id', 'g5_anchor_id'],
    ['g5_anchor_id', 'g5_anchor_id'], ['zone_ref', 'zone_ref']]
    .filter(([npcKey, positionKey]) => text(npc?.[npcKey])
      && text(position?.[positionKey]));
  return scopes.length > 0 && scopes.every(([npcKey, positionKey]) =>
    npc[npcKey] === position?.[positionKey]);
}
function text(value) { return typeof value === 'string' && value.length > 0; }
