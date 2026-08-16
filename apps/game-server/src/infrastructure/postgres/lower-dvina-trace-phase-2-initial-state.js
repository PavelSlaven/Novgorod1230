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
    world_identity: {
      world_revision_id: row.world_revision_id,
      world_catalog_digest: row.world_catalog_digest
    },
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
    prepared_scenes: structuredClone(initial.prepared_scenes),
    npcs: structuredClone(initial.npcs),
    promise_instances: structuredClone(initial.promise_instances ?? []),
    interactions: [],
    route_history: [],
    route_knowledge: [],
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
      run_id: item.run_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      category_id: item.category_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      placement: {
        anchor_id: item.placement.anchor_id,
        container_id: item.placement.container_id,
        holder_npc_id: item.placement.holder_npc_id,
        holder_character_id: item.placement.holder_character_id,
        physical_position: item.placement.physical_position,
        equipment_slot_category_id:
          item.placement.equipment_slot_category_id
      },
      ownership: {
        ownership_id: item.ownership.ownership_id,
        owner_npc_id: item.ownership.owner_npc_id,
        owner_character_id: item.ownership.owner_character_id,
        owner_external_ref: item.ownership.owner_external_ref,
        owner_party: item.ownership.owner_party,
        controller_npc_id: item.ownership.controller_npc_id,
        controller_character_id: item.ownership.controller_character_id,
        claim_state: item.ownership.claim_state
      },
      state: item.state
    })),
    containers: structuredClone(initial.containers ?? []),
    container_placements: (initial.containers ?? []).map((container) => ({
      party_id: partyId,
      container_id: container.container_id,
      anchor_id: container.anchor_id,
      parent_container_id: container.parent_container_id,
      holder_npc_id: container.holder_npc_id,
      holder_character_id: container.holder_character_id,
      physical_position: container.physical_position,
      equipment_slot_category_id: container.equipment_slot_category_id
    })),
    knowledge: [],
    opening_identity: {
      opening_screen_digest: row.stage26_result.opening_screen_digest
    },
    initial_snapshot_identity: initial.initial_snapshot_identity,
    materialization_trace: initial.materialization_trace,
    temporal_boundary_candidates:
      structuredClone(temporalSourceProof.candidates),
    temporal_source_proof: structuredClone(temporalSourceProof)
  };
}
