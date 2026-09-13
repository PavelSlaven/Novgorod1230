import { buildTurnStepPreparedBodyUpdate, buildTurnStepPreparedTimeUpdate,
  requireTurnStepPreparedEffectLedger } from '@rus/turn';
import { preparedEffectFail, samePreparedValue,
  validateAuthoritativePreparedRoute, validatePreparedBodyReplay,
  validatePreparedDirectSlice, validatePreparedSemanticSlices, validLocalFireIntermediateTrace } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { validatePreparedRouteTraceLineage } from
  './lower-dvina-trace-turn-step-prepared-route-lineage.js';
import { samePreparedTimeBase } from
  './lower-dvina-trace-turn-step-prepared-effect-values.js';
import { projectPosition } from
  '../../runtime/lower-dvina-trace-player-safe-world.js';
import { isPreparedTurn10Ledger,
  validatePreparedTurn10
} from './lower-dvina-trace-turn-10-prepared-validation.js';
import {
  isPreparedPhase7RestLedger,
  validatePreparedPhase7Rest
} from './lower-dvina-trace-phase-7-prepared-validation.js';
import { PHASE8_PREPARED_COMMANDS, validatePreparedPhase8 } from
  './lower-dvina-trace-phase-8-prepared-validation.js';
import { preparedPhase4Conversation, preparedPhase4Route,
  validatePreparedCombat, validatePreparedPhase4Conversation,
  validatePreparedPhase4Route } from
  './lower-dvina-trace-turn-step-prepared-special-validation.js';
import { validatePreparedEnvelopeAggregate,
  validateRouteOnlyBoundaryTrace } from
  './lower-dvina-trace-turn-step-prepared-aggregate-validation.js';
import { PHASE9_PREPARED_COMMANDS, validatePreparedPhase9 } from
  './lower-dvina-trace-phase-9-prepared-validation.js';
