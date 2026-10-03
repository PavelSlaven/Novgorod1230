import { projectCombatBodyStateDescriptions } from '@rus/body-state';

export function projectTraceCombatSubjectiveState(actorRef, state,
  { combatDataProbe = null } = {}) {
  const npc = state.npcs?.find(
    ({ instance_id: id }) => id === actorRef.entity_id
  );
  const current = state.actor_states?.[
    `${actorRef.entity_kind}:${actorRef.entity_id}`]?.body_state;
  let body;
  if (combatDataProbe?.mode === 'D65_PROBE') {
    if (current == null) fail('TRACE_COMBAT_SUBJECTIVE_BODY_GAP', actorRef);
    body = projectD65Body(current, combatDataProbe, actorRef);
  } else {
    body = projectQualitativeBody(qualitativeBodySources(actorRef, state, npc));
  }
  if (Object.keys(body).length === 0) {
    fail('TRACE_COMBAT_SUBJECTIVE_BODY_GAP', actorRef);
  }
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

function projectD65Body(bodyState, probe, actorRef) {
  const projected = projectCombatBodyStateDescriptions({
    body_state: bodyState,
    qualitative_profile: probe.qualitativeProfile,
    data_approval: probe.dataApproval,
    mode: probe.mode
  });
  if (!projected.ok) fail(projected.error.code, actorRef);
  return { body_state_descriptions: projected.body_state_descriptions };
}

function fail(code, actorRef) {
  throw Object.assign(new Error(code), { code,
    details: { actor_ref: structuredClone(actorRef) } });
}

function qualitativeBodySources(actorRef, state, npc) {
  const current = state.actor_states?.[
    `${actorRef.entity_kind}:${actorRef.entity_id}`]?.body_state;
  if (current != null) return [current];
  return [npc?.subjective_body_state, npc?.check_body_state, npc?.body_state,
    npc?.machine_state?.body_condition];
}

function projectQualitativeBody(sources) {
  const body = {};
  for (const key of ['condition_summary', 'pain', 'mobility']) {
    const value = sources.map((source) => source?.[key]).find(
      (candidate) => typeof candidate === 'string'
        && candidate.trim() !== '');
    if (value != null) {
      body[key] = value;
    }
  }
  const usableHands = sources.map((source) => source?.usable_hands).find(
    (candidate) => Number.isSafeInteger(candidate) && candidate >= 0);
  if (usableHands != null) {
    body.usable_hands = usableHands;
  }
  return body;
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
