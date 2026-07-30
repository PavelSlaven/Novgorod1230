import {
  loadPhase2BodyHistory,
  loadPhase2Conditions,
  phase2IntegrityError
} from './lower-dvina-trace-phase-2-read.js';

export async function loadInitialTracePhase2State({
  partyId,
  row,
  phase1A,
  partyPool,
  temporalSourceProof
}) {
  const initial = await phase1A.loadInternal(partyId);
  if (!initial) throw phase2IntegrityError();
  const actorId = initial.player.instance_id;
  const [activeConditions, bodyEffectHistory] = await Promise.all([
    loadPhase2Conditions(partyPool, partyId, actorId),
    loadPhase2BodyHistory(partyPool, partyId, actorId)
  ]);
  return {
    party_id: partyId,
    actor_id: actorId,
    party_state: {
      state_version: 0,
      session_state_version: Number(row.session_state_version),
      body_state_version: Number(row.body_state_version),
      clock_state_version: Number(row.clock_state_version),
      turn_number: Number(row.turn_number)
    },
    player_profile: initial.player.dossier,
    body_state: {
      ...initial.body,
      active_conditions: activeConditions
    },
    body_effect_history: bodyEffectHistory,
    position: {
      ...initial.position,
      location_ref: 'trace_ld_v1_loc_wreck_shore'
    },
    clock: initial.timestamp,
    clock_weather_light: {
      clock: initial.timestamp,
      weather: {},
      light: {}
    },
    environment_snapshot: initial.environment_snapshot,
    sealed_selections: initial.sealed_selections,
    policy_pins: initial.policy_profile_pins,
    relevant_events: [],
    historical_events: [],
    items: initial.items.map((item) => ({
      item_id: item.item_id,
      template_id: item.template_id,
      placement: {
        anchor_id: item.anchor_id,
        holder_character_id: item.holder_character_id
      },
      state: item.state
    })),
    knowledge: [],
    opening_identity: {
      opening_screen_digest: row.stage26_result.opening_screen_digest
    },
    initial_snapshot_identity: initial.initial_snapshot_identity,
    materialization_trace: initial.materialization_trace,
    temporal_boundary_candidates: [],
    temporal_source_proof: structuredClone(temporalSourceProof)
  };
}
