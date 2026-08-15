import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';

export function conversationWrites(input, buildTimedActivityRows) {
  const set = buildTimedActivityRows(input);
  const { state, changeSet, versions } = input;
  const partyId = state.party_id;
  if (versions.npcProfile == null) {
    set.inserts.push(row(
      'party_actor_profile_bindings',
      `npc:${state.npc.id}`,
      {
        party_id: partyId,
        actor_kind: 'npc',
        actor_id: state.npc.id,
        role_ref: ref('role', state.npc.role_id),
        occupation_ref: ref('occupation', state.npc.occupation_id),
        skill_profile_snapshot: {},
        name_profile_snapshot: {
          name_id: state.npc.name_id,
          display_name: state.npc.name,
          name_provenance: 'first_playable_catalog'
        },
        language_profile_snapshot: state.npc.language_profile,
        knowledge_profile_snapshot: state.npc.knowledge_profile,
        profile_candidate_set_digest:
          state.npc.profile_candidate_set_digest,
        state_version: 1,
        created_change_set_id: changeSet,
        updated_change_set_id: changeSet
      }
    ));
  }
  const interactionId =
    `interaction:${partyId}:${input.turnNumber}`;
  set.appends.push(
    row('party_actor_npc_interactions', interactionId, {
      interaction_id: interactionId,
      party_id: partyId,
      actor_id: state.player.id,
      npc_id: state.npc.id,
      interaction_kind: 'conversation',
      activity_execution_id: set.executionId,
      started_at: { minute: state.clock_minutes - input.result.elapsed },
      ended_at: { minute: state.clock_minutes },
      location_ref: { position: state.location },
      outcome: 'completed',
      terminal_change_set_id: changeSet,
      terminal_evidence_kind: 'terminal_attempt',
      terminal_evidence_ref: {
        activity_execution_id: set.executionId,
        attempt_ordinal: 0
      },
      interaction_policy_ref:
        ref('interaction_policy', 'conversation_terminal_projection_v1'),
      canonical_digest: hash(`${interactionId}:${state.npc.name}`)
    })
  );
  for (const [scope, subjectKind, subjectId, text] of [
    [
      'player_journal',
      'player_character',
      state.player.id,
      `Разговор с рыбаком ${state.npc.name} о сезонной работе и непроверенной воде.`
    ],
    [
      'npc_memory',
      'npc',
      state.npc.id,
      `${state.npc.name} запомнил встречу с лодочником.`
    ]
  ]) {
    set.appends.push(row(
      'party_actor_npc_interaction_summaries',
      `summary:${interactionId}:${scope}`,
      {
        summary_id: `summary:${interactionId}:${scope}`,
        interaction_id: interactionId,
        summary_scope: scope,
        remembering_subject_kind: subjectKind,
        remembering_subject_id: subjectId,
        summary_text: text,
        salience: 1,
        source_message_digest: hash(text),
        state_version: 1,
        created_change_set_id: changeSet
      }
    ));
  }
  return set;
}
