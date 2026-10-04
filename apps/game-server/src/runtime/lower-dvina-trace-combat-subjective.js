import { projectCombatBodyStateDescriptions } from '@rus/body-state';

export function projectTraceCombatSubjectiveState(actorRef, state,
  { combatDataProbe = null } = {}) {
  const npc = state.npcs?.find(
    ({ instance_id: id }) => id === actorRef.entity_id
  );
  const current = state.actor_states?.[
    `${actorRef.entity_kind}:${actorRef.entity_id}`];
  const bodyState = current?.body_state !== undefined
    ? current.body_state : npc?.body_state;
  const body = projectD65Body(bodyState ?? {}, combatDataProbe ?? {});
  return {
    identity: { name_or_label:
      npc?.semantic_profile?.identity?.canonical_name
        ?? npc?.participant_slot_ref ?? 'NPC' },
    social_role: {},
    combat_experience: 'limited',
    attributes: [],
    skills: [],
    body,
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

function projectD65Body(bodyState, probe) {
  const projected = projectCombatBodyStateDescriptions({
    body_state: bodyState,
    qualitative_profile: probe.qualitativeProfile,
    data_approval: probe.dataApproval,
    mode: probe.mode
  });
  return { body_state_descriptions: projected.body_state_descriptions,
    body_state_gaps: projected.gaps };
}

export function projectTracePerceivedCombatState(session, state, actorRef,
  knownExits = []) {
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
    known_exits: structuredClone(knownExits),
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
