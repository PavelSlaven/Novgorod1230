import assert from 'node:assert/strict';
import { canonicalDigest } from '@rus/materialization';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import {
  resolveTracePhase3Contracts
} from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  resolveTracePhase4Contracts
} from '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import {
  resolveTracePhase3ConversationExchange,
  resolveTracePhase4ConversationExchange
} from '../src/runtime/lower-dvina-trace-m2-conversation.js';
import {
  routeToShedEffect
} from '../src/runtime/lower-dvina-trace-phase-4-effects.js';
import {
  nextPhase4State
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import {
  projectSharedSemanticConsequence
} from '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import {
  nextState as nextPhase3State
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-3-state.js';
import {
  fixture,
  loadScenarioBundle
} from './lower-dvina-trace-phase-2-fixture.js';

export const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
export const digest = (character) => character.repeat(64);
export const revision14Bundle = await loadScenarioBundle(14);

const EREMEY_DISCLOSURE_CUES = new Set([
  'delivery_compelling',
  'delivery_credible',
  'delivery_credible_with_visible_cost'
]);
const RATSHA_RESPONSE_KINDS = new Set([
  'surrender',
  'bargain',
  'lie',
  'speech',
  'silence',
  'leave_conversation',
  'combat_handoff'
]);

export function createM2ConversationModels({
  ratshaResponseKind = 'surrender',
  onNpcCall = () => {}
} = {}) {
  if (!RATSHA_RESPONSE_KINDS.has(ratshaResponseKind)) {
    throw new TypeError(`Unsupported Ratsha response kind: ${ratshaResponseKind}`);
  }
  return {
    playerConversationModel: (request) => playerPlan(request, {
      checkRequired: Boolean(
        request.player_safe_context.required_supporting_operation
        || request.player_safe_context.offer_policy_ref
      ),
      offer: Boolean(request.player_safe_context.offer_policy_ref),
      evidence: request.player_safe_context.required_supporting_operation
        === 'present_item_as_evidence'
    }),
    npcSemanticModel: (request) => {
      const routeOperation = request.decision_scope
        ?.operation_contract?.disclose_known_route;
      if (routeOperation) {
        const responseKind = (request.social_context?.delivery_cues ?? [])
          .some((cue) => EREMEY_DISCLOSURE_CUES.has(cue))
          ? 'route_disclosure'
          : 'withhold';
        onNpcCall(request, responseKind);
        return eremeyPlan(request, responseKind, routeOperation);
      }
      const playerId = request.public_conversation_history.at(-1)
        .speaker_ref.entity_id;
      onNpcCall(request, ratshaResponseKind);
      return ratshaPlan(request, ratshaResponseKind, playerId);
    }
  };
}

export function phase3State() {
  const state = structuredClone(fixture({
    scenarioBundle: revision14Bundle
  }).state);
  const contracts = resolveTracePhase3Contracts({
    state,
    bundle: revision14Bundle
  });
  const camp = state.prepared_scenes.find(
    ({ location_profile_ref: locationRef }) =>
      locationRef === contracts.ids.campLocation
  );
  state.position = {
    ...state.position,
    location_ref: contracts.ids.campLocation,
    g5_node_id: camp.node.instance_id,
    g5_anchor_id: contracts.campAnchor
  };
  return state;
}

export function withAccessibleBlueWool(state, contracts) {
  state.items = [...(state.items ?? []), {
    item_id: 'item:m2:blue-wool',
    template_id: contracts.blueWoolPickup.item_template_ref,
    profile_id: contracts.blueWoolPickup.item_template_ref,
    quantity: 1,
    placement: {
      holder_character_id: state.actor_id,
      physical_position: 'hands'
    },
    state: {
      evidence_ref: contracts.ids.evidence,
      property_state: {
        owner_ref: 'ratsha_storehouse_helper',
        holder_ref: state.actor_id,
        controller_ref: state.actor_id
      },
      pickup_transition: {
        transition_template_ref:
          contracts.blueWoolPickup.transition_template_id,
        source_placement_ref:
          contracts.blueWoolPickup.source_placement_ref
      }
    }
  }];
  state.knowledge = [...(state.knowledge ?? []), {
    fact_id: contracts.ids.evidence,
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [contracts.ids.evidence]
  }];
  return state;
}

export function phase4ArrivalState() {
  const state = phase3State();
  state.route_knowledge = ['trace_ld_v1_route_camp_to_shed'];
  const departureContracts = resolveTracePhase4Contracts({
    state,
    bundle: revision14Bundle
  });
  const inputDigest = digest('c');
  const playerInput = {
    request_id: 'request:m2-route-arrival',
    idempotency_key: 'idempotency:m2-route-arrival',
    raw_text: 'Идти к старой сушильне.'
  };
  const consequence = routeToShedEffect({
    contracts: departureContracts,
    inputDigest,
    state,
    playerInput
  });
  const arrived = nextPhase4State({
    state,
    factual: {
      player_input: playerInput,
      mode_resolution: {
        option_id: departureContracts.ids.routeOption,
        decision_trace: { action_set_digest: 'm2-route-action-set' }
      },
      time_update: {
        clock_after:
          consequence.movement.traversal.clock_update.world_time_after
      },
      consequence
    },
    nextVersion: state.party_state.state_version + 1,
    turnNumber: state.party_state.turn_number + 1,
    inputDigest,
    changeSetId: 'change:m2-route-arrival',
    contracts: departureContracts,
    rootTurnId: 'turn:m2-route-arrival',
    workingRevision: 0
  });
  const contracts = resolveTracePhase4Contracts({
    state: arrived,
    bundle: revision14Bundle
  });
  const offerStage = {
    fact_id: 'trace_ld_v1_offer_no_summary_killing_committed',
    stage_digest: digest('d')
  };
  return {
    state: arrived,
    contracts,
    offerStage,
    checkRequest: {
      check_id: contracts.check.check_id,
      causal_predecessor_stage_digest: offerStage.stage_digest
    }
  };
}

export async function runPhase3({
  state,
  contracts,
  rawText,
  inputDigest,
  responseKind,
  checkResult: resolvedCheck = null,
  playerPlanOptions = {},
  playerDurationClasses = ['domain_owned'],
  npcDurationClasses = ['domain_owned'],
  transformNpcPlan = (plan) => plan,
  resolveTemporalBoundary = null
}) {
  let playerCalls = 0;
  let npcCalls = 0;
  let npcRequest = null;
  const npcRequests = [];
  const result = await resolveTracePhase3ConversationExchange({
    state,
    contracts,
    playerInput: { raw_text: rawText },
    inputDigest,
    checkResult: resolvedCheck,
    playerConversationModel: async (request) => {
      playerCalls += 1;
      const plan = playerPlan(request, {
        checkRequired: resolvedCheck !== null,
        ...playerPlanOptions
      });
      plan.activity.duration_class = durationForCall(
        playerDurationClasses, playerCalls
      );
      return plan;
    },
    npcSemanticModel: async (request) => {
      npcCalls += 1;
      npcRequest = structuredClone(request);
      npcRequests.push(structuredClone(request));
      const plan = transformNpcPlan(eremeyPlan(
        request,
        responseKind,
        request.decision_scope.operation_contract.disclose_known_route ?? {
          route_ref: 'unused-route',
          source_knowledge_scope_ref: 'unused-knowledge-scope'
        }
      ), { request, call_index: npcCalls });
      plan.activity.duration_class = durationForCall(
        npcDurationClasses, npcCalls
      );
      return plan;
    },
    temporalAdvanceOwner: conversationTemporalOwner(
      state, resolveTemporalBoundary
    ),
    revalidateStateVersion: async () => state.party_state.state_version
  });
  return { result, playerCalls, npcCalls, npcRequest, npcRequests };
}

export async function runPhase4({
  state,
  contracts,
  rawText,
  inputDigest,
  responseKind,
  checkResult: resolvedCheck,
  offerStage,
  checkRequest,
  playerPlanOptions = {},
  playerDurationClasses = ['domain_owned'],
  npcDurationClasses = ['domain_owned'],
  transformNpcPlan = (plan) => plan,
  resolveTemporalBoundary = null
}) {
  let playerCalls = 0;
  let npcCalls = 0;
  let npcRequest = null;
  const result = await resolveTracePhase4ConversationExchange({
    state,
    contracts,
    playerInput: { raw_text: rawText },
    inputDigest,
    checkResult: resolvedCheck,
    offerStage,
    checkRequest,
    playerConversationModel: async (request) => {
      playerCalls += 1;
      const plan = playerPlan(request, {
        checkRequired: resolvedCheck !== null,
        offer: offerStage !== null,
        ...playerPlanOptions
      });
      plan.activity.duration_class = durationForCall(
        playerDurationClasses, playerCalls
      );
      return plan;
    },
    npcSemanticModel: async (request) => {
      npcCalls += 1;
      npcRequest = structuredClone(request);
      const plan = transformNpcPlan(
        ratshaPlan(request, responseKind, state.actor_id),
        { request, call_index: npcCalls }
      );
      plan.activity.duration_class = durationForCall(
        npcDurationClasses, npcCalls
      );
      return plan;
    },
    temporalAdvanceOwner: conversationTemporalOwner(
      state, resolveTemporalBoundary
    ),
    revalidateStateVersion: async () => state.party_state.state_version
  });
  return { result, playerCalls, npcCalls, npcRequest };
}

function conversationTemporalOwner(state, resolver) {
  const candidates = state.temporal_boundary_candidates ?? [];
  const unique = new Map(candidates.map((candidate) => [canonicalDigest({
    rule_ref: candidate.rule_ref,
    policy_ref: candidate.policy_ref
  }), candidate]));
  return createTemporalAdvanceOwner({
    source_registrations: [...unique.values()].map((candidate) => ({
      rule_ref: candidate.rule_ref,
      policy_ref: candidate.policy_ref,
      resolve(value, context) {
        if (resolver) return resolver(value, context);
        return {
          disposition: 'execute',
          proposals: [{
            proposal_id: `temporal-event:${value.boundary_id}`,
            write_target: `temporal-event:${value.boundary_id}`
          }],
          state_projection: context.projection,
          follow_up_candidates: []
        };
      }
    })),
    effect_registrations:
      lowerDvinaTraceConversationTemporalEffectRegistrations()
  });
}

function playerPlan(request, {
  checkRequired = false,
  inputMode = 'verbatim',
  utteranceText = request.raw_text,
  offer = false,
  evidence = false,
  primaryAddresseeRef = request.player_safe_context.target_npc_ref,
  intendedAddresseeRefs = [request.player_safe_context.target_npc_ref]
} = {}) {
  const availableCheck = request.player_safe_context.available_check;
  return {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id,
    conversation_id: request.conversation_id,
    state_version: request.state_version,
    speaker_ref: request.speaker_ref,
    input_mode: inputMode,
    contribution_kind: 'speech',
    primary_addressee_ref: primaryAddresseeRef,
    intended_addressee_refs: intendedAddresseeRefs,
    affected_actor_refs: [],
    speech: speech({
      utteranceText,
      dominantAct: 'request'
    }),
    interpretation: interpretation('speak the exact player utterance'),
    resolution: checkRequired ? 'check_required' : 'automatic',
    activity: activity(),
    supporting_operations: offer ? [{
      op: 'offer_conditional_protection'
    }] : evidence ? [{
      op: 'emit_interaction',
      interaction_kind: 'present_item_as_evidence',
      actor_ref: request.speaker_ref,
      target_ref: request.player_safe_context.target_npc_ref,
      entity_ref: request.player_safe_context.available_evidence.item_ref
    }] : [],
    check: checkRequired ? {
      purpose: 'resolve social delivery',
      attribute_ref: availableCheck.attribute_ref,
      skill_ref: availableCheck.skill_ref,
      difficulty_band: availableCheck.difficulty_band,
      outcomes: {
        clean_success: { delivery_quality: 'compelling', observable_effects: [] },
        success: { delivery_quality: 'credible', observable_effects: [] },
        success_with_cost: {
          delivery_quality: 'credible_with_visible_cost', observable_effects: []
        },
        failure_with_consequence: {
          delivery_quality: 'unconvincing', observable_effects: []
        },
        severe_failure: {
          delivery_quality: 'transparently_manipulative', observable_effects: []
        }
      }
    } : null,
    handoff: null
  };
}

function eremeyPlan(request, responseKind, routeOperation) {
  if (['silence', 'leave_conversation'].includes(responseKind)) {
    return npcNonSpeechPlan(
      request,
      responseKind,
      request.public_conversation_history.at(-1)?.speaker_ref.entity_id ?? null
    );
  }
  const disclosure = responseKind === 'route_disclosure';
  const ordinarySpeech = responseKind === 'speech';
  const routeRef = routeOperation.route_ref;
  const knowledgeScopeRef = routeOperation.source_knowledge_scope_ref;
  return npcSpeechPlan(request, {
    utteranceText: disclosure
      ? 'От лагеря иди к старой сушильне по тропе.'
      : ordinarySpeech
        ? 'Я отвечу лишь на то, что сам видел.'
        : 'Нечего мне больше сказать.',
    dominantAct: disclosure ? 'inform' : ordinarySpeech ? 'answer' : 'evade',
    interactionTags: ordinarySpeech
      ? [] : [disclosure ? 'route_disclosure' : 'withhold'],
    claims: disclosure ? [{
      claim_id: 'eremey-route-disclosure',
      content_summary: 'К старой сушильне ведёт тропа.',
      form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [ref('knowledge_scope', knowledgeScopeRef)],
      mentioned_entity_refs: [ref('route', routeRef)]
    }] : [],
    supportingOperations: disclosure ? [{
      op: 'disclose_known_route',
      route_ref: routeRef,
      source_knowledge_scope_ref: knowledgeScopeRef
    }] : []
  });
}
function ratshaPlan(request, responseKind, playerId) {
  if (['silence', 'leave_conversation', 'combat_handoff']
    .includes(responseKind)) {
    return npcNonSpeechPlan(request, responseKind, playerId);
  }
  const variants = {
    surrender: {
      utteranceText: 'Сдаюсь. Нож отдам.',
      dominantAct: 'accept',
      interactionTags: ['surrender'],
      claims: [],
      supportingOperations: [{ op: 'commit_surrender' }]
    },
    lie: {
      utteranceText: 'Я здесь случайно и никого не видел.',
      dominantAct: 'inform',
      interactionTags: ['lie'],
      claims: [{
        claim_id: 'ratsha-known-falsehood',
        content_summary: 'Ратша утверждает, что никого не видел.',
        form: 'assertion',
        speaker_posture: 'knowingly_false',
        source_knowledge_refs: [],
        mentioned_entity_refs: []
      }],
      supportingOperations: [{ op: 'state_known_falsehood' }]
    },
    bargain: {
      utteranceText: 'Отпустите меня, и я скажу, кто меня послал.',
      dominantAct: 'negotiate',
      interactionTags: ['bargain'],
      claims: [],
      supportingOperations: [{ op: 'state_bargain' }]
    },
    speech: {
      utteranceText: 'Я не стану отвечать на это обвинение.',
      dominantAct: 'refuse',
      interactionTags: [],
      claims: [],
      supportingOperations: []
    }
  };
  return npcSpeechPlan(request, variants[responseKind]);
}

function npcSpeechPlan(request, {
  utteranceText,
  dominantAct,
  interactionTags = [],
  claims = [],
  supportingOperations = []
}) {
  const playerRef = request.public_conversation_history.at(-1)?.speaker_ref
    ?? null;
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: playerRef,
    intended_addressee_refs: playerRef === null ? [] : [playerRef],
    affected_actor_refs: [],
    speech: speech({
      utteranceText,
      dominantAct,
      interactionTags,
      claims
    }),
    interpretation: interpretation('respond in the current conversation'),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: supportingOperations,
    check: null,
    handoff: null,
    reason: 'The response follows Ratsha or Eremey current subjective state.'
  };
}

