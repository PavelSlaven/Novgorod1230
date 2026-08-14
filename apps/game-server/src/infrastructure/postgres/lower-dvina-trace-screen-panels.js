import { createPeoplePanel } from '@rus/presentation';
import { projectActiveConversationInterlocutor } from
  '@rus/visibility-knowledge-memory';

import { projectLowerDvinaTracePlayerSafeState } from
  '../../runtime/lower-dvina-trace-player-safe-state.js';

export function projectLowerDvinaTraceScreenPanels({ payload, screen }) {
  const projection = projectLowerDvinaTracePlayerSafeState({
    committed_state: payload,
    actor_id: payload.actor_id
  }).player_safe_state;
  const activeInterlocutor = projectActiveConversationInterlocutor({
    conversation_sessions: payload.conversation_sessions ?? [],
    player_ref: {
      entity_kind: 'player_character', entity_id: payload.actor_id
    },
    current_location_ref: projection.position?.location_ref,
    visible_npcs: playerSafeDisplayNamedNpcs({
      projectedNpcs: projection.npcs,
      visibleNpcs: screen.visible_context?.visible_npc
    })
  });
  const panels = structuredClone(screen.panels ?? {});
  const previousPeople = panels.people;
  const peopleData = plain(previousPeople?.data)
    ? structuredClone(previousPeople.data) : {};
  delete peopleData.active_interlocutor;
  if (activeInterlocutor !== null) {
    peopleData.active_interlocutor = activeInterlocutor;
  }
  if (Object.keys(peopleData).length > 0) {
    panels.people = createPeoplePanel(peopleData, {
      visible: activeInterlocutor !== null || previousPeople?.visible !== false
    });
  } else {
    delete panels.people;
  }
  return { ...screen, panels };
}

function playerSafeDisplayNamedNpcs({ projectedNpcs, visibleNpcs }) {
  if (!Array.isArray(projectedNpcs)) return [];
  const labels = Array.isArray(visibleNpcs) ? visibleNpcs : [];
  return projectedNpcs.map((npc) => {
    const ids = [npc?.instance_id, npc?.actor_id, npc?.npc_id]
      .filter(nonEmptyText);
    const publicNames = labels.filter((visibleNpc) =>
      visibleNpc?.entity_ref?.entity_kind === 'npc'
        && ids.includes(visibleNpc.entity_ref.entity_id)
        && nonEmptyText(visibleNpc.display_label))
      .map(({ display_label: displayLabel }) => displayLabel.trim());
    if (publicNames.length !== 1) return null;
    return {
      instance_id: npc.instance_id,
      actor_id: npc.actor_id,
      npc_id: npc.npc_id,
      identity_state: { display_name: publicNames[0] }
    };
  }).filter(Boolean);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
