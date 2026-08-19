export function validLowerDvinaTraceO2bPhysicalAttestation(
  container, loadedProfile
) {
  if (loadedProfile.profile.schema
      !== 'rus.lower_dvina_trace_o2b_existing_container_profile.v2') return true;
  const initial = loadedProfile.initial_container;
  const placement = container.placement;
  const ownership = container.ownership;
  const state = container.state;
  const actor = container.actor_id;
  const actorPosition = container.actor_position_ref;
  const actorHeld = plain(placement) && text(actor)
    && placement.holder_character_id === actor
    && placement.anchor_id == null && placement.container_id == null
    && placement.holder_npc_id == null
    && ACTOR_ITEM_PHYSICAL_POSITIONS.includes(placement.physical_position);
  const actorReachable = plain(placement) && text(actorPosition)
    && placement.anchor_id === actorPosition
    && placement.container_id == null && placement.holder_npc_id == null
    && placement.holder_character_id == null
    && placement.physical_position == null;
  return plain(placement) && plain(ownership) && plain(state)
    && (actorHeld || actorReachable)
    && ownership.owner_character_id === actor
    && ownership.controller_character_id === actor
    && ownership.owner_npc_id == null && ownership.controller_npc_id == null
    && ownership.owner_party === false
    && ownership.claim_state === initial.first_entry_placement.claim_state
    && state.owner_character_id === actor
    && state.controller_character_id === actor
    && text(state.first_entry_position_ref)
    && state.semantic_category === initial.container_state.semantic_category;
}

function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}

function plain(value) {
  return value != null && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
import { ACTOR_ITEM_PHYSICAL_POSITIONS } from '@rus/items-property';
