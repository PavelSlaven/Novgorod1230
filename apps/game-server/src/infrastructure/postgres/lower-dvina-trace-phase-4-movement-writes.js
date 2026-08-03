import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { buildLocalTraversalWriteSet } from './local-traversal-write-set.js';
import {
  appendArrivalObservation,
  appendM2ArrivalPerception
} from './lower-dvina-trace-phase-4-semantic-writes.js';

export function appendPhase4Movement({
  inserts,
  updates,
  appends,
  partyId,
  state,
  next,
  factual,
  turnNumber,
  changeSetId,
  idemId,
  contracts
}) {
  const movement = factual.consequence.movement;
  const traversal = movement.traversal;
  if (!traversal || traversal.owner !== '@rus/movement-routes'
      || traversal.duration_minutes !== contracts.route.duration_minutes
      || canonicalDigest(traversal.participant_group)
        !== canonicalDigest(movement.participants)
      || traversal.planning_state_version !== state.party_state.state_version
      || traversal.interval_result?.clock_commit_mode !== 'direct_party_clock'
      || traversal.interval_result?.result_kind !== 'segment_completed'
      || traversal.interval_result?.actual_time_numerator
        !== String(contracts.route.duration_minutes)
      || traversal.interval_result?.actual_time_denominator !== '1'
      || traversal.final_travel_state?.closed_result !== 'completed') {
    throw new Error('TRACE_PHASE_4_TRAVERSAL_PROOF_INVALID');
  }
  updates.push(row('party_positions', partyId, {
    party_id: partyId,
    g4_id: next.position.g4_id,
    g5_node_id: next.position.g5_node_id,
    g5_anchor_id: next.position.g5_anchor_id
  }));
  for (const npc of next.npcs.filter(({ instance_id: id }) =>
    movement.participants.includes(id))) {
    updates.push(row('party_npcs', npc.instance_id, {
      party_id: partyId,
      npc_id: npc.instance_id,
      profile_level: npc.profile_level,
      anchor_id: npc.anchor_id
    }));
  }
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:onisim_found_alive`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id: 'onisim_found_alive',
      knowledge_state: 'known_from_committed_source',
      evidence: [movement.arrival_observation_ref]
    }));
  if (movement.reverse_route_ref !== contracts.reverseRoute.route_id
      || movement.reverse_route_digest !== contracts.reverseRoute.digest) {
    throw new Error('TRACE_PHASE_4_REVERSE_ROUTE_PROOF_INVALID');
  }
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:${movement.reverse_route_ref}`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id: movement.reverse_route_ref,
      knowledge_state: 'known_from_committed_traversal',
      evidence: [traversal.ids.execution_id]
    }));
  const pins = traversal.dependency_pins?.pins;
  if (!Array.isArray(pins) || pins.length === 0) {
    throw new Error('TRACE_PHASE_4_TRAVERSAL_PINS_INVALID');
  }
  const set = buildLocalTraversalWriteSet({
    partyId,
    ids: {
      planId: traversal.ids.plan_id,
      executionId: traversal.ids.execution_id,
      travelStateId: traversal.ids.travel_state_id,
      intervalId: traversal.ids.interval_id
    },
    owner: { entity_kind: 'actor', entity_id: state.actor_id },
    sourceEndpoint: traversal.source_endpoint,
    targetEndpoint: traversal.target_endpoint,
    route: {
      route_binding_ref: {
        entity_kind: 'movement_route_binding',
        entity_id: contracts.route.route_id,
        version: contracts.route.version
      },
      connection_profile_ref: null,
      duration_minutes: contracts.route.duration_minutes,
      movement_method: contracts.route.movement_method,
      load_category: movement.inventory_load.load_category,
      planning_algorithm_version: 'exact-local-binding@1',
      outcome_composition_policy_version: 'phase4_known_route@1'
    },
    dependencyPins: pins,
    worldPin: state.world_identity,
    planningRequestId: factual.player_input.request_id,
    planningStateVersion: state.party_state.state_version,
    turnNumber,
    changeSetId,
    idempotencyRecordId: idemId,
    dynamicSnapshot: traversal.interval_result.dynamic_snapshot,
    resultCode: 'phase_4_known_route_completed',
    plannedTimeMinutes: contracts.route.duration_minutes,
    actualElapsedMinutes:
      Number(traversal.interval_result.actual_time_numerator),
    outcomeCompositionTraceDigest:
      traversal.interval_result.outcome_composition_trace_digest
  });
  inserts.push(...set.inserts);
  updates.push(...set.updates);
  appends.push(...set.appends);
  appendArrivalObservation({
    inserts,
    appends,
    state,
    next,
    factual,
    partyId,
    turnNumber,
    changeSetId,
    idemId,
    contracts
  });
  appendM2ArrivalPerception({
    appends,
    state,
    next,
    factual,
    partyId,
    turnNumber,
    changeSetId,
    idemId,
    contracts
  });
  if (contracts.resourceArrivalBinding != null) {
    appendPhase5ArrivalResources({ inserts, state, next, partyId });
  }
}

function appendPhase5ArrivalResources({ inserts, state, next, partyId }) {
  const templates = new Set([
    'trace_ld_v1_item_fishing_net',
    'trace_ld_v1_item_carry_poles',
    'trace_ld_v1_item_eremey_drinking_water_vessel'
  ]);
  if (state.items.some(({ template_id: id }) => templates.has(id))) {
    throw new Error('TRACE_PHASE_5_RESOURCE_ALREADY_MATERIALIZED');
  }
  const items = next.items.filter(({ template_id: id }) => templates.has(id));
  if (items.length !== templates.size) {
    throw new Error('TRACE_PHASE_5_RESOURCE_ARRIVAL_WRITE_INCOMPLETE');
  }
  for (const item of items) {
    inserts.push(row('party_items', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      run_id: state.materialization_trace.run_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      category_id: item.category_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      state: item.state
    }));
    inserts.push(row('party_item_placements', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      anchor_id: null,
      container_id: null,
      holder_npc_id: item.placement.holder_npc_id,
      holder_character_id: null,
      physical_position: item.placement.physical_position,
      equipment_slot_category_id: null
    }));
    inserts.push(row('party_ownership', item.ownership.ownership_id, {
      party_id: partyId,
      ownership_id: item.ownership.ownership_id,
      item_id: item.item_id,
      container_id: null,
      owner_npc_id: item.ownership.owner_npc_id,
      owner_character_id: null,
      owner_party: false,
      owner_external_ref: null,
      controller_npc_id: item.ownership.controller_npc_id,
      controller_character_id: null,
      claim_state: item.ownership.claim_state
    }));
  }
}
