import { initializeBodyState } from '@rus/body-state';

export function projectTraceCombatWorkingState(state, combatSession = null) {
  const working = structuredClone(state);
  delete working.last_turn;
  const actorStates = {
    [`player_character:${state.actor_id}`]: {
      body_state: structuredClone(state.body_state) }
  };
  const left = new Set((combatSession?.participant_states ?? [])
    .filter(({ actor_ref: actor, combat_status: status }) =>
      actor?.entity_kind === 'npc' && status === 'left')
    .map(({ actor_ref: actor }) => actor.entity_id));
  const participants = new Set((combatSession?.participant_refs ?? [])
    .filter(({ entity_kind }) => entity_kind === 'npc')
    .filter(({ entity_id }) => !left.has(entity_id))
    .map(({ entity_id }) => entity_id));
  const npcs = new Map((working.npcs ?? []).map((npc) => [npc.instance_id, npc]));
  for (const npcId of participants) {
    const npc = npcs.get(npcId);
    if (!npc) fail('TRACE_COMBAT_NPC_BODY_PARTICIPANT_GAP', npcId);
    let body = npc.body_state;
    if (!npc.body_state_persisted) {
      const initialized = initializeBodyState({
        body_state_profile: npc.body_state_profile
      });
      if (!initialized.ok) fail(initialized.error.code, npcId);
      body = { ...initialized.body_state, active_conditions: [], body_parts: {},
        prose: null };
      npc.body_profile_ref = initialized.profile_ref;
    }
    actorStates[`npc:${npcId}`] = {
      body_state: structuredClone(body),
      body_state_persisted: npc.body_state_persisted === true
    };
  }
  return { ...working, actor_states: actorStates };
}

function fail(code, npcId) {
  throw Object.assign(new Error(code), { code,
    details: { actor_ref: { entity_kind: 'npc', entity_id: npcId } } });
}
