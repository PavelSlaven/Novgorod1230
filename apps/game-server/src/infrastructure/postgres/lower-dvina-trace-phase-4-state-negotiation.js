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
import { appendSurrenderDecisionSignals } from './lower-dvina-trace-phase-4-state-surrender.js';

export function projectPhase4SemanticNegotiation({
  next, state, negotiation, turnNumber, changeSetId, contracts
}) {
  const semantic = negotiation.semantic_exchange;
  const responseKind = semantic.response_kind;
  const validKinds = new Set([
    'surrender', 'lie', 'bargain', 'speech', 'silence',
    'leave_conversation', 'combat_handoff'
  ]);
  const hasDecision = semantic.decision_request !== null;
  const npcRef = semantic.decision_request?.npc_ref ?? npcRefForContracts(contracts);
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const speechResponse = ['surrender', 'lie', 'bargain', 'speech']
    .includes(responseKind);
  const expectedContributionKind = speechResponse ? 'speech' : responseKind;
  if ((hasDecision && !validKinds.has(responseKind))
      || (!hasDecision && responseKind !== null)
      || npcRef?.entity_kind !== 'npc'
      || npcRef.entity_id
        !== contracts.actors?.ratsha_storehouse_helper?.instance_id
      || (hasDecision && semantic.decision_plan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && semantic.decision_plan !== null)
      || !Array.isArray(negotiation.objective_fact_outputs)
      || negotiation.objective_fact_outputs.length !== 0
      || npcStatements.length !== (speechResponse ? 1 : 0)) {
    semanticFail('TRACE_M2_PHASE_4_SEMANTIC_SHAPE_INVALID');
  }

  const commitmentActive = semantic.commitment?.status === 'active';
  const offerCommitted = negotiation.offer_stage !== null;
  if ((responseKind === 'surrender') !== commitmentActive
      || (responseKind === 'surrender'
        && (!semantic.surrender
          || semantic.knife_transition_eligibility?.eligible !== true))
      || (responseKind !== 'surrender'
        && (semantic.commitment !== null
          || semantic.surrender !== null
          || semantic.knife_transition_eligibility !== null))) {
    semanticFail('TRACE_M2_PHASE_4_COMMITMENT_INVALID');
  }
  const prior = next.promise_instances?.[0];
  if (!prior) semanticFail('TRACE_PHASE_4_PROMISE_MISSING');
  const promiseState = commitmentActive
    ? 'active'
    : offerCommitted ? 'offered' : prior.current_state;
  const transitionCount = (prior.current_state === 'not_offered' ? 1 : 0)
    + (promiseState === 'active' ? 1 : 0);
  next.promise_instances = [{
    ...prior,
    current_state: promiseState,
    current_state_fact: promiseState === 'active'
      ? 'promise_current_active'
      : 'promise_current_offered',
    state_version: Number(prior.state_version) + transitionCount,
    last_change_set_id: transitionCount > 0
      ? changeSetId
      : prior.last_change_set_id
  }];

  if (responseKind === 'surrender') {
    applySemanticSurrender({
      next,
      state,
      semantic,
      contracts,
      turnNumber
    });
  } else if (['lie', 'bargain', 'speech'].includes(responseKind)) {
    appendSemanticSpeakerInteraction({
      next,
      state,
      semantic,
      responseKind,
      statement: npcStatements[0],
      turnNumber,
      activityRef: negotiation.activity_ref
    });
  }

  if (responseKind === 'combat_handoff') {
    if (!semantic.combat_handoff
        || semantic.decision_plan?.contribution_kind !== 'combat_handoff') {
      semanticFail('TRACE_M2_PHASE_4_COMBAT_HANDOFF_INVALID');
    }
    next.player_response_boundary =
      structuredClone(semantic.combat_handoff);
  } else {
    if (semantic.combat_handoff !== null) {
      semanticFail('TRACE_M2_PHASE_4_COMBAT_HANDOFF_INVALID');
    }
    next.player_response_boundary = null;
  }
  return next;
}

function npcRefForContracts(contracts) {
  return {
    entity_kind: 'npc',
    entity_id: contracts.actors?.ratsha_storehouse_helper?.instance_id
  };
}

function applySemanticSurrender({
  next, state, semantic, contracts, turnNumber
}) {
  const knifeWrites = contracts?.knifeTransition?.writes;
  if (!knifeWrites?.physical_position || !knifeWrites?.accessibility) {
    semanticFail('TRACE_PHASE_4_KNIFE_TRANSITION_WRITES_MISSING');
  }
  next.ratsha_surrendered = true;
  next.npcs = next.npcs.map((npc) =>
    npc.participant_slot_ref !== 'ratsha_storehouse_helper'
      ? npc
      : {
          ...npc,
          machine_state: {
            ...npc.machine_state,
            surrender_state: 'surrendered_without_further_harm'
          },
          semantic_state: {
            ...npc.semantic_state,
            participant_slot_ref: npc.participant_slot_ref,
            surrender_fact:
              'ratsha_surrender_without_further_harm_committed'
          }
        });
  next.knowledge = mergeKnowledge(next.knowledge, [{
    fact_id: 'ratsha_surrender_without_further_harm_committed',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [semantic.decision_request.request_id]
  }, {
    fact_id: 'promise_activation_basis_committed',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [semantic.decision_request.request_id]
  }]);
  next.items = next.items.map((item) =>
    item.template_id !== 'trace_ld_v1_item_ratsha_knife'
      ? item
      : ({
          ...item,
          placement: {
            ...item.placement,
            holder_npc_id: contracts.actors.participating_fisher.instance_id,
            holder_character_id: null,
            physical_position: knifeWrites.physical_position
          },
          ownership: {
            ...item.ownership,
            controller_npc_id:
              contracts.actors.participating_fisher.instance_id,
            controller_character_id: null
          },
          state: {
            ...item.state,
            property_state: {
              ...item.state.property_state,
              holder_ref:
                contracts.actors.participating_fisher.instance_id,
              controller_ref:
                contracts.actors.participating_fisher.instance_id,
              accessibility: knifeWrites.accessibility
            }
          }
        }));
  appendSurrenderDecisionSignals({
    next,
    state,
    semantic,
    contracts,
    turnNumber
  });
}
