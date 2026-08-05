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
import { applyConversationTemporalNpcWrites } from
  './lower-dvina-trace-conversation-temporal.js';

export function projectPhase4SemanticNegotiation({
  next, state, negotiation, turnNumber, changeSetId, contracts
}) {
  const semantic = negotiation.semantic_exchange;
  applyConversationTemporalNpcWrites(next, semantic);
  const responseKind = semantic.response_kind;
  const validKinds = new Set([
    'surrender', 'lie', 'bargain', 'speech', 'silence',
    'leave_conversation', 'combat_handoff', null
  ]);
  const hasDecision = semantic.decision_request !== null;
  const resumedPlan = semantic.resumed_npc_execution?.plan ?? null;
  const npcPlan = semantic.decision_plan ?? resumedPlan;
  const resumed = resumedPlan !== null;
  const npcRef = semantic.decision_request?.npc_ref
    ?? resumedPlan?.speaker_ref ?? npcRefForContracts(contracts);
  const npcApplied = (hasDecision || resumed)
    && semantic.exchange.contributions.some(({ speaker_ref: speaker }) =>
      sameRef(speaker, npcRef));
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const speechResponse = ['surrender', 'lie', 'bargain', 'speech']
    .includes(responseKind);
  const npcSpeechContribution = (hasDecision || resumed)
    && npcPlan?.contribution_kind === 'speech';
  const expectedContributionKind = npcApplied
    ? (speechResponse ? 'speech' : responseKind)
    : npcPlan?.contribution_kind;
  if (((hasDecision || resumed) && !validKinds.has(responseKind))
      || ((hasDecision || resumed) && !npcApplied && responseKind !== null)
      || (!hasDecision && !resumed && responseKind !== null)
      || npcRef?.entity_kind !== 'npc'
      || npcRef.entity_id
        !== contracts.actors?.ratsha_storehouse_helper?.instance_id
      || ((hasDecision || resumed) && npcPlan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && !resumed && semantic.decision_plan !== null)
      || (resumed && semantic.decision_plan !== null)
      || !Array.isArray(negotiation.objective_fact_outputs)
      || negotiation.objective_fact_outputs.length !== 0
      || npcStatements.length !== (npcApplied && npcSpeechContribution ? 1 : 0)) {
    semanticFail('TRACE_M2_PHASE_4_SEMANTIC_SHAPE_INVALID');
  }

  const commitmentActive = semantic.commitment?.status === 'active';
  const offerCommitted = negotiation.offer_stage !== null
    && semantic.exchange.applied_contribution_count >= 1;
  const surrenderResponse = responseKind === 'surrender';
  if ((surrenderResponse && semantic.commitment === null)
      || (!surrenderResponse && semantic.commitment !== null)
      || (commitmentActive
        && (!surrenderResponse
          || !semantic.surrender
          || semantic.knife_transition_eligibility?.eligible !== true))
      || (surrenderResponse && !commitmentActive
        && (semantic.commitment?.status !== 'offered'
          || semantic.surrender !== null
          || semantic.knife_transition_eligibility !== null))
      || (responseKind !== 'surrender'
        && (semantic.surrender !== null
          || semantic.knife_transition_eligibility !== null))) {
    semanticFail('TRACE_M2_PHASE_4_COMMITMENT_INVALID');
  }
  const prior = next.promise_instances?.[0];
  if (!prior) semanticFail('TRACE_PHASE_4_PROMISE_MISSING');
  const promiseState = commitmentActive
    ? 'active'
    : offerCommitted ? 'offered' : prior.current_state;
  const transitionCount = promiseState === prior.current_state
    ? 0
    : prior.current_state === 'not_offered' && promiseState === 'active'
      ? 2
      : 1;
  next.promise_instances = [{
    ...prior,
    current_state: promiseState,
    current_state_fact: promiseState === 'active'
      ? 'promise_current_active'
      : promiseState === 'offered'
        ? 'promise_current_offered'
        : prior.current_state_fact,
    state_version: Number(prior.state_version) + transitionCount,
    ...(transitionCount > 0 ? { last_change_set_id: changeSetId } : {})
  }];

  if (commitmentActive) {
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
        || npcPlan?.contribution_kind !== 'combat_handoff') {
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
  const decisionRequestId = semantic.decision_request?.request_id
    ?? semantic.resumed_npc_execution?.decision_trace_ref?.entity_id;
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
    evidence_refs: [decisionRequestId]
  }, {
    fact_id: 'promise_activation_basis_committed',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [decisionRequestId]
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
