import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate,
  requireTurnStepPreparedEffectLedger
} from '@rus/turn';
import {
  isPreparedDirectContinuation,
  preparedEffectFail,
  samePreparedValue,
  validateAuthoritativePreparedRoute,
  validatePreparedBodyReplay,
  validatePreparedDirectSlice,
  validatePreparedRouteTraceLineage,
  validLocalFireIntermediateTrace
} from './lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { mergePreparedRecord, samePreparedTimeBase } from
  './lower-dvina-trace-turn-step-prepared-effect-values.js';
import {
  isPreparedTurn10Ledger,
  validatePreparedTurn10
} from './lower-dvina-trace-turn-10-prepared-validation.js';
import { PHASE8_PREPARED_COMMANDS, validatePreparedPhase8 } from
  './lower-dvina-trace-phase-8-prepared-validation.js';
import {
  validTraceCombatStartConsequence,
  validTracePreparedCombatConsequence
} from '../../runtime/lower-dvina-trace-combat-prepared-contract.js';
import { PHASE9_PREPARED_COMMANDS, validatePreparedPhase9 } from
  './lower-dvina-trace-phase-9-prepared-validation.js';

const ROUTE_COMMAND = 'lower_dvina_trace.follow_path_to_fishing_camp';
const COMBAT_COMMAND = 'lower_dvina_trace.respond_in_active_combat'; const DEFERRED_DOMAIN_OPERATIONS = new Set([
  'request_discovery', 'request_container_access', 'request_movement',
  'request_item_use', 'request_activity', 'emit_interaction', 'request_combat'
]);
export function validatePreparedEffectCommit({
  batch,
  envelope,
  factual,
  state,
  phase3Contracts,
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
  const slices = ledger.slices;
  const traces = envelope.loop_trace?.step_traces;
  if (isPreparedTurn10Ledger(ledger)) {
    return validatePreparedTurn10({
      ledger, traces, envelope, factual, state, batch
    });
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
      || route.owner_ref !== ROUTE_COMMAND
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
    intermediateTraces
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
  if (!samePreparedValue(routeRequestState?.position, state.position)
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
  const expectedConsequence = expectedPreparedConsequence({
    route,
    direct,
    loopTrace: envelope.loop_trace,
    ledgerDigest: ledger.ledger_digest
  });
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  if (!samePreparedValue(expectedConsequence, envelope.consequence)
      || !samePreparedValue(envelope.consequence, factual?.consequence)
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

function validatePreparedCombat({ ledger, envelope, factual, state, batch }) {
  const slice = ledger.slices[0];
  const trace = envelope?.loop_trace?.step_traces?.[0];
  const operation = trace?.approved_plan?.operations?.[0];
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const combatStart = validTraceCombatStartConsequence(slice.consequence);
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || slice.effect_kind !== 'domain_command'
      || slice.operation_ref !== 'request_combat'
      || slice.step_index !== 1
      || !(combatStart || validTracePreparedCombatConsequence(
        slice.consequence, { playerResponseBoundary:
          trace?.player_response_boundary }))
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
        state.clock)) {
    preparedEffectFail('combat prepared ledger is not authoritative');
  }
  return { prepared: true, combatSlice: slice };
}

function validateRouteOnlyBoundaryTrace({
  routeTrace,
  directTrace,
  loopTrace
}) {
  const continuation = routeTrace.approved_plan?.continuation;
  const deferredRequired = routeTrace.approved_plan?.goal_result === 'pending'
    && continuation != null;
  if (directTrace == null) {
    if (deferredRequired) {
      preparedEffectFail(
        'pending route continuation lacks its deferred step');
    }
    return;
  }
  if (!deferredRequired) {
    preparedEffectFail('terminal route has an unexpected deferred step');
  }
  const plan = directTrace.approved_plan;
  const resolution = plan?.resolution;
  const operation = plan?.operations?.[0];
  const clarification = resolution === 'clarification_required';
  const deferredDomain = resolution === 'domain_request'
    && plan.activity?.owner === 'domain'
    && plan.operations?.length === 1
    && DEFERRED_DOMAIN_OPERATIONS.has(operation?.op);
  const deferredCheck = resolution === 'generic_check'
    && plan.operations?.length === 0
    && plan.check != null;
  const deferredDirect = resolution === 'direct'
    && !isPreparedDirectContinuation(plan);
  const deferredClarification = clarification
    && plan.operations?.length === 0
    && plan.clarification != null
    && samePreparedValue(plan.clarification, loopTrace.clarification);
  if (directTrace.step_index !== 2
      || directTrace.working_revision !== 1
      || directTrace.applied !== false
      || directTrace.player_response_boundary !== true
      || directTrace.check_binding !== null
      || directTrace.check_outcome !== null
      || directTrace.plan_request?.step_index !== 2
      || directTrace.plan_request?.working_revision !== 1
      || loopTrace.working_revision !== 1
      || loopTrace.status !== 'player_response_required'
      || loopTrace.stop_reason !== (clarification
        ? 'clarification_required' : 'player_response')
      || (!clarification && loopTrace.clarification !== null)
      || ![deferredDomain, deferredCheck, deferredDirect,
        deferredClarification].some(Boolean)) {
    preparedEffectFail(
      'route-only boundary trace is not an exact deferred step');
  }
}

function expectedPreparedConsequence({
  route,
  direct,
  loopTrace,
  ledgerDigest
}) {
  const base = structuredClone(route.consequence);
  const fragment = direct?.consequence ?? {};
  const preparedVisible = mergePreparedRecord({
    completed_steps: structuredClone(loopTrace.completed_steps),
    clarification: structuredClone(loopTrace.clarification)
  }, fragment.visible_seed ?? {});
  const output = {
    ...base,
    duration_minutes: Number(base.duration_minutes)
      + Number(fragment.duration_minutes ?? 0),
    visible_seed: mergePreparedRecord(preparedVisible, base.visible_seed ?? {}),
    hidden_update: mergePreparedRecord(
      fragment.hidden_update ?? {}, base.hidden_update ?? {}),
    state_changes: [
      ...structuredClone(fragment.state_changes ?? []),
      ...structuredClone(base.state_changes ?? [])
    ],
    suggested_actions: [
      ...structuredClone(fragment.suggested_actions ?? []),
      ...structuredClone(base.suggested_actions ?? [])
    ],
    prepared_effect_ledger_digest: ledgerDigest
  };
  for (const key of ['body_effect_ref', 'position_transition']) {
    if (!Object.hasOwn(fragment, key)) continue;
    if (Object.hasOwn(base, key)
        && !samePreparedValue(base[key], fragment[key])) {
      preparedEffectFail(`prepared consequence conflicts on ${key}`);
    }
    output[key] = structuredClone(fragment[key]);
  }
  return output;
}
