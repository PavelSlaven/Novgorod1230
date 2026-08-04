import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { ref, same, semanticFail } from './lower-dvina-trace-phase-4-semantic-write-shared.js';

export function appendM2ArrivalPerception({
  appends,
  state,
  next,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  idemId,
  contracts
}) {
  const movement = factual.consequence.movement;
  const arrival = movement.m2_arrival;
  if (contracts.conversationBindings == null) {
    if (arrival !== undefined) {
      semanticFail('TRACE_M2_PHASE_4_ARRIVAL_UNEXPECTED');
    }
    return;
  }
  const eventId = `event:${partyId}:trace-phase4:${turnNumber}:arrival`;
  const ratshaId =
    contracts.actors.ratsha_storehouse_helper.instance_id;
  const perceptionId =
    `perception:${partyId}:trace-phase4:${turnNumber}:ratsha-group`;
  const timestamp = next.clock;
  const temporalEventRef = ref('temporal_event', eventId);
  const perceptionRef = ref('perception_result', perceptionId);
  const expectedSignalRef = ref(
    'npc_decision_signal',
    `decision-signal:temporal_event:${eventId}:${ratshaId}:others`
  );
  const objectiveSignalRef = ref(
    'npc_decision_signal',
    `decision-signal:temporal_event:${eventId}:${ratshaId}:objective`
  );
  const expectedBatchKey = `conversation-batch:${canonicalDigest({
    schema: 'rus.lower_dvina_trace_conversation_batch_identity.v1',
    party_id: partyId,
    exact_game_timestamp: timestamp
  }).slice(0, 32)}`;
  const groupMapping = contracts.conversationSignalMappings?.arrival;
  const objectiveMapping = contracts.conversationSignalMappings?.objective;
  if (arrival?.schema
        !== 'rus.lower_dvina_trace_phase_4_m2_arrival.v1'
      || arrival.same_time_batch_key !== expectedBatchKey
      || !same(arrival.occurred_at, timestamp)
      || !same(arrival.temporal_event_ref, temporalEventRef)
      || !same(arrival.target_npc_ref, ref('npc', ratshaId))
      || arrival.perceived_group?.mapping_id !== groupMapping?.mapping_id
      || arrival.perceived_group?.source_activity_id
        !== groupMapping?.source_activity_id
      || arrival.perceived_group?.source_boundary
        !== 'terminal_position_committed'
      || arrival.perceived_group?.source_observation_profile_id
        !== groupMapping?.source_observation_profile_id
      || arrival.perceived_group?.perception_requirement
        !== 'perception_required'
      || !same(
        arrival.perceived_group?.signal_descriptor,
        groupMapping?.signal_descriptors?.[0]
      )
      || !same(arrival.perceived_group?.source_event_ref, temporalEventRef)
      || !same(arrival.perceived_group?.source_perception_ref, perceptionRef)
      || !same(arrival.perceived_group?.causal_parent_refs, [])
      || !same(arrival.perceived_group?.expected_signal_ref,
        expectedSignalRef)
      || !same(arrival.perceived_group?.perceived_actor_refs,
        movement.participants.map((id) => ref('actor', id)))
      || arrival.objective_invalidation?.mapping_id
        !== objectiveMapping?.mapping_id
      || arrival.objective_invalidation?.source_activity_id
        !== objectiveMapping?.source_activity_id
      || arrival.objective_invalidation?.source_boundary
        !== 'terminal_position_committed'
      || arrival.objective_invalidation?.applicability
        !== 'current_conversation_objective_invalidated'
      || arrival.objective_invalidation?.perception_requirement
        !== 'perception_not_required'
      || !same(
        arrival.objective_invalidation?.signal_descriptor,
        objectiveMapping?.signal_descriptors?.[0]
      )
      || !same(arrival.objective_invalidation?.source_event_ref,
        temporalEventRef)
      || arrival.objective_invalidation?.source_perception_ref !== null
      || !same(arrival.objective_invalidation?.causal_parent_refs, [])
      || !same(arrival.objective_invalidation?.expected_signal_ref,
        objectiveSignalRef)
      || groupMapping?.perception_requirement !== 'perception_required'
      || objectiveMapping?.perception_requirement
        !== 'perception_not_required') {
    semanticFail('TRACE_M2_PHASE_4_ARRIVAL_SOURCE_INVALID');
  }
  const resolved = next.perceptions?.find((perception) =>
    perception.perception_id === perceptionId);
  if (!resolved
      || !same(resolved.event_ref, temporalEventRef)
      || !same(resolved.observer_ref, ref('npc', ratshaId))
      || !same(resolved.subject_ref, ref('party', partyId))
      || !same(resolved.source_event_ref, temporalEventRef)
      || resolved.observation_ref
        !== groupMapping.source_observation_profile_id
      || resolved.result_kind !== 'recognized'
      || !same(resolved.occurred_at, timestamp)
      || !same(resolved.perceived_actor_refs,
        arrival.perceived_group.perceived_actor_refs)
      || !same(resolved.signal_ref, expectedSignalRef)) {
    semanticFail('TRACE_M2_PHASE_4_ARRIVAL_PERCEPTION_INVALID');
  }
  const input = {
    schema: arrival.schema,
    occurred_at: structuredClone(timestamp),
    same_time_batch_key: arrival.same_time_batch_key,
    temporal_event_ref: temporalEventRef,
    route_execution_ref: ref(
      'route_execution',
      movement.traversal.ids.execution_id
    ),
    observer_ref: ref('npc', ratshaId),
    subject_ref: ref('party', partyId),
    perceived_actor_refs:
      structuredClone(arrival.perceived_group.perceived_actor_refs),
    mapping_id: groupMapping.mapping_id,
    signal_source: structuredClone(arrival.perceived_group)
  };
  const perceptionPayload = {
    perception_id: perceptionId,
    event_ref: temporalEventRef,
    observer_ref: input.observer_ref,
    subject_ref: input.subject_ref,
    source_event_ref: temporalEventRef,
    observation_ref: groupMapping.source_observation_profile_id,
    result_kind: 'recognized',
    occurred_at: structuredClone(timestamp),
    perceived_actor_refs: input.perceived_actor_refs,
    signal_ref: expectedSignalRef
  };
  appends.push(row('party_perception_records', perceptionId, {
    perception_id: perceptionId,
    party_id: partyId,
    event_id: eventId,
    perceiver_kind: 'npc',
    perceiver_id: ratshaId,
    result_kind: 'recognized',
    perceived_at_whole_minutes: timestamp.whole_minutes,
    perceived_at_subminute_numerator: timestamp.subminute_numerator,
    perceived_at_subminute_denominator: timestamp.subminute_denominator,
    recognition_policy_ref: ref(
      'npc_decision_signal_mapping',
      groupMapping.mapping_id
    ),
    visibility_policy_ref: ref(
      'scene_observation_profile',
      groupMapping.source_observation_profile_id
    ),
    canonical_digest: canonicalDigest(perceptionPayload),
    signal_refs: [expectedSignalRef],
    knowledge_update_refs: [],
    change_set_id: changeSetId,
    idempotency_record_id: `${idemId}:ratsha-group-arrival`
  }));
  appends.push(row(
    'party_perception_witnesses',
    `${perceptionId}:npc:${ratshaId}`,
    {
      perception_id: perceptionId,
      witness_kind: 'npc',
      witness_id: ratshaId
    }
  ));
  const replay = {
    perception_id: perceptionId,
    canonical_input_digest: canonicalDigest(input),
    perception_digest: canonicalDigest(perceptionPayload),
    expected_state_versions_digest: canonicalDigest({
      party_state_version: state.party_state.state_version
    }),
    dependency_pins_digest: canonicalDigest({
      activity_pins: contracts.activityPins,
      traversal_pins: movement.traversal.dependency_pins?.pins
    }),
    policy_versions_digest: canonicalDigest({
      conversation_binding: contracts.conversationBindings,
      signal_mapping: groupMapping
    }),
    idempotency_key:
      `${factual.player_input.idempotency_key}:arrival:ratsha-group`,
    change_set_id: changeSetId
  };
  appends.push(row('party_perception_replay_evidence', perceptionId, {
    ...replay,
    party_id: partyId,
    canonical_digest: canonicalDigest(replay)
  }));
}
