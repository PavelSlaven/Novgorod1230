import { validateActorBaseAppearance } from '@rus/actors';

export function assertRevision19CharacterState(result) {
  const player = result.immediate?.player;
  const npcs = result.immediate?.npcs ?? [];
  assertCompleteAppearance(
    player?.dossier?.identity,
    player?.dossier?.body,
    'player'
  );
  if (npcs.length !== 6) {
    fail('LOWER_DVINA_TRACE_ACTOR_SET_INCOMPLETE',
      'Revision 19 requires all six NPC actors.');
  }
  for (const npc of npcs) {
    assertCompleteAppearance(npc.identity_state, null, `npc:${npc.instance_id}`);
  }

  const equipped = (result.immediate?.items ?? [])
    .filter((item) => item.physical_position === 'equipped');
  if (equipped.length !== 14) {
    fail('LOWER_DVINA_TRACE_GARMENT_SET_INCOMPLETE',
      'Revision 19 requires fourteen equipped garment instances.');
  }
  const slots = new Set();
  for (const item of equipped) {
    const holderId = item.holder_npc_id ?? item.holder_character_id;
    const controllerId = item.controller_npc_id
      ?? item.controller_character_id;
    const ownerId = item.owner_npc_id ?? item.owner_character_id;
    if (!holderId || controllerId !== holderId || ownerId !== holderId
      || !['base_garment', 'outer_garment', 'headwear']
        .includes(item.equipment_slot_category_id)
      || !item.state?.visual_profile_snapshot) {
      fail('LOWER_DVINA_TRACE_GARMENT_STATE_INVALID',
        `Equipped item ${item.instance_id ?? '?'} is not an actor-held visual garment.`);
    }
    const slotKey = `${holderId}:${item.equipment_slot_category_id}`;
    if (slots.has(slotKey)) {
      fail('LOWER_DVINA_TRACE_GARMENT_SLOT_AMBIGUOUS',
        `Actor garment slot ${slotKey} is ambiguous.`);
    }
    slots.add(slotKey);
  }
  if (containsKey(result, 'portrait_spec_v1')) {
    fail('LOWER_DVINA_TRACE_PORTRAIT_SPEC_PERSISTENCE_FORBIDDEN',
      'portrait_spec_v1 is a read projection and cannot enter a write plan.');
  }
}

function assertCompleteAppearance(identity, body, label) {
  const validation = validateActorBaseAppearance(identity, {
    requireComplete: true,
    body
  });
  if (!validation.ok
      || identity?.appearance_contract_version !== 'actor_base_appearance_v1') {
    fail('LOWER_DVINA_TRACE_ACTOR_APPEARANCE_INCOMPLETE',
      `${label}: ${validation.errors.join('; ')
        || 'appearance contract version is missing'}`);
  }
}

function containsKey(value, key, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((child) => containsKey(child, key, seen));
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
