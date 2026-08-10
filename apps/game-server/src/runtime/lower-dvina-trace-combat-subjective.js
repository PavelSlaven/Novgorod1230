export function projectTraceCombatSubjectiveState(actorRef, state) {
  const npc = state.npcs?.find(
    ({ instance_id: id }) => id === actorRef.entity_id
  );
  const body = state.actor_states?.[
    `${actorRef.entity_kind}\0${actorRef.entity_id}`]?.body_state
    ?? npc?.machine_state?.body_condition ?? {};
  return {
    identity: { name_or_label:
      npc?.semantic_profile?.identity?.canonical_name
        ?? npc?.participant_slot_ref ?? 'NPC' },
    social_role: {},
    combat_experience: 'limited',
    attributes: [],
    skills: [],
    body: structuredClone(body),
    mood: {},
    temperament: [],
    goals: [],
    fears: [],
    obligations: [],
    relationships: [],
    available_equipment: (state.items ?? []).filter((item) =>
      item.placement?.holder_npc_id === actorRef.entity_id
        || item.ownership?.controller_npc_id === actorRef.entity_id)
      .map((item) => ({ entity_kind: 'item', entity_id: item.item_id }))
  };
}

export function projectTracePerceivedCombatState(session, state, actorRef) {
  return {
    scope: session.scope_ref,
    visible_opponents: session.participant_refs.filter(
      (ref) => ref.entity_kind === 'player_character'
    ),
    visible_allies: [],
    visible_neutral_actors: [],
    recognized_weapons: [],
    known_positions: session.participant_refs.map((ref) => ({
      actor_ref: ref,
      location_ref: actorPosition(ref, state)
    })).filter(({ actor_ref: ref, location_ref: location }) =>
      location != null && ref.entity_id !== actorRef.entity_id),
    known_exits: [],
    visible_cover: [],
    perceived_hazards: [],
    recent_perceived_events: [],
    uncertainties: []
  };
}

function actorPosition(actorRef, state) {
  if (actorRef.entity_kind === 'player_character') {
    return state.position?.location_ref ?? null;
  }
  const npc = state.npcs?.find(
    ({ instance_id: id }) => id === actorRef.entity_id
  );
  return npc?.machine_state?.location_ref
    ?? npc?.location_profile_ref ?? null;
}
