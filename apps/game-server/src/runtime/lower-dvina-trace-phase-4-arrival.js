import { canonicalDigest } from '@rus/materialization';

export function buildTracePhase4M2ArrivalPayload({
  contracts,
  state,
  participants,
  traversal
}) {
  if (contracts.conversationBindings == null) return null;
  const arrival = requireM2ArrivalMapping(
    contracts.conversationSignalMappings?.arrival,
    {
      mappingId: 'trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1',
      category: 'others',
      perceptionRequirement: 'perception_required'
    }
  );
  const objective = requireM2ArrivalMapping(
    contracts.conversationSignalMappings?.objective,
    {
      mappingId: 'trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1',
      category: 'objective',
      perceptionRequirement: 'perception_not_required'
    }
  );
  if (arrival.source_activity_id !== contracts.routeActivity.profile_id
      || objective.source_activity_id !== contracts.routeActivity.profile_id
      || arrival.source_boundary !== 'terminal_position_committed'
      || objective.source_boundary !== 'terminal_position_committed'
      || arrival.source_observation_profile_id !== contracts.ids.observation
      || objective.applicability
        !== 'current_conversation_objective_invalidated') {
    fail('TRACE_M2_PHASE_4_ARRIVAL_SIGNAL_MAPPING_INVALID');
  }
  const partyId = state.party_id;
  const turnNumber = Number(state.party_state?.turn_number) + 1;
  const ratshaId = contracts.actors.ratsha_storehouse_helper.instance_id;
  if (typeof partyId !== 'string' || partyId.length === 0
      || !Number.isSafeInteger(turnNumber) || turnNumber <= 0
      || typeof ratshaId !== 'string' || ratshaId.length === 0) {
    fail('TRACE_M2_PHASE_4_ARRIVAL_SOURCE_IDENTITY_INVALID');
  }
  const temporalEventRef = ref(
    'temporal_event',
    `event:${partyId}:trace-phase4:${turnNumber}:arrival`
  );
  const perceptionRef = ref(
    'perception_result',
    `perception:${partyId}:trace-phase4:${turnNumber}:ratsha-group`
  );
  const targetNpcRef = ref('npc', ratshaId);
  const occurredAt = structuredClone(
    traversal.clock_update.world_time_after
  );
  return {
    schema: 'rus.lower_dvina_trace_phase_4_m2_arrival.v1',
    occurred_at: occurredAt,
    same_time_batch_key: `conversation-batch:${canonicalDigest({
      schema: 'rus.lower_dvina_trace_conversation_batch_identity.v1',
      party_id: partyId,
      exact_game_timestamp: occurredAt
    }).slice(0, 32)}`,
    temporal_event_ref: temporalEventRef,
    target_npc_ref: targetNpcRef,
    perceived_group: {
      mapping_id: arrival.mapping_id,
      source_activity_id: arrival.source_activity_id,
      source_boundary: arrival.source_boundary,
      source_observation_profile_id:
        arrival.source_observation_profile_id,
      perception_requirement: arrival.perception_requirement,
      signal_descriptor: structuredClone(arrival.signal_descriptors[0]),
      source_event_ref: temporalEventRef,
      source_perception_ref: perceptionRef,
      causal_parent_refs: [],
      expected_signal_ref: ref(
        'npc_decision_signal',
        `decision-signal:${temporalEventRef.entity_kind}:${
          temporalEventRef.entity_id}:${ratshaId}:${
          arrival.signal_descriptors[0].category}`
      ),
      perceived_actor_refs: participants.map((actorId) =>
        ref('actor', actorId))
    },
    objective_invalidation: {
      mapping_id: objective.mapping_id,
      source_activity_id: objective.source_activity_id,
      source_boundary: objective.source_boundary,
      applicability: objective.applicability,
      perception_requirement: objective.perception_requirement,
      signal_descriptor: structuredClone(objective.signal_descriptors[0]),
      source_event_ref: temporalEventRef,
      source_perception_ref: null,
      causal_parent_refs: [],
      expected_signal_ref: ref(
        'npc_decision_signal',
        `decision-signal:${temporalEventRef.entity_kind}:${
          temporalEventRef.entity_id}:${ratshaId}:${
          objective.signal_descriptors[0].category}`
      )
    }
  };
}

function requireM2ArrivalMapping(mapping, {
  mappingId,
  category,
  perceptionRequirement
}) {
  if (mapping?.mapping_id !== mappingId
      || mapping.phase !== 'phase_4'
      || mapping.target_npc_ref !== 'ratsha_storehouse_helper'
      || mapping.perception_requirement !== perceptionRequirement
      || !Array.isArray(mapping.signal_descriptors)
      || mapping.signal_descriptors.length !== 1
      || mapping.signal_descriptors[0]?.category !== category
      || mapping.signal_descriptors[0]?.significance !== 'material') {
    fail('TRACE_M2_PHASE_4_ARRIVAL_SIGNAL_MAPPING_INVALID');
  }
  return mapping;
}

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

function fail(code) {
  const error = new Error('The approved Phase 4 effect is incomplete.');
  error.code = code;
  throw error;
}
