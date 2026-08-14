import { deepFreeze } from '@rus/kernel';

/**
 * Projects one active conversation counterpart from committed, already
 * player-safe records. Ambiguous or incomplete state is intentionally hidden.
 */
export function projectActiveConversationInterlocutor({
  conversation_sessions: sessions = [],
  player_ref: playerRef,
  current_location_ref: currentLocationRef,
  visible_npcs: visibleNpcs = []
} = {}) {
  if (!Array.isArray(sessions) || !exactRef(playerRef, 'player_character')
      || !nonEmptyText(currentLocationRef) || !Array.isArray(visibleNpcs)) {
    return null;
  }
  const activeAtLocation = sessions.filter((session) =>
    session?.schema === 'conversation_session_v1'
      && session.status === 'active'
      && exactRef(session.location_ref, 'location')
      && session.location_ref.entity_id === currentLocationRef
      && Array.isArray(session.active_participant_refs)
      && session.active_participant_refs.some((participant) =>
        sameRef(participant, playerRef)));
  if (activeAtLocation.length !== 1) return null;

  const participants = activeAtLocation[0].active_participant_refs;
  if (participants.some((participant) => !exactParticipantRef(participant))) {
    return null;
  }
  const playerParticipants = participants.filter((participant) =>
    sameRef(participant, playerRef));
  const npcParticipants = participants.filter(({ entity_kind: kind }) =>
    kind === 'npc');
  if (participants.length !== 2 || playerParticipants.length !== 1
      || npcParticipants.length !== 1) {
    return null;
  }

  const npcRef = npcParticipants[0];
  const matches = visibleNpcs.filter((npc) =>
    visibleNpcIds(npc).includes(npcRef.entity_id)
      && nonEmptyText(npc?.identity_state?.display_name));
  if (matches.length !== 1) return null;
  const npc = matches[0];
  const output = {
    entity_ref: structuredClone(npcRef),
    display_label: npc.identity_state.display_name.trim()
  };
  if (nonEmptyText(npc.role_label)) output.role_label = npc.role_label.trim();
  return deepFreeze(output);
}

function visibleNpcIds(npc) {
  if (!plain(npc)) return [];
  return [npc.instance_id, npc.actor_id, npc.npc_id]
    .filter(nonEmptyText);
}

function exactParticipantRef(value) {
  return exactRef(value, 'player_character') || exactRef(value, 'npc');
}

function exactRef(value, entityKind) {
  return plain(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'entity_kind')
    && Object.hasOwn(value, 'entity_id')
    && value.entity_kind === entityKind
    && nonEmptyText(value.entity_id);
}

function sameRef(left, right) {
  return left?.entity_kind === right.entity_kind
    && left?.entity_id === right.entity_id;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
