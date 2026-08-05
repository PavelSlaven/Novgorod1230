import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { ref, same, semanticFail } from './lower-dvina-trace-phase-4-semantic-write-shared.js';

export function appendM2SurrenderObserverPerceptions({
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
}) {
  const semantic =
    factual.consequence.negotiation?.semantic_exchange;
  if (semantic?.commitment?.status !== 'active') return;
  const decisionRequestId = semantic.decision_request?.request_id
    ?? semantic.resumed_npc_execution?.decision_trace_ref?.entity_id;
  if (contracts.conversationBindings == null) {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_BINDING_MISSING');
  }
  const mapping = contracts.conversationSignalMappings?.knifeObservers;
  const transitionId = contracts.knifeTransition?.transition_profile_id;
  const ratshaId =
    contracts.actors.ratsha_storehouse_helper.instance_id;
  if (mapping?.mapping_id
        !== 'trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1'
      || mapping.perception_requirement !== 'perception_required'
      || mapping.applicability !== 'approved_observer_policy_only'
      || mapping.source_property_transition_id !== transitionId
      || mapping.source_fact_id !== semantic.surrender?.fact_id
      || !same(mapping.signal_descriptors,
        [{ category: 'others', significance: 'material' }])
      || !same(mapping.target_npc_refs, [
        'eremey_fisher',
        'trace_ld_v1_audience_slot_participating_fisher'
      ])) {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_SIGNAL_MAPPING_INVALID');
  }
  const ratshaRef = ref('npc', ratshaId);
  const npcStatement = semantic.statements?.find((statement) =>
    same(statement.speaker_ref, ratshaRef));
  const audience = semantic.audiences?.find((projection) =>
    projection.statement_ref?.entity_id === npcStatement?.statement_id);
  const actualListenerIds = new Set(
    audience?.actual_listener_refs
      ?.filter(({ entity_kind: kind }) => kind === 'npc')
      .map(({ entity_id: id }) => id)
      ?? []
  );
  const observers = [
    contracts.actors.eremey_fisher,
    contracts.actors.participating_fisher
  ].filter((actor) => actualListenerIds.has(actor.instance_id));
  if (observers.length !== 2) {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_OBSERVER_PERCEPTION_INVALID');
  }
  const timestamp = next.clock;
  const sameTimeBatchKey = `conversation-batch:${canonicalDigest({
    schema: 'rus.lower_dvina_trace_conversation_batch_identity.v1',
    party_id: partyId,
    exact_game_timestamp: timestamp
  }).slice(0, 32)}`;
  const eventId =
    `event:${partyId}:trace-phase4:${turnNumber}:knife-loss`;
  const temporalEventRef = ref('temporal_event', eventId);
  const sourceEventRef = ref(
    'item_property_transition',
    transitionId
  );
  const causalParentRefs = [ref(
    'committed_fact',
    semantic.surrender.fact_id
  )];
  const eventInput = {
    schema: 'rus.lower_dvina_trace_phase_4_knife_loss_event.v1',
    occurred_at: structuredClone(timestamp),
    source_event_ref: sourceEventRef,
    transition_profile_ref: ref('property_transition_profile', transitionId),
    subject_ref: ratshaRef,
    causal_parent_refs: causalParentRefs,
    actual_observer_refs:
      observers.map(({ instance_id: id }) => ref('npc', id)),
    decision_request_ref: ref(
      'npc_conversation_response_request',
      decisionRequestId
    )
  };
  inserts.push(row('party_temporal_events', eventId, {
    event_id: eventId,
    party_id: partyId,
    event_kind: 'item_property_transition_observed',
    status: 'resolved',
    scheduled_at_whole_minutes: timestamp.whole_minutes,
    scheduled_at_subminute_numerator: timestamp.subminute_numerator,
    scheduled_at_subminute_denominator: timestamp.subminute_denominator,
    rule_ref: sourceEventRef,
    policy_ref: ref('npc_decision_signal_mapping', mapping.mapping_id),
    preconditions_digest: canonicalDigest(eventInput),
    idempotency_key:
      `${factual.player_input.idempotency_key}:knife-loss-event`,
    change_set_id: changeSetId,
    terminal_change_set_id: changeSetId,
    state_version: 2
  }));
  for (const observer of observers) {
    const observerId = observer.instance_id;
    const observerRef = ref('npc', observerId);
    const perceptionId =
      `perception:${partyId}:trace-phase4:${turnNumber}:knife-loss:${observerId}`;
    const resolved = next.perceptions?.find((perception) =>
      perception.perception_id === perceptionId);
    if (!resolved
        || !same(resolved.observer_ref, observerRef)
        || !same(resolved.subject_ref, ratshaRef)
        || !same(resolved.source_event_ref, sourceEventRef)
        || resolved.observation_ref !== mapping.mapping_id
        || resolved.result_kind !== 'recognized'
        || !same(resolved.occurred_at, timestamp)
        || !same(resolved.causal_parent_refs, causalParentRefs)) {
      semanticFail('TRACE_M2_PHASE_4_KNIFE_OBSERVER_PERCEPTION_INVALID');
    }
    const expectedSignalRef = ref(
      'npc_decision_signal',
      `decision-signal:${sourceEventRef.entity_kind}:${
        sourceEventRef.entity_id}:${observerId}:others`
    );
    const perceptionRef = ref('perception_result', perceptionId);
    const signalRecord = next.npc_decision_signals?.find((record) =>
      record?.signal?.signal_id === expectedSignalRef.entity_id);
    const signal = signalRecord?.signal;
    if (signalRecord?.same_time_batch_key !== sameTimeBatchKey
        || signal?.schema !== 'npc_decision_signal_v1'
        || signal.idempotency_key !== expectedSignalRef.entity_id
        || !same(signal.occurred_at, timestamp)
        || signal.category !== 'others'
        || signal.significance !== 'material'
        || !same(signal.source_event_ref, sourceEventRef)
        || !same(signal.subject_ref, observerRef)
        || signal.perception_required !== true
        || !same(signal.source_perception_ref, perceptionRef)
        || !same(signal.causal_parent_refs, causalParentRefs)) {
      semanticFail('TRACE_M2_PHASE_4_KNIFE_OBSERVER_SIGNAL_INVALID');
    }
    const input = {
      ...eventInput,
      temporal_event_ref: temporalEventRef,
      observer_ref: observerRef,
      perception_id: perceptionId,
      signal_ref: expectedSignalRef
    };
    const perceptionPayload = {
      schema: 'rus.lower_dvina_trace_phase_4_knife_loss_perception.v1',
      perception_id: perceptionId,
      event_ref: temporalEventRef,
      source_event_ref: sourceEventRef,
      causal_parent_refs: causalParentRefs,
      observer_ref: observerRef,
      subject_ref: ratshaRef,
      observation_ref: mapping.mapping_id,
      result_kind: 'recognized',
      occurred_at: structuredClone(timestamp),
      signal_ref: expectedSignalRef
    };
    appends.push(row('party_perception_records', perceptionId, {
      perception_id: perceptionId,
      party_id: partyId,
      event_id: eventId,
      perceiver_kind: 'npc',
      perceiver_id: observerId,
      result_kind: 'recognized',
      perceived_at_whole_minutes: timestamp.whole_minutes,
      perceived_at_subminute_numerator: timestamp.subminute_numerator,
      perceived_at_subminute_denominator: timestamp.subminute_denominator,
      recognition_policy_ref: ref(
        'npc_decision_signal_mapping',
        mapping.mapping_id
      ),
      visibility_policy_ref: ref(
        'observer_applicability_policy',
        mapping.applicability
      ),
      canonical_digest: canonicalDigest(perceptionPayload),
      signal_refs: [expectedSignalRef],
      knowledge_update_refs: [],
      change_set_id: changeSetId,
      idempotency_record_id: `${idemId}:knife-loss:${observerId}`
    }));
    appends.push(row(
      'party_perception_witnesses',
      `${perceptionId}:npc:${observerId}`,
      {
        perception_id: perceptionId,
        witness_kind: 'npc',
        witness_id: observerId
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
        decision_request_ref: eventInput.decision_request_ref
      }),
      policy_versions_digest: canonicalDigest({
        signal_mapping: mapping,
        property_transition: contracts.knifeTransition
      }),
      idempotency_key:
        `${factual.player_input.idempotency_key}:knife-loss:${observerId}`,
      change_set_id: changeSetId
    };
    appends.push(row('party_perception_replay_evidence', perceptionId, {
      ...replay,
      party_id: partyId,
      canonical_digest: canonicalDigest(replay)
    }));
  }
}
