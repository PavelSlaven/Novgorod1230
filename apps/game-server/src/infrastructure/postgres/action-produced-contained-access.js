import { runtimeItemContentsAreOpen } from '@rus/items-property';

const CONTAINER_KEYS = [
  'container_id', 'anchor_id', 'parent_container_id', 'holder_npc_id',
  'holder_character_id', 'physical_position', 'equipment_slot_category_id',
  'condition_state', 'closure_state', 'state', 'state_version', 'ownership'
];
const OWNERSHIP_KEYS = [
  'ownership_id', 'owner_npc_id', 'owner_character_id', 'owner_party',
  'controller_npc_id', 'controller_character_id', 'claim_state'
];
const EXTERNAL_OWNERSHIP_KEYS = [...OWNERSHIP_KEYS, 'owner_external_ref'];

export async function loadActionProducedAccessContainers(client, partyId,
  containerIds, { lock = false } = {}) {
  const ids = [...new Set(containerIds.filter(text))];
  if (ids.length === 0) return new Map();
  const selected = await client.query(
    `SELECT c.container_id,c.anchor_id,c.parent_container_id,c.holder_npc_id,
       c.holder_character_id,c.physical_position,
       c.equipment_slot_category_id,c.condition_state,c.closure_state,
       c.state,c.state_version,o.ownership_id,o.owner_npc_id,
       o.owner_character_id,o.owner_party,o.owner_external_ref,
       o.controller_npc_id,
       o.controller_character_id,o.claim_state
     FROM party_runtime.party_containers c
     JOIN party_runtime.party_ownership o
       ON o.party_id=c.party_id AND o.container_id=c.container_id
     WHERE c.party_id=$1 AND c.container_id=ANY($2::text[])
     ORDER BY c.container_id${lock ? ' FOR UPDATE OF c,o' : ''}`,
  [partyId, ids]);
  return new Map(selected.rows.map((row) => [row.container_id,
    normalizeAccessContainer(row)]));
}

export function actionProducedPlacementAccessible(placement, accessContainer,
  actorRef, accessAnchorId, accessScenePositionId = null) {
  if (actorMatches(placement, actorRef, 'holder_character_id',
    'holder_npc_id')) return true;
  if (text(accessAnchorId) && placement.anchor_id === accessAnchorId
      && placement.holder_character_id === null
      && placement.holder_npc_id === null && placement.container_id === null
      && placement.attached_item_id === null) return true;
  if (text(accessScenePositionId)
      && placement.scene_position_id === accessScenePositionId
      && placement.holder_character_id === null
      && placement.holder_npc_id === null && placement.container_id === null
      && placement.attached_item_id === null) return true;
  return text(placement.container_id)
    && placement.container_id === accessContainer?.container_id
    && validActionProducedAccessContainer(accessContainer, actorRef,
      accessAnchorId);
}

export function actionProducedAccessState(placement, accessContainer,
  actorRef, accessAnchorId, accessScenePositionId = null) {
  if (!actionProducedPlacementAccessible(placement, accessContainer, actorRef,
    accessAnchorId, accessScenePositionId)) return null;
  return actorMatches(placement, actorRef, 'holder_character_id',
    'holder_npc_id')
      && ['hands', 'equipped', 'worn_quick'].includes(
        placement.physical_position)
    ? 'immediate' : 'quick';
}

export function actionProducedControllerRef(value) {
  return value.controller_character_id ?? value.controller_npc_id ?? null;
}

export function actionProducedControllerPermitted(value, role, actorRef) {
  return role === 'tool'
    ? actorMatches(value, actorRef, 'controller_character_id',
      'controller_npc_id')
    : Number(Boolean(text(value.controller_character_id)))
      + Number(Boolean(text(value.controller_npc_id))) <= 1;
}

export function validActionProducedAccessContainer(value, actorRef,
  accessAnchorId) {
  if (!exact(value, CONTAINER_KEYS) || !text(value.container_id)
      || !Number.isSafeInteger(value.state_version)
      || value.state_version < 0 || !plain(value.state)
      || !(exact(value.ownership, OWNERSHIP_KEYS)
        || exact(value.ownership, EXTERNAL_OWNERSHIP_KEYS))
      || !validOwnership(value.ownership)
      || !actorMatches(value.ownership, actorRef, 'controller_character_id',
        'controller_npc_id')
      || !runtimeItemContentsAreOpen(value)) return false;
  return actorMatches(value, actorRef, 'holder_character_id', 'holder_npc_id')
      && value.parent_container_id === null
    || text(accessAnchorId) && value.anchor_id === accessAnchorId
      && value.holder_character_id === null && value.holder_npc_id === null
      && value.parent_container_id === null;
}

function normalizeAccessContainer(row) {
  return {
    container_id: row.container_id, anchor_id: row.anchor_id,
    parent_container_id: row.parent_container_id,
    holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id,
    condition_state: row.condition_state, closure_state: row.closure_state,
    state: row.state, state_version: Number(row.state_version),
    ownership: {
      ownership_id: row.ownership_id, owner_npc_id: row.owner_npc_id,
      owner_character_id: row.owner_character_id, owner_party: row.owner_party,
      ...(row.owner_external_ref == null ? {} : {
        owner_external_ref: row.owner_external_ref
      }),
      controller_npc_id: row.controller_npc_id,
      controller_character_id: row.controller_character_id,
      claim_state: row.claim_state
    }
  };
}

function validOwnership(value) {
  const owners = Number(Boolean(text(value.owner_character_id)))
    + Number(Boolean(text(value.owner_npc_id)))
    + Number(value.owner_party === true)
    + Number(validExternalOwner(value.owner_external_ref));
  return owners === 1 && typeof value.owner_party === 'boolean'
    && text(value.claim_state);
}
function validExternalOwner(value) {
  return exact(value, ['entity_kind', 'entity_id'])
    && text(value.entity_kind) && text(value.entity_id);
}
function actorMatches(value, actorRef, characterKey, npcKey) {
  return value[characterKey] === actorRef && value[npcKey] === null
    || value[npcKey] === actorRef && value[characterKey] === null;
}
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value;
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
