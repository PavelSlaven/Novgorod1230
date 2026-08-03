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
  validatePreparedRouteTraceLineage
} from './lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { plain } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const ROUTE_COMMAND =
  'lower_dvina_trace.follow_path_to_fishing_camp';
const DEFERRED_DOMAIN_OPERATIONS = new Set([
  'request_discovery', 'request_container_access', 'request_movement',
  'request_item_use', 'request_activity', 'emit_interaction'
]);

export function validatePreparedEffectCommit({
  batch,
  envelope,
  factual,
  state,
  phase3Contracts,
  turnStepApprovedOwners
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
  const [route, direct] = slices;
  const [routeTrace, directTrace] = traces ?? [];
  const routeOperation = routeTrace?.approved_plan?.operations?.[0];
  const hasDirect = direct != null;
  const validTraceCount = hasDirect
    ? traces?.length === 2
    : [1, 2].includes(traces?.length);
  if (ledger.root_turn_id !== (batch?.root_turn_id
        ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || ![1, 2].includes(slices.length)
      || !Array.isArray(traces) || !validTraceCount
      || envelope.loop_trace.working_revision !== slices.length
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
    envelope, state, routeOnly: !hasDirect
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
      || !sameTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)) {
    preparedEffectFail('ledger aggregate differs from factual commit');
  }
  validatePreparedBodyReplay({
    route, direct, factual: envelope, state, phase3Contracts
  });
  return { prepared: true, routeSlice: route, directSlice: direct };
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
  const preparedVisible = mergeRecord({
    completed_steps: structuredClone(loopTrace.completed_steps),
    clarification: structuredClone(loopTrace.clarification)
  }, fragment.visible_seed ?? {});
  const output = {
    ...base,
    duration_minutes: Number(base.duration_minutes)
      + Number(fragment.duration_minutes ?? 0),
    visible_seed: mergeRecord(preparedVisible, base.visible_seed ?? {}),
    hidden_update: mergeRecord(
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

function sameTimeBase(expected, actual) {
  return ['version', 'schema', 'owner', 'clock_before', 'clock_after',
    'exact_elapsed', 'nearest_boundary', 'boundary_trace',
    'prepared_effect_ledger_digest', 'prepared_effect_ledger']
    .every((key) => samePreparedValue(expected[key], actual?.[key]));
}

function mergeRecord(left, right) {
  if (!plain(left) || !plain(right)) {
    preparedEffectFail('prepared consequence record is invalid');
  }
  const output = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    if (Object.hasOwn(output, key)
        && !samePreparedValue(output[key], value)) {
      preparedEffectFail(`prepared consequence record conflicts on ${key}`);
    }
    output[key] = structuredClone(value);
  }
  return output;
}