function npcNonSpeechPlan(request, responseKind, playerId) {
  const combat = responseKind === 'combat_handoff';
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: responseKind,
    primary_addressee_ref: null,
    intended_addressee_refs: [],
    affected_actor_refs: [],
    speech: null,
    interpretation: interpretation(combat
      ? 'leave conversation through the combat owner handoff'
      : responseKind === 'leave_conversation'
        ? 'end participation in the conversation'
        : 'remain silent'),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: [],
    check: null,
    handoff: combat ? {
      kind: 'combat',
      intent: 'transfer control to the combat owner',
      target_actor_refs: [ref('player_character', playerId)]
    } : null,
    reason: combat
      ? 'Ratsha chooses a combat handoff without resolving combat here.'
      : 'Ratsha chooses not to answer.'
  };
}

function speech({
  utteranceText,
  dominantAct,
  interactionTags = [],
  claims = []
}) {
  return {
    utterance_text: utteranceText,
    dominant_act: dominantAct,
    interaction_tags: interactionTags,
    topic_refs: [],
    claims,
    response_expectation: { kind: 'none', target_refs: [] }
  };
}

function interpretation(groundedContribution) {
  return {
    intent: groundedContribution,
    grounded_contribution: groundedContribution,
    adaptation: 'literal'
  };
}