const ROUTE_COMMAND = 'lower_dvina_trace.follow_path_to_fishing_camp';
const KNOWN_ROUTE_COMMAND = 'lower_dvina_trace.follow_admitted_known_route:';
const COMBAT_COMMAND = 'lower_dvina_trace.respond_in_active_combat';
export function validatePreparedEffectCommit({
  batch, envelope, factual, state, phase3Contracts, phase4Contracts,
  turnStepApprovedOwners,
  localFirePlans = []
}) {
  const ledgerValue = envelope?.time_update?.prepared_effect_ledger;
  if (ledgerValue == null) return { prepared: false };
  let ledger;
  try {
    ledger = requireTurnStepPreparedEffectLedger(ledgerValue);
  } catch (cause) {
    preparedEffectFail('ledger contract or digest is invalid', cause);
  }
  validatePreparedEnvelopeAggregate({ ledger, envelope, factual });
  const slices = ledger.slices;
  const traces = envelope.loop_trace?.step_traces;
  if (slices.every((slice) => slice.effect_kind === 'semantic_activity')) {
    const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
    const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
    if (ledger.root_turn_id !== batch?.root_turn_id
        || ledger.committed_state_version !== batch?.committed_state_version
        || !samePreparedValue(expectedBody, envelope.body_update)
        || !samePreparedTimeBase(expectedTime, envelope.time_update)
        || envelope.consequence?.prepared_effect_ledger_digest !== ledger.ledger_digest
        || Number(envelope.consequence?.duration_minutes)
          !== Number(expectedTime.exact_elapsed.exact_minutes.numerator)
        || ['consequence', 'time_update', 'body_update',
          'player_input', 'mode_resolution'].some((key) =>
          !samePreparedValue(envelope[key], factual?.[key]))) {
      preparedEffectFail('semantic ledger aggregate differs from factual commit');
    }
    validatePreparedSemanticSlices({ ledger, batch, envelope, state, turnStepApprovedOwners });
    const semanticBodySlices = slices.filter(
      (slice) => slice.body_update.applied === true);
    return { prepared: true,
      semanticBodySlice: semanticBodySlices.length === 1
        ? semanticBodySlices[0] : null,
      semanticBodySlices };
  }
  if (isPreparedTurn10Ledger(ledger)) {
    return validatePreparedTurn10({ ledger, traces, envelope, factual, state, batch });
  }
  if (isPreparedPhase7RestLedger(ledger)) {
    return validatePreparedPhase7Rest({ ledger, traces, envelope, factual, state, batch });
  }
  if (ledger.slices.length === 1
      && ledger.slices[0].owner_ref === COMBAT_COMMAND) {
    return validatePreparedCombat({ ledger, envelope, factual, state, batch });
  }
  if (ledger.slices.length === 1
      && PHASE8_PREPARED_COMMANDS.has(ledger.slices[0].owner_ref)) {
    return validatePreparedPhase8({ ledger, envelope, factual, state, batch });
  }
  if (ledger.slices.length === 1
      && PHASE9_PREPARED_COMMANDS.has(ledger.slices[0].owner_ref)) {
    return validatePreparedPhase9({ ledger, envelope, factual, state, batch });
  }
  if (preparedPhase4Route(ledger)) {
    return validatePreparedPhase4Route({ ledger, envelope,
      factual, state, batch, phase4Contracts, turnStepApprovedOwners });
  }
  if (preparedPhase4Conversation(ledger)) {
    return validatePreparedPhase4Conversation({ ledger, envelope, factual,
      state, batch, turnStepApprovedOwners });
  }
  const [route, direct] = slices;
  const routeTrace = traces?.find(({step_index:step})=>step===route?.step_index);
  const directTrace = direct == null ? traces?.[1] : traces?.find(
    ({step_index:step})=>step===direct.step_index);
  const intermediateTraces = direct == null ? [] : traces?.filter(
    ({step_index:step})=>step>route.step_index&&step<direct.step_index) ?? [];
  const routeOperation = routeTrace?.approved_plan?.operations?.[0];
  const hasDirect = direct != null;
  const validTraceCount = hasDirect
    ? traces?.length === direct.step_index
      && traces.every(({ applied }) => applied === true)
      && intermediateTraces.every((trace) =>
        validLocalFireIntermediateTrace(trace, localFirePlans))
    : [1, 2].includes(traces?.length);
  if (ledger.root_turn_id !== (batch?.root_turn_id
        ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || ![1, 2].includes(slices.length)
      || !Array.isArray(traces) || !validTraceCount
      || envelope.loop_trace.working_revision
        !== (hasDirect ? traces.length : slices.length)
      || route.effect_kind !== 'domain_command'
      || (route.owner_ref !== ROUTE_COMMAND
        && route.owner_ref !== `${KNOWN_ROUTE_COMMAND}${
          route.consequence?.movement?.route_ref}`)
      || route.operation_ref !== 'request_movement'
      || route.step_index !== 1
      || routeTrace.applied !== true
      || routeTrace.player_response_boundary !== false
      || routeTrace.approved_plan?.resolution !== 'domain_request'
      || routeOperation?.op !== 'request_movement'
      || routeOperation.target_ref
        !== route.consequence.movement?.destination?.location_ref) {
    preparedEffectFail(
      'slices do not exactly cover route then direct activity');
  }
  validateAuthoritativePreparedRoute({ route, state, phase3Contracts });
  validatePreparedRouteTraceLineage({
    route, routeTrace, directTrace, loopTrace: envelope.loop_trace,
    envelope, state, routeOnly: !hasDirect,
    intermediateTraces, scenePresentation: turnStepApprovedOwners?.scenePresentation
  });
  if (hasDirect) validatePreparedDirectSlice({
    batch, direct, directTrace, route, turnStepApprovedOwners
  });
  else {
    if (batch != null) {
      preparedEffectFail('route-only ledger has an operation batch');
    }
    validateRouteOnlyBoundaryTrace({ routeTrace, directTrace,
      loopTrace: envelope.loop_trace });
  }
  const routeRequestState = routeTrace.plan_request?.player_safe_state;
  const directRequestState = directTrace?.plan_request?.player_safe_state;
  if (!samePreparedValue(routeRequestState?.position, projectPosition(state.position))
      || !samePreparedValue(routeRequestState?.clock, state.clock)
      || (directTrace != null && (
        !samePreparedValue(
          directRequestState?.clock, route.time_update.clock_after)
        || directRequestState?.position?.location_ref
          !== route.consequence.movement.destination.location_ref
        || directRequestState?.position?.g5_anchor_id
          !== route.consequence.movement.destination.g5_anchor_id))) {
    preparedEffectFail(
      'prepared working state differs from approved requests');
  }
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  if (!samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(envelope.hidden_update, factual?.hidden_update)
      || !samePreparedValue(envelope.player_input, factual?.player_input)
      || !samePreparedValue(envelope.mode_resolution, factual?.mode_resolution)
      || !samePreparedValue(route.availability, factual?.availability)
      || envelope.time_update.prepared_effect_ledger_digest
        !== ledger.ledger_digest
      || envelope.body_update.prepared_effect_ledger_digest
        !== ledger.ledger_digest
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)) {
    preparedEffectFail('ledger aggregate differs from factual commit');
  }
  validatePreparedBodyReplay({
    route, direct, factual: envelope, state, phase3Contracts
  });
  return { prepared: true, routeSlice: route, directSlice: direct };
}
