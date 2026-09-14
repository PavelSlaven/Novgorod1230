import { buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate } from '@rus/turn';
import { preparedEffectFail, samePreparedValue, validatePreparedBodyReplay,
  validateAuthoritativePreparedRoute, validatePreparedSemanticSlices } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { validatePreparedRouteTraceLineage } from
  './lower-dvina-trace-turn-step-prepared-route-lineage.js';
import { samePreparedTimeBase } from
  './lower-dvina-trace-turn-step-prepared-effect-values.js';
import { validPreparedPhase3ConversationTargets } from
  './lower-dvina-trace-turn-step-prepared-conversation-targets.js';
import { validTraceCombatStartConsequence,
  validTracePreparedCombatConsequence } from
  '../../runtime/lower-dvina-trace-combat-prepared-contract.js';

const PHASE4_ROUTE_COMMAND =
  'lower_dvina_trace.follow_known_route_to_drying_shed';
const PHASE4_CONVERSATION_COMMAND =
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender';
export function preparedPhase3RouteConversation(ledger) {
  const [route, conversation] = ledger.slices;
  return ledger.slices.length === 2
    && route.effect_kind === 'domain_command'
    && route.operation_ref === 'request_movement'
    && route.consequence?.phase3_kind === 'movement'
    && conversation.effect_kind === 'domain_command'
    && conversation.operation_ref === 'emit_interaction'
    && conversation.consequence?.conversation != null;
}

export function validatePreparedPhase3RouteConversation({ ledger, envelope,
  factual, state, batch, phase3Contracts, turnStepApprovedOwners }) {
  const [route, conversation] = ledger.slices;
  const traces = envelope.loop_trace?.step_traces;
  const [routeTrace, conversationTrace] = traces ?? [];
  const routeOperation = routeTrace?.approved_plan?.operations?.[0];
  const conversationOperation = conversationTrace?.approved_plan?.operations?.[0];
  const offeredInteractions =
    conversationTrace?.plan_request?.available_domain_operations?.filter(
      (operation) => samePreparedValue(operation, conversationOperation)) ?? [];
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const target = conversationOperation?.target_actor_refs?.[0];
  if (batch != null || !Array.isArray(traces) || traces.length !== 2
      || traces.some(({ applied }) => applied !== true)
      || envelope.loop_trace.working_revision !== 2
      || route.step_index !== 1 || route.operation_ref !== 'request_movement'
      || route.consequence?.phase3_kind !== 'movement'
      || routeTrace?.approved_plan?.resolution !== 'domain_request'
      || routeTrace.player_response_boundary !== false
      || routeOperation?.op !== 'request_movement'
      || conversation.step_index !== 2
      || conversation.operation_ref !== 'emit_interaction'
      || conversation.consequence?.phase3_kind != null
      || conversation.consequence?.conversation == null
      || conversationTrace?.approved_plan?.resolution !== 'domain_request'
      || conversationTrace.player_response_boundary !== true
      || conversationTrace.approved_plan.operations?.length !== 1
      || conversationOperation?.op !== 'emit_interaction'
      || offeredInteractions.length !== 1
      || !validPreparedPhase3ConversationTargets(
        conversationOperation, conversation.consequence.conversation)
      || !Array.isArray(conversationOperation.instrument_refs)
      || conversation.consequence.conversation.npc_id !== target
      || !samePreparedValue(conversation.time_update.clock_before,
        route.time_update.clock_after)
      || conversation.body_update?.applied !== false
      || !samePreparedValue(conversation.body_update?.state_after,
        route.body_update?.state_after)
      || ledger.root_turn_id !== envelope.root_turn_id
      || ledger.committed_state_version !== envelope.base_state_version
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || envelope.consequence?.phase3_kind !== 'movement'
      || !samePreparedValue(envelope.consequence?.movement,
        route.consequence.movement)
      || !samePreparedValue(envelope.consequence?.conversation,
        conversation.consequence.conversation)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(envelope.hidden_update, factual?.hidden_update)
      || !samePreparedValue(envelope.player_input, factual?.player_input)
      || !samePreparedValue(envelope.mode_resolution, factual?.mode_resolution)
      || !samePreparedValue(route.availability, factual?.availability)
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)) {
    preparedEffectFail(
      'phase3 route and conversation differ from their committed chain');
  }
  validateAuthoritativePreparedRoute({ route, state, phase3Contracts });
  validatePreparedRouteTraceLineage({
    route, routeTrace, directTrace: conversationTrace,
    loopTrace: envelope.loop_trace, envelope, state, phase3Contracts,
    routeOnly: false, intermediateTraces: [],
    scenePresentation: turnStepApprovedOwners?.scenePresentation
  });
  validatePreparedBodyReplay({ route, direct: conversation,
    factual: envelope, state, phase3Contracts });
  return { prepared: true, routeSlice: route,
    phase3ConversationSlice: conversation };
}

