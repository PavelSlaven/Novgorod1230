import { canonicalDigest } from '@rus/materialization';
import {
  projectLowerDvinaTracePlayerSafeState
} from '../../runtime/lower-dvina-trace-player-safe-state.js';
import {
  createLowerDvinaTracePlayerSafeWorkingProjectionAuthority
} from '../../runtime/lower-dvina-trace-player-safe-working.js';
import {
  buildLowerDvinaTracePreparedRouteWorkingProjection
} from '../../runtime/lower-dvina-trace-turn-step-prepared-effects.js';
import {
  preparedEffectFail,
  samePreparedValue
} from './lower-dvina-trace-turn-step-prepared-effect-authority.js';

export function validatePreparedRouteTraceLineage({
  route,
  routeTrace,
  directTrace,
  loopTrace,
  envelope,
  state,
  routeOnly,
  intermediateTraces = []
}) {
  const routeRequest = routeTrace.plan_request;
  const continuation = routeTrace.approved_plan?.continuation;
  const expectedRequestRoot =
    `turn-step:${envelope.party_id}:${envelope.player_input.turn_number}`;
  let projected;
  let routeProjection;
  let routeWorkingAfter;
  let playerSafeAfter;
  try {
    projected = projectLowerDvinaTracePlayerSafeState({
      committed_state: state,
      actor_id: state.actor_id
    });
    const { active_interlocutor: _activeInterlocutor,
      ...nextRouteProjection } = projected.player_safe_state;
    routeProjection = nextRouteProjection;
    routeWorkingAfter = buildLowerDvinaTracePreparedRouteWorkingProjection({
      projection: routeProjection,
      movement: route.consequence.movement,
      committedState: state,
      clockAfter: route.time_update.clock_after
    });
    const stateAfterRoute = structuredClone(state);
    const firstEntry = stateAfterRoute.first_entry_preparation;
    if (firstEntry?.scene?.location_profile_ref
        === route.consequence.movement.destination.location_ref
      && firstEntry.spatial_v3?.target != null
      && firstEntry.spatial_v3.target.status !== 'prepared') {
      firstEntry.spatial_v3.target.status = 'prepared';
    }
    const authority =
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
    playerSafeAfter = projectLowerDvinaTracePlayerSafeState({
      committed_state: stateAfterRoute,
      working_projection: authority.admit(routeWorkingAfter),
      working_projection_authority: authority,
      actor_id: state.actor_id
    }).player_safe_state;
  } catch (cause) {
    preparedEffectFail('prepared route lineage could not be projected', cause);
  }
  const priorTraces = loopTrace.step_traces.filter(({ step_index: step }) =>
    step < directTrace?.step_index && step >= routeTrace.step_index);
  const expectedPriorSteps = priorTraces.map((trace) => ({
    step_index: trace.step_index,
    summary: trace.approved_plan?.interpretation?.grounded_attempt
  }));
  if (routeRequest?.request_id !== `${expectedRequestRoot}:step:1`
      || routeRequest.root_turn_id !== loopTrace.root_turn_id
      || routeRequest.root_turn_id !== envelope.root_turn_id
      || routeRequest.committed_state_version
        !== loopTrace.committed_state_version
      || routeRequest.working_revision !== 0
      || routeRequest.step_index !== 1
      || routeRequest.root_player_action !== envelope.player_input.raw_text
      || routeRequest.remaining_intent !== routeRequest.root_player_action
      || !samePreparedValue(routeRequest.completed_steps, [])
      || !samePreparedValue(routeRequest.actor, projected.actor)
      || !containsStableProjection(
        routeRequest.player_safe_state, routeProjection)
      || route.projection_before_digest
        !== canonicalDigest(routeProjection)
      || route.projection_after_digest !== canonicalDigest(routeWorkingAfter)) {
    preparedEffectFail('route trace does not bind its committed root lineage');
  }
  if (directTrace == null) return;
  const request = directTrace.plan_request;
  const previousTrace = priorTraces.at(-1);
  const exactPlayerSafe = intermediateTraces.length === 0
    ? containsStableProjection(request?.player_safe_state, playerSafeAfter)
    : samePreparedValue(request?.player_safe_state?.position,
      playerSafeAfter.position)
      && samePreparedValue(request?.player_safe_state?.clock,
        playerSafeAfter.clock)
      && request?.player_safe_state?.actor_id === playerSafeAfter.actor_id;
  if (request?.request_id
      !== `${expectedRequestRoot}:step:${directTrace.step_index}`
      || request.root_turn_id !== routeRequest.root_turn_id
      || request.committed_state_version
        !== routeRequest.committed_state_version
      || request.working_revision !== directTrace.step_index - 1
      || request.step_index !== directTrace.step_index
      || !samePreparedValue(request.actor, routeRequest.actor)
      || request.root_player_action !== routeRequest.root_player_action
      || request.remaining_intent
        !== previousTrace?.approved_plan?.continuation?.remaining_intent
      || !samePreparedValue(request.completed_steps, expectedPriorSteps)
      || !exactPlayerSafe
      || (routeOnly && (
        loopTrace.remaining_intent !== continuation?.remaining_intent
        || !samePreparedValue(loopTrace.completed_steps,
          expectedPriorSteps)))) {
    preparedEffectFail('direct trace does not bind the applied route lineage');
  }
}

function containsStableProjection(value, stable) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(stable).every(([key, expected]) =>
      samePreparedValue(value[key], expected));
}
