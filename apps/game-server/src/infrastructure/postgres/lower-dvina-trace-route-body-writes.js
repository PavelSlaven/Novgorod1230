import { row } from './first-playable/plan-shared.js';

export function appendRouteBodyWrites({ updates, appends, partyId, state, next, factual, changeSetId, idemId, historyId }) {
  if (factual.body_update?.applied !== true) return;
  const occurredAt = routeBodyClockAfter(factual);
  updates.push(row('party_actor_body_states', `player_character:${state.actor_id}`, {
    party_id: partyId, actor_kind: 'player_character', actor_id: state.actor_id,
    health: next.body_state.health, energy: next.body_state.energy,
    satiety: next.body_state.satiety, updated_change_set_id: changeSetId
  }));
  const before = new Map((state.body_state.active_conditions ?? []).map((value) => [value.storage_condition_id, value]));
  for (const after of next.body_state.active_conditions ?? []) {
    if (!after.condition_outcome || !before.has(after.storage_condition_id)) continue;
    updates.push(row('party_actor_active_conditions', `player_character:${state.actor_id}:${after.storage_condition_id}`, {
      party_id: partyId, actor_kind: 'player_character', actor_id: state.actor_id,
      condition_id: after.storage_condition_id,
      condition_profile_ref: structuredClone(after.condition_profile_ref), status: 'active', terminal_change_set_id: null
    }));
  }
  appends.push(row('party_body_temporal_history', historyId, {
    history_id: historyId, party_id: partyId, subject_kind: 'player_character', subject_id: state.actor_id,
    effect_ref: { entity_kind: 'body_effect', entity_id: factual.body_update.proposal.profile_ref,
      activity_attempt_id: factual.body_update.proposal.activity_attempt_id },
    change_set_id: changeSetId, idempotency_record_id: idemId,
    occurred_at_whole_minutes: occurredAt.whole_minutes,
    occurred_at_subminute_numerator: occurredAt.subminute_numerator,
    occurred_at_subminute_denominator: occurredAt.subminute_denominator
  }));
}

function routeBodyClockAfter(factual) {
  const route = factual.time_update?.prepared_effect_ledger?.slices?.find(
    ({ effect_kind: kind, owner_ref: owner }) =>
      kind === 'domain_command'
      && owner === 'lower_dvina_trace.follow_path_to_fishing_camp');
  return route?.time_update?.clock_after ?? factual.time_update.clock_after;
}