export function preparedPhase4Conversation(ledger) {
  return [1, 2].includes(ledger.slices.length)
    && ledger.slices[0].effect_kind === 'domain_command'
    && ledger.slices[0].owner_ref === PHASE4_CONVERSATION_COMMAND
    && (ledger.slices.length === 1
      || ledger.slices[1].effect_kind === 'semantic_activity');
}
export function validatePreparedPhase4Conversation({ ledger, envelope, factual,
  state, batch, turnStepApprovedOwners }) {
  const [conversation, semantic] = ledger.slices;
  const traces = envelope.loop_trace?.step_traces;
  const conversationTrace = traces?.[0];
  const operation = conversationTrace?.approved_plan?.operations?.[0];
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const temporalBoundary = (conversation.time_update?.temporal_results ?? [])
    .some((result) => result.temporal_status === 'paused'
      || result.trace?.stopped_after_current_batch === true
      || result.visible_package_candidate?.player_safe_interruption != null
      || result.visible_package_candidate?.visible_payload
        ?.player_safe_interruption != null);
  const expectedBoundary = temporalBoundary
    || conversation.consequence?.negotiation?.player_response_boundary != null
    || conversation.consequence?.negotiation?.combat_handoff != null
    || conversation.consequence?.negotiation?.actor_step_handoff != null;
  const unpreparedContinuation = semantic == null && traces?.length === 2
    ? traces[1] : null;
  const validTraceCount = semantic == null
    ? traces?.length === 1 || unpreparedContinuation != null
    : traces?.length === 2;
  const validUnpreparedContinuation = unpreparedContinuation == null
    || (unpreparedContinuation.step_index === 2
      && ((['direct', 'generic_check'].includes(
        unpreparedContinuation.approved_plan?.resolution)
        && unpreparedContinuation.approved_plan?.activity?.owner === 'semantic')
      || (unpreparedContinuation.approved_plan?.resolution === 'domain_request'
        && unpreparedContinuation.approved_plan?.activity?.owner === 'domain'
        && unpreparedContinuation.approved_plan.operations?.length === 1
        && unpreparedContinuation.approved_plan.operations[0]?.op
          === 'request_discovery')));
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || !Array.isArray(traces) || !validTraceCount
      || traces.some(({ applied }) => applied !== true)
      || !validUnpreparedContinuation || conversation.step_index !== 1
      || conversation.operation_ref !== 'emit_interaction'
      || conversation.consequence?.phase4_kind !== 'negotiation'
      || conversationTrace?.approved_plan?.resolution !== 'domain_request'
      || operation?.op !== 'emit_interaction'
      || conversationTrace.player_response_boundary !== expectedBoundary
      || !samePreparedValue(conversation.availability, factual?.availability)
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || expectedBoundary && semantic != null) {
    preparedEffectFail('prepared phase4 conversation differs from its committed chain');
  }
  if (semantic != null) {
    if (semantic.step_index !== 2 || expectedBoundary) {
      preparedEffectFail('conversation continuation crosses a player boundary');
    }
    validatePreparedSemanticSlices({ ledger: { ...ledger, slices: [semantic] },
      batch, envelope, state: { ...state,
        clock: structuredClone(conversation.time_update.clock_after),
        body_state: structuredClone(conversation.body_update.state_after) },
      turnStepApprovedOwners });
  }
  return { prepared: true, semanticBodySlice:
    semantic?.body_update?.applied === true ? semantic : null };
}
export function preparedPhase4Route(ledger) {
  const route = ledger.slices.at(-1);
  return route?.effect_kind === 'domain_command'
    && route.owner_ref === PHASE4_ROUTE_COMMAND
    && (ledger.slices.length === 1 || (ledger.slices.length === 2
      && ledger.slices[0].effect_kind === 'semantic_activity'));
}
export function validatePreparedPhase4Route({ ledger, envelope, factual, state,
  batch, phase4Contracts, turnStepApprovedOwners }) {
  const hasPrefix = ledger.slices.length === 2;
  const prefix = hasPrefix ? ledger.slices[0] : null;
  const route = ledger.slices.at(-1);
  const traces = envelope.loop_trace?.step_traces;
  const prefixTrace = hasPrefix ? traces?.[0] : null;
  const routeTrace = traces?.[hasPrefix ? 1 : 0];
  const routeOperation = routeTrace?.approved_plan?.operations?.[0];
  const movement = route.consequence?.movement;
  const routeStep = hasPrefix ? 2 : 1;
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const expectedParticipants = phase4Contracts == null ? [] : [state.actor_id,
    phase4Contracts.actors.eremey_fisher.instance_id,
    phase4Contracts.actors.participating_fisher.instance_id];
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || (!hasPrefix && batch != null) || !Array.isArray(traces)
      || traces.length !== routeStep || traces.some(({ applied }) => applied !== true)
      || route.step_index !== routeStep
      || (hasPrefix && (prefix.step_index !== 1
        || prefixTrace?.approved_plan?.resolution !== 'direct'
        || prefixTrace.approved_plan.direct_result_kind !== 'player_utterance'
        || prefixTrace.approved_plan.operations?.length !== 0
        || prefixTrace.player_response_boundary !== false))
      || routeTrace?.approved_plan?.resolution !== 'domain_request'
      || routeTrace.player_response_boundary !== hasPrefix
      || routeOperation?.op !== 'request_movement'
      || routeOperation.target_ref !== movement?.destination_location_ref
      || route.consequence?.phase4_kind !== 'movement'
      || route.consequence.duration_minutes !== phase4Contracts?.route?.duration_minutes
      || movement.route_ref !== phase4Contracts?.route?.route_id
      || movement.source_location_ref !== state.position?.location_ref
      || movement.destination_location_ref !== phase4Contracts?.ids?.shed
      || !samePreparedValue(movement.participants, expectedParticipants)
      || !samePreparedValue(route.time_update?.clock_before,
        prefix?.time_update?.clock_after ?? state.clock)
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(envelope.hidden_update, factual?.hidden_update)
      || !samePreparedValue(envelope.player_input, factual?.player_input)
      || !samePreparedValue(envelope.mode_resolution, factual?.mode_resolution)
      || !samePreparedValue(route.availability, factual?.availability)
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)) {
    preparedEffectFail('phase4 route differs from its committed chain');
  }
  if (hasPrefix) validatePreparedSemanticSlices({ ledger: { ...ledger,
    slices: [prefix] }, batch, envelope, state, turnStepApprovedOwners });
  validatePreparedBodyReplay({ route, direct: null, factual: envelope, state,
    phase3Contracts: { routeBodyEffect: phase4Contracts.routeBodyEffect } });
  return { prepared: true, semanticBodySlice: null };
}
export function validatePreparedCombat({ ledger, envelope, factual, state, batch }) {
  const slice = ledger.slices[0];
  const trace = envelope?.loop_trace?.step_traces?.[0];
  const operation = trace?.approved_plan?.operations?.[0];
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const combatStart = validTraceCombatStartConsequence(slice.consequence);
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version) || slice.effect_kind !== 'domain_command'
      || slice.operation_ref !== 'request_combat' || slice.step_index !== 1
      || !(combatStart || validTracePreparedCombatConsequence(slice.consequence,
        { playerResponseBoundary: trace?.player_response_boundary }))
      || trace?.applied !== true
      || trace?.approved_plan?.resolution !== 'domain_request'
      || operation?.op !== 'request_combat'
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || trace.plan_request?.player_safe_state?.combat_sessions?.length
        !== (combatStart ? 0 : 1)
      || !samePreparedValue(trace.plan_request.player_safe_state.clock,
        state.clock)) preparedEffectFail('combat prepared ledger is not authoritative');
  return { prepared: true, combatSlice: slice };
}