function activity() {
  return { duration_class: 'domain_owned', effort: 'none' };
}

function durationForCall(values, callNumber) {
  return values[Math.min(callNumber - 1, values.length - 1)];
}

export function checkResult(checkId, band) {
  return { check_id: checkId, outcome: { band } };
}

export function phase2ConversationPayload({
  state,
  optionId,
  check,
  activityRef,
  result
}) {
  const consequence = projectSharedSemanticConsequence({
    conversation: {
      activity_ref: activityRef,
      semantic_exchange: result
    }
  });
  return {
    party_id: state.party_id,
    actor_id: state.actor_id,
    party_state: state.party_state,
    conversation_statements: structuredClone(result.statements),
    conversation_audiences: structuredClone(result.audiences),
    last_turn: {
      option_id: optionId,
      check_result: check,
      time_update: {},
      body_update: {},
      consequence
    }
  };
}

export function projectPhase3Conversation({ state, contracts, result, inputDigest }) {
  const clock = structuredClone(state.clock);
  return nextPhase3State({
    state,
    factual: {
      player_input: {
        request_id: `request:${inputDigest.slice(0, 12)}`,
        idempotency_key: `idempotency:${inputDigest.slice(0, 12)}`,
        raw_text: result.statements[0]?.utterance_text
          ?? 'interrupted conversation contribution',
        received_at: clock
      },
      mode_resolution: {
        option_id: contracts.ids.evidenceOption,
        decision_trace: { action_set_digest: 'm2-phase3-action-set' }
      },
      availability: { check_requests: [] },
      time_update: { clock_before: clock, clock_after: clock },
      body_update: null,
      consequence: {
        phase3_kind: 'conversation',
        duration_minutes: 1,
        conversation: {
          activity_ref: result.evidence_presentation
            ? contracts.evidenceTalk.profile_id
            : contracts.talk.profile_id,
          npc_id: result.resumed_npc_execution?.plan?.speaker_ref.entity_id
            ?? result.decision_request?.npc_ref.entity_id
            ?? contracts.actors.find(
              ({ ref: actorRef }) => actorRef === 'eremey_fisher'
            ).instance_id,
          semantic_exchange: result,
          objective_fact_outputs: [],
          evidence_input_ref:
            result.evidence_presentation?.evidence_ref ?? null,
          check_result: null
        }
      }
    },
    nextVersion: state.party_state.state_version + 1,
    turnNumber: state.party_state.turn_number + 1,
    inputDigest,
    changeSetId: `change:${inputDigest.slice(0, 12)}`,
    rootTurnId: `turn:${inputDigest.slice(0, 12)}`,
    workingRevision: 0
  });
}

