import { canonicalDigest } from '@rus/materialization';
import { buildNpcDecisionSignal } from '@rus/npc-runtime';
import {
  appendPendingNpcDecisionSignalRecords,
  projectSemanticConversationSnapshot
} from './lower-dvina-trace-conversation-state.js';
import {
  appendPerceptions,
  appendSemanticSpeakerInteraction,
  mergeKnowledge,
  npcRef,
  ref,
  requireSignalMapping,
  sameRef,
  sameTimeBatchKey,
  semanticFail,
  signalRecord
} from './lower-dvina-trace-phase-4-state-shared.js';

export function projectPhase4ArrivalSignals({
  next, state, movement, turnNumber, contracts
}) {
  const arrival = requireSignalMapping(
    contracts.conversationSignalMappings.arrival,
    {
      category: 'others',
      perceptionRequirement: 'perception_required',
      targetNpcRef: 'ratsha_storehouse_helper'
    }
  );
  const objective = requireSignalMapping(
    contracts.conversationSignalMappings.objective,
    {
      category: 'objective',
      perceptionRequirement: 'perception_not_required',
      targetNpcRef: 'ratsha_storehouse_helper'
    }
  );
  const payload = movement.m2_arrival;
  const group = payload?.perceived_group;
  const invalidation = payload?.objective_invalidation;
  if (payload?.schema !== 'rus.lower_dvina_trace_phase_4_m2_arrival.v1'
      || !sameRef(payload.target_npc_ref, npcRef(
        contracts.actors.ratsha_storehouse_helper.instance_id
      ))
      || JSON.stringify(payload.occurred_at) !== JSON.stringify(next.clock)
      || typeof payload.same_time_batch_key !== 'string'
      || !payload.same_time_batch_key.startsWith('conversation-batch:')
      || arrival.source_activity_id !== movement.activity_ref
      || objective.source_activity_id !== movement.activity_ref
      || group?.mapping_id !== arrival.mapping_id
      || group.source_activity_id !== arrival.source_activity_id
      || group.source_boundary !== arrival.source_boundary
      || group.source_observation_profile_id
        !== arrival.source_observation_profile_id
      || JSON.stringify(group.signal_descriptor)
        !== JSON.stringify(arrival.signal_descriptors[0])
      || !sameRef(group.source_event_ref, group.source_perception_ref)
      || group.source_event_ref?.entity_kind !== 'perception_result'
      || group.causal_parent_refs?.length !== 1
      || !sameRef(group.causal_parent_refs[0], payload.temporal_event_ref)
      || invalidation?.mapping_id !== objective.mapping_id
      || invalidation.source_activity_id !== objective.source_activity_id
      || invalidation.source_boundary !== objective.source_boundary
      || invalidation.applicability !== objective.applicability
      || JSON.stringify(invalidation.signal_descriptor)
        !== JSON.stringify(objective.signal_descriptors[0])
      || !sameRef(invalidation.source_event_ref, payload.temporal_event_ref)
      || invalidation.source_perception_ref !== null
      || invalidation.causal_parent_refs?.length !== 0) {
    semanticFail('TRACE_M2_PHASE_4_ARRIVAL_SIGNAL_MAPPING_INVALID');
  }
  const ratshaRef = payload.target_npc_ref;
  const perceptionId = group.source_perception_ref.entity_id;
  const expectedActorRefs = movement.participants.map((actorId) =>
    ref('actor', actorId));
  if (JSON.stringify(group.perceived_actor_refs)
      !== JSON.stringify(expectedActorRefs)) {
    semanticFail('TRACE_M2_PHASE_4_ARRIVAL_PERCEPTION_INVALID');
  }
  const perception = {
    perception_id: perceptionId,
    event_ref: structuredClone(payload.temporal_event_ref),
    observer_ref: ratshaRef,
    subject_ref: ref('party', state.party_id),
    source_event_ref: structuredClone(group.source_event_ref),
    observation_ref: group.source_observation_profile_id,
    result_kind: 'recognized',
    occurred_at: structuredClone(payload.occurred_at),
    perceived_actor_refs: structuredClone(group.perceived_actor_refs),
    signal_ref: structuredClone(group.expected_signal_ref)
  };
  next.perceptions = appendPerceptions(next.perceptions, [perception]);
  const records = [
    signalRecord({
      clock: payload.occurred_at,
      descriptor: group.signal_descriptor,
      sourceEventRef: group.source_event_ref,
      subjectRef: ratshaRef,
      perceptionRef: group.source_perception_ref,
      causalParentRefs: group.causal_parent_refs,
      batchKey: payload.same_time_batch_key,
      expectedSignalRef: group.expected_signal_ref
    }),
    signalRecord({
      clock: payload.occurred_at,
      descriptor: invalidation.signal_descriptor,
      sourceEventRef: invalidation.source_event_ref,
      subjectRef: ratshaRef,
      perceptionRef: null,
      causalParentRefs: invalidation.causal_parent_refs,
      batchKey: payload.same_time_batch_key,
      expectedSignalRef: invalidation.expected_signal_ref
    })
  ];
  const projected = appendPendingNpcDecisionSignalRecords({
    state: next,
    records
  });
  next.npc_decision_signals = projected.npc_decision_signals;
  return next;
}
