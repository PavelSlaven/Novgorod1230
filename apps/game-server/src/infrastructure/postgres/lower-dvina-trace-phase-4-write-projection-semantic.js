
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import {
  appendApprovedRatshaKnife,
  appendPromiseTransition
} from './lower-dvina-trace-phase-4-property-writes.js';
import {
  phase2ScreenDigest,
  phase2VisibleContextFromPayload
} from './lower-dvina-trace-phase-2-projection.js';
import {
  appendHostileSemantics,
  appendM2SurrenderObserverPerceptions,
  appendSurrenderSemantics
} from './lower-dvina-trace-phase-4-semantic-writes.js';
import {
  appendPhase4Movement
} from './lower-dvina-trace-phase-4-movement-writes.js';
import {
  appendPhase4ActivityExecution
} from './lower-dvina-trace-phase-4-activity-writes.js';
import { appendRouteBodyWrites } from './lower-dvina-trace-route-body-writes.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from './npc-semantic-conversation-writes.js';

import { validPersistedOfferStage } from './lower-dvina-trace-phase-4-write-projection-shared.js';

export function appendSemanticNegotiation({
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
  contracts,
  rootTurnId,
  workingRevision
}) {
  const n = factual.consequence.negotiation;
  const semantic = n?.semantic_exchange;
  if (semantic == null
      || !['not_offered', 'offered'].includes(
        state.promise_instances?.[0]?.current_state
      )
      || (n.offer_committed_before_check
        ? !validPersistedOfferStage({ state, factual, negotiation: n,
            contracts })
        : n.offer_stage !== null)) {
    throw new Error('TRACE_PHASE_4_PROMISE_TRANSITION_INVALID');
  }
  const roots = n.activity_roots ?? [];
  if (roots.length !== 1
      || !Number.isSafeInteger(semantic.exact_elapsed_minutes)
      || semantic.exact_elapsed_minutes < 1
      || roots[0]?.duration_minutes
        !== semantic.exchange?.time_budget?.total_minutes) {
    throw new Error('TRACE_M2_PHASE_4_SEMANTIC_ACTIVITY_ROOT_INVALID');
  }
  const negotiationActivityId =
    `activity:${partyId}:trace-phase4:${turnNumber}:negotiation`;
  appendPhase4ActivityExecution({
    inserts,
    appends,
    partyId,
    state,
    factual,
    next,
    root: roots[0],
    id: negotiationActivityId,
    seriesOrdinal: 0,
    activitySeriesId:
      `series:${partyId}:trace-phase4:${turnNumber}:negotiation`,
    attemptOrdinal: 0,
    turnNumber,
    changeSetId,
    idemId
  });
  if (semantic.exchange.applied_contribution_count === 0) return;
  const checkId = n.check_result
    ? `check:${partyId}:trace-phase4:${turnNumber}` : null;
  const offerAppends = [];
  const activationAppends = [];
  if (n.offer_committed_before_check
      && semantic.exchange.applied_contribution_count >= 1) {
    appendPromiseTransition({
    updates,
    offerAppends,
    activationAppends,
    state,
    next,
    n: {
      ...n,
      npc_decision: {
        trace: {
          request_id: semantic.decision_request?.request_id ?? null
        }
      }
    },
    partyId,
    changeSetId,
    idemId,
    turnNumber,
    activityId: negotiationActivityId,
    checkId,
    contracts
    });
  }
  appends.push(...offerAppends);
  if (n.check_result) appendNegotiationCheckResolution({
    appends,
    partyId,
    factual,
    negotiation: n,
    changeSetId,
    checkId
  });
  const semanticInput = buildNpcSemanticConversationWriteInput({
    state,
    next,
    semanticExchange: semantic
  });
  appendNpcSemanticConversationWrites({
    inserts,
    updates,
    appends,
    partyId,
    changeSetId,
    idempotencyRecordId: idemId,
    rootTurnId,
    workingRevision,
    sessionWrite: semanticInput.sessionWrite,
    semanticExchange: semanticInput.semanticExchange,
    signalRecords: semanticInput.signalRecords,
    actualMessageEvidence: semanticInput.actualMessageEvidence,
    supportingOperationEvidence:
      semanticInput.supportingOperationEvidence,
    partyStateVersion: semanticInput.partyStateVersion,
    sameTimeBatchRef: semanticInput.sameTimeBatchRef,
    contributions: semanticInput.contributions
  });
  appends.push(...activationAppends);
  if (semantic.response_kind === 'surrender') {
    appendSemanticSurrenderStateWrites({
      inserts,
      updates,
      appends,
      state,
      next,
      semantic,
      partyId,
      turnNumber,
      changeSetId,
      idemId
    });
    appendApprovedRatshaKnife({
      updates,
      state,
      next,
      n,
      partyId,
      contracts
    });
    appendM2SurrenderObserverPerceptions({
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
  }
}

function appendNegotiationCheckResolution({
  appends,
  partyId,
  factual,
  negotiation,
  changeSetId,
  checkId
}) {
  appends.push(row('party_check_resolutions', checkId, {
    check_resolution_id: checkId,
    party_id: partyId,
    check_scope_kind: 'immediate_action',
    check_scope_key: {
      request_id: factual.player_input.request_id,
      option_id: factual.mode_resolution.option_id,
      promise_offer_stage: structuredClone(negotiation.offer_stage)
    },
    check_policy_ref: {
      entity_kind: 'check_policy',
      entity_id: negotiation.check_result.check_id,
      authoring_version: '1'
    },
    deterministic_roll_input_digest: canonicalDigest({
      audit: negotiation.check_result.audit,
      request: negotiation.check_request
    }),
    roll_value: negotiation.check_result.roll,
    modifier_snapshot: negotiation.check_result.modifiers,
    target_value: negotiation.check_result.difficulty,
    result_kind: negotiation.check_result.outcome.success
      ? 'success'
      : 'failure',
    consequence_policy_ref: {
      entity_kind: 'consequence_policy',
      entity_id: negotiation.outcome_ref,
      authoring_version: '1'
    },
    result_change_set_id: changeSetId,
    canonical_digest: canonicalDigest(negotiation.check_result)
  }));
}

function appendSemanticSurrenderStateWrites({
  inserts,
  updates,
  appends,
  state,
  next,
  semantic,
  partyId,
  turnNumber,
  changeSetId,
  idemId
}) {
  const ratsha = next.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'ratsha_storehouse_helper'
  );
  const surrenderFact = semantic.surrender?.fact_id;
  if (ratsha?.machine_state?.surrender_state
      !== 'surrendered_without_further_harm'
      || ratsha.semantic_state?.surrender_fact !== surrenderFact) {
    throw new Error('TRACE_M2_PHASE_4_SURRENDER_STATE_INVALID');
  }
  updates.push(row('party_npcs', ratsha.instance_id, {
    party_id: partyId,
    npc_id: ratsha.instance_id,
    machine_state: ratsha.machine_state,
    semantic_state: ratsha.semantic_state
  }));
  appends.push(row(
    'party_npc_runtime_transitions',
    `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
    {
      transition_id:
        `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
      party_id: partyId,
      npc_id: ratsha.instance_id,
      transition_kind: 'surrendered_without_further_harm',
      event_id: null,
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes: next.clock.whole_minutes,
      occurred_at_subminute_numerator: next.clock.subminute_numerator,
      occurred_at_subminute_denominator: next.clock.subminute_denominator,
      trace: {
        decision_request_id: semantic.decision_request.request_id,
        fact_id: surrenderFact
      }
    }
  ));
  for (const factId of [
    surrenderFact,
    'promise_activation_basis_committed'
  ]) {
    if ((state.knowledge ?? []).some(({ fact_id: id }) => id === factId)) {
      continue;
    }
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${factId}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: factId,
        knowledge_state: 'known_from_committed_source',
        evidence: [semantic.decision_request.request_id]
      }));
  }
}
