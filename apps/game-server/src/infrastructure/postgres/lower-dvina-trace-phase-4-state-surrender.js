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

export function appendSurrenderDecisionSignals({
  next, state, semantic, contracts, turnNumber
}) {
  const selfMapping = requireSignalMapping(
    contracts.conversationSignalMappings?.knifeSelf,
    {
      category: 'self',
      perceptionRequirement: 'perception_not_required',
      targetNpcRef: 'ratsha_storehouse_helper'
    }
  );
  const observerMapping = requireSignalMapping(
    contracts.conversationSignalMappings?.knifeObservers,
    {
      category: 'others',
      perceptionRequirement: 'perception_required',
      targetNpcRefs: [
        'eremey_fisher',
        'trace_ld_v1_audience_slot_participating_fisher'
      ]
    }
  );
  if (selfMapping.source_property_transition_id
        !== contracts.knifeTransition.transition_profile_id
      || observerMapping.source_property_transition_id
        !== contracts.knifeTransition.transition_profile_id
      || selfMapping.source_fact_id !== semantic.surrender.fact_id
      || observerMapping.source_fact_id !== semantic.surrender.fact_id
      || observerMapping.applicability
        !== 'approved_observer_policy_only') {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_SIGNAL_MAPPING_INVALID');
  }
  const ratshaRef = npcRef(
    contracts.actors.ratsha_storehouse_helper.instance_id
  );
  const sourceEventRef = ref(
    'item_property_transition',
    contracts.knifeTransition.transition_profile_id
  );
  const causalParentRefs = [ref(
    'committed_fact',
    semantic.surrender.fact_id
  )];
  const npcStatement = semantic.statements.find(({ speaker_ref: speaker }) =>
    sameRef(speaker, ratshaRef));
  const npcAudience = semantic.audiences.find(({ statement_ref: statementRef }) =>
    statementRef.entity_id === npcStatement?.statement_id);
  if (!npcAudience) {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_OBSERVER_PERCEPTION_INVALID');
  }
  const actualListenerIds = new Set(
    npcAudience.actual_listener_refs
      .filter(({ entity_kind: kind }) => kind === 'npc')
      .map(({ entity_id: id }) => id)
  );
  const approvedObservers = [
    contracts.actors.eremey_fisher,
    contracts.actors.participating_fisher
  ].filter((actor) => actualListenerIds.has(actor.instance_id));
  if (approvedObservers.length !== 2) {
    semanticFail('TRACE_M2_PHASE_4_KNIFE_OBSERVER_PERCEPTION_INVALID');
  }
  const perceptions = approvedObservers.map((actor) => ({
    perception_id:
      `perception:${state.party_id}:trace-phase4:${turnNumber}:knife-loss:${actor.instance_id}`,
    observer_ref: npcRef(actor.instance_id),
    subject_ref: ratshaRef,
    source_event_ref: sourceEventRef,
    observation_ref: observerMapping.mapping_id,
    result_kind: 'recognized',
    occurred_at: structuredClone(next.clock),
    causal_parent_refs: causalParentRefs
  }));
  next.perceptions = appendPerceptions(next.perceptions, perceptions);
  const records = [signalRecord({
    clock: next.clock,
    descriptor: selfMapping.signal_descriptors[0],
    sourceEventRef,
    subjectRef: ratshaRef,
    perceptionRef: null,
    causalParentRefs,
    partyId: state.party_id
  }), ...perceptions.map((perception) => signalRecord({
    clock: next.clock,
    descriptor: observerMapping.signal_descriptors[0],
    sourceEventRef,
    subjectRef: perception.observer_ref,
    perceptionRef: ref('perception_result', perception.perception_id),
    causalParentRefs,
    partyId: state.party_id
  }))];
  const projected = appendPendingNpcDecisionSignalRecords({
    state: next,
    records
  });
  next.npc_decision_signals = projected.npc_decision_signals;
}
