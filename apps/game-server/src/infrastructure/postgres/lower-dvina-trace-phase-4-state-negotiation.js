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
import { projectCombatDecisionState } from
  './lower-dvina-trace-combat-decision-state.js';
import { projectPhase4Confession } from
  './lower-dvina-trace-phase-4-confession-state.js';

export function projectPhase4SemanticNegotiation({
  next, state, negotiation, turnNumber, changeSetId, contracts,
  rootTurnId, workingRevision
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
  const resumed = resumedPlan !== null;
  const npcRef = semantic.decision_request?.npc_ref
    ?? resumedPlan?.speaker_ref ?? npcRefForContracts(contracts);
  const appliedTargetOutcomes = (semantic.npc_outcomes ?? []).filter(
    ({ npc_ref: outcomeNpcRef, applied }) => applied
      && sameRef(outcomeNpcRef, npcRef));
  const finalOutcome = appliedTargetOutcomes.at(-1) ?? null;
  const finalDecision = semantic.decisions?.find(({ request }) =>
    request.request_id === finalOutcome?.request_id) ?? null;
  const resumedRequestId = semantic.resumed_npc_execution
    ?.decision_trace_ref?.entity_id;
  const npcPlan = finalDecision?.proposal?.plan
    ?? (finalOutcome?.request_id === resumedRequestId ? resumedPlan : null)
    ?? (finalOutcome === null ? resumedPlan ?? semantic.decision_plan : null);
  const npcApplied = appliedTargetOutcomes.length > 0;
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const expectedStatementIds = new Set(appliedTargetOutcomes
    .filter(({ contribution_ref: contributionRef }) =>
      contributionRef?.entity_kind === 'conversation_statement')
    .map(({ contribution_ref: contributionRef }) => contributionRef.entity_id));
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
      || (npcApplied && finalOutcome?.outcome?.kind !== responseKind)
      || ((hasDecision || resumed) && npcPlan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && !resumed && semantic.decision_plan !== null)
      || (resumed && semantic.decision_plan !== null)
      || !Array.isArray(negotiation.objective_fact_outputs)
      || negotiation.objective_fact_outputs.length !== 0
      || npcStatements.length !== expectedStatementIds.size
      || npcStatements.some(({ statement_id: statementId }) =>
        !expectedStatementIds.has(statementId))) {
    semanticFail('TRACE_M2_PHASE_4_SEMANTIC_SHAPE_INVALID');
  }

  const commitmentActive = semantic.commitment?.status === 'active';
  const offerCommitted = negotiation.offer_stage !== null
    && semantic.exchange.applied_contribution_count >= 1;
  const surrenderResponse = responseKind === 'surrender';
  const commitmentValid = semantic.commitment === null
    || ['offered', 'active'].includes(semantic.commitment.status);
  if ((surrenderResponse && (!commitmentValid
        || semantic.surrender === null
        || semantic.knife_transition_eligibility?.eligible !== true))
      || (!surrenderResponse && (semantic.commitment !== null
        || semantic.surrender !== null
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

  if (surrenderResponse) {
    applySemanticSurrender({
      next,
      state,
      semantic,
      contracts,
      turnNumber
    });
    projectPhase4Confession({ state: next, confession: semantic.confession,
      contracts, turnNumber });
  } else if (['lie', 'bargain', 'speech'].includes(responseKind)) {
    const statement = npcStatements.find(({ statement_id: statementId }) =>
      finalOutcome?.contribution_ref?.entity_kind === 'conversation_statement'
        && statementId === finalOutcome.contribution_ref.entity_id);
    appendSemanticSpeakerInteraction({
      next,
      state,
      semantic,
      responseKind,
      statement,
      turnNumber,
      activityRef: negotiation.activity_ref
    });
  }

  const playerCombatHandoffs = semantic.exchange.contributions.filter(
    (contribution) => contribution.contribution_kind === 'combat_handoff'
      && contribution.speaker_ref?.entity_kind === 'player_character'
      && canonicalDigest(contribution.handoff)
        === canonicalDigest(semantic.combat_handoff)
  );
  const npcCombatHandoff = responseKind === 'combat_handoff';
  const playerCombatHandoff = responseKind === null
    && semantic.combat_handoff !== null;
  if (npcCombatHandoff || playerCombatHandoff) {
    if (!semantic.combat_handoff
        || (npcCombatHandoff
          ? npcPlan?.contribution_kind !== 'combat_handoff'
          : playerCombatHandoffs.length !== 1)) {
      semanticFail('TRACE_M2_PHASE_4_COMBAT_HANDOFF_INVALID');
    }
    const combat = negotiation.combat_initialization;
    if (contracts.combatBindings != null) {
      if (combat?.session?.status !== 'paused_for_player'
          || combat.session.player_response_required !== true
          || combat.session.scope_ref?.entity_id !== contracts.ids.shed
          || combat.decision_records?.length !== 1
          || combat.root_turn_id !== rootTurnId
          || !Number.isSafeInteger(workingRevision)
          || workingRevision < 0) {
        semanticFail('TRACE_PHASE_4_COMBAT_INITIALIZATION_INVALID');
      }
      next.combat_sessions = [{
        ...structuredClone(combat.session),
        last_change_set_ref: {
          entity_kind: 'party_change_set',
          entity_id: changeSetId
        }
      }];
      next.player_response_boundary = {
        ...structuredClone(semantic.combat_handoff),
        combat_id: combat.session.combat_id
      };
      next = projectCombatDecisionState({ state: next,
        decisionRecords: combat.decision_records, changeSetId,
        rootTurnId, workingRevision });
    } else {
      next.player_response_boundary =
        structuredClone(semantic.combat_handoff);
    }
  } else {
    if (negotiation.combat_initialization != null) {
      semanticFail('TRACE_PHASE_4_COMBAT_INITIALIZATION_INVALID');
    }
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
  }, ...(semantic.commitment?.status === 'active' ? [{
      fact_id: 'promise_activation_basis_committed',
      knowledge_state: 'known_from_committed_source',
      evidence_refs: [decisionRequestId]
    }] : [])]);
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