export function assertPersistedStatePayloadSafe({
  payload,
  persistenceMarker,
  historyBranch
}) {
  const serialized = JSON.stringify(payload);
  assert.equal(
    Object.hasOwn(payload, 'npc_semantic_decision_traces'),
    false
  );
  assert.equal(serialized.includes(persistenceMarker), false);
  assert.equal(serialized.includes('"decision_request"'), false);
  assert.equal(serialized.includes('"decision_plan"'), false);
  assert.equal(
    serialized.includes('npc_conversation_response_request_v1'),
    false
  );
  assert.equal(
    serialized.includes('conversation_contribution_plan_v1'),
    false
  );
  assert.equal(Object.hasOwn(historyBranch, 'semantic_exchange'), false);
  assert.ok(historyBranch.semantic_exchange_projection);
  assert.equal(
    payload.npc_semantic_decision_refs.at(-1).request_id,
    historyBranch.semantic_exchange_projection.request_id
  );
  assert.equal(
    Object.hasOwn(
      payload.last_turn.consequence.conversation
        ?? payload.last_turn.consequence.negotiation,
      'semantic_exchange'
    ),
    false
  );
}

export function projectPhase4Negotiation({
  state,
  contracts,
  result,
  inputDigest
}) {
  const playerInput = {
    request_id: `request:${inputDigest.slice(0, 12)}`,
    idempotency_key: `idempotency:${inputDigest.slice(0, 12)}`,
    raw_text: result.statements[0].utterance_text
  };
  return nextPhase4State({
    state,
    factual: {
      player_input: playerInput,
      mode_resolution: {
        option_id: contracts.ids.negotiationOption,
        decision_trace: { action_set_digest: 'm2-negotiation-action-set' }
      },
      time_update: { clock_after: state.clock },
      consequence: {
        phase4_kind: 'negotiation',
        negotiation: {
          activity_ref: contracts.negotiation.profile_id,
          semantic_exchange: result,
          objective_fact_outputs: []
        }
      }
    },
    nextVersion: state.party_state.state_version + 1,
    turnNumber: state.party_state.turn_number + 1,
    inputDigest,
    changeSetId: `change:${inputDigest.slice(0, 12)}`,
    contracts,
    rootTurnId: `turn:${inputDigest.slice(0, 12)}`,
    workingRevision: 0
  });
}
