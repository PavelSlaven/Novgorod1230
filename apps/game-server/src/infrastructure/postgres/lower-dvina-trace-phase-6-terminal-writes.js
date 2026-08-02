import { row } from './first-playable/plan-shared.js';

export function appendTerminal({ inserts, updates, appends, partyId, state, next,
  intent, changeSetId, idemId }) {
  updates.push(row('party_positions', partyId, {
    party_id: partyId,
    g4_id: next.position.g4_id,
    g5_node_id: next.position.g5_node_id,
    g5_anchor_id: next.position.g5_anchor_id
  }));
  for (const npc of next.npcs ?? []) {
    if (!intent.terminal_group_ids.includes(npc.instance_id)) continue;
    updates.push(row('party_npcs', npc.instance_id, {
      party_id: partyId,
      npc_id: npc.instance_id,
      anchor_id: npc.anchor_id,
      machine_state: npc.machine_state
    }));
  }
  for (const factId of ['onisim_carried_to_camp_committed',
    intent.ratsha_observation.committed_fact_output]) {
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${factId}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: factId,
        knowledge_state: 'known_from_committed_source',
        evidence: [intent.execution_id]
      }));
  }
}

export function appendPlayerBodyEffect({ updates, appends, partyId, state,
  next, factual, intent, changeSetId, idemId }) {
  const playerEffect = intent.body_effects_by_subject.find(
    ({ subject_ref: subject }) => subject === 'player_clerk'
  );
  if (playerEffect == null || playerEffect.subject_id !== state.actor_id
      || factual.body_update?.applied !== true
      || factual.body_update.proposal?.profile_ref
        !== playerEffect.profile_ref) {
    throw new Error('TRACE_PHASE_6_PLAYER_BODY_EFFECT_GAP');
  }
  updates.push(row('party_actor_body_states',
    `player_character:${state.actor_id}`, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.actor_id,
      health: next.body_state.health,
      energy: next.body_state.energy,
      satiety: next.body_state.satiety,
      updated_change_set_id: changeSetId
    }));
  appends.push(row('party_body_temporal_history',
    `body-history:${intent.execution_id}:${state.actor_id}`, {
      history_id: `body-history:${intent.execution_id}:${state.actor_id}`,
      party_id: partyId,
      subject_kind: 'player_character',
      subject_id: state.actor_id,
      effect_ref: {
        profile_ref: playerEffect.profile_ref,
        exact_deltas: playerEffect.effect.exact_deltas,
        condition_outcomes: playerEffect.effect.condition_outcomes ?? [],
        activity_execution_id: intent.execution_id
      },
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes:
        intent.internal_rebinding.effect_occurred_at.whole_minutes,
      occurred_at_subminute_numerator:
        intent.internal_rebinding.effect_occurred_at.subminute_numerator,
      occurred_at_subminute_denominator:
        intent.internal_rebinding.effect_occurred_at.subminute_denominator
    }));
}
