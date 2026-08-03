import { canonicalDigest } from '@rus/materialization';
import {
  projectLowerDvinaTracePlayerSafeState
} from '../../runtime/lower-dvina-trace-player-safe-state.js';
import {
  createLowerDvinaTracePlayerSafeWorkingProjectionAuthority
} from '../../runtime/lower-dvina-trace-player-safe-working.js';
import {
  applyApprovedTraceRouteBodyEffect
} from '../../runtime/lower-dvina-trace-route-body-effects.js';
import {
  buildLowerDvinaTracePreparedRouteWorkingProjection
} from '../../runtime/lower-dvina-trace-turn-step-prepared-effects.js';
import { fail } from './lower-dvina-trace-turn-step-persistence-support.js';

export function validateAuthoritativePreparedRoute({
  route,
  state,
  phase3Contracts
}) {
  const consequence = route.consequence;
  const movement = consequence?.movement;
  const authoritativeRoute = phase3Contracts?.route;
  const activity = phase3Contracts?.movement;
  const effect = phase3Contracts?.routeBodyEffect;
  const exactElapsed = route.time_update?.exact_elapsed?.exact_minutes;
  if (authoritativeRoute == null || activity == null || effect == null
      || consequence.phase3_kind !== 'movement'
      || consequence.duration_minutes !== authoritativeRoute.duration_minutes
      || consequence.duration_minutes !== activity.duration_minutes
      || route.time_update?.owner !== '@rus/time-events-history'
      || !samePreparedValue(route.time_update?.clock_before, state.clock)
      || exactElapsed?.numerator !== String(authoritativeRoute.duration_minutes)
      || exactElapsed?.denominator !== '1'
      || consequence.body_effect_ref !== effect.effect_profile_id
      || movement?.owner !== '@rus/movement-routes'
      || movement.activity_ref !== activity.profile_id
      || movement.route_ref !== authoritativeRoute.route_id
      || movement.source?.location_ref !== state.position?.location_ref
      || movement.source?.g5_anchor_id !== state.position?.g5_anchor_id
      || movement.destination?.location_ref !== phase3Contracts.ids.campLocation
      || movement.destination?.g5_anchor_id !== phase3Contracts.campAnchor
      || movement.destination?.zone_ref !== 'working_camp'
      || movement.result?.route_id !== authoritativeRoute.route_id
      || movement.result?.elapsed_minutes
        !== authoritativeRoute.duration_minutes) {
    preparedEffectFail(
      'prepared route differs from authoritative phase3 contracts');
  }
}

export function validatePreparedRouteTraceLineage({
  route,
  routeTrace,
  directTrace,
  loopTrace,
  envelope,
  state,
  routeOnly
}) {
  const routeRequest = routeTrace.plan_request;
  const continuation = routeTrace.approved_plan?.continuation;
  const expectedRequestRoot =
    `turn-step:${envelope.party_id}:${envelope.player_input.turn_number}`;
  let projected;
  let routeWorkingAfter;
  let playerSafeAfter;
  try {
    projected = projectLowerDvinaTracePlayerSafeState({
      committed_state: state,
      actor_id: state.actor_id
    });
    routeWorkingAfter = buildLowerDvinaTracePreparedRouteWorkingProjection({
      projection: projected.player_safe_state,
      movement: route.consequence.movement,
      committedState: state,
      clockAfter: route.time_update.clock_after
    });
    const authority =
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
    playerSafeAfter = projectLowerDvinaTracePlayerSafeState({
      committed_state: state,
      working_projection: authority.admit(routeWorkingAfter),
      working_projection_authority: authority,
      actor_id: state.actor_id
    }).player_safe_state;
  } catch (cause) {
    preparedEffectFail('prepared route lineage could not be projected', cause);
  }
  const expectedFirstStep = [{
    step_index: 1,
    summary: routeTrace.approved_plan?.interpretation?.grounded_attempt
  }];
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
      || !samePreparedValue(
        routeRequest.player_safe_state, projected.player_safe_state)
      || route.projection_before_digest
        !== canonicalDigest(projected.player_safe_state)
      || route.projection_after_digest !== canonicalDigest(routeWorkingAfter)) {
    preparedEffectFail('route trace does not bind its committed root lineage');
  }
  if (directTrace == null) return;
  const request = directTrace.plan_request;
  if (request?.request_id !== `${expectedRequestRoot}:step:2`
      || request.root_turn_id !== routeRequest.root_turn_id
      || request.committed_state_version
        !== routeRequest.committed_state_version
      || request.working_revision !== 1
      || request.step_index !== 2
      || !samePreparedValue(request.actor, routeRequest.actor)
      || request.root_player_action !== routeRequest.root_player_action
      || request.remaining_intent !== continuation?.remaining_intent
      || !samePreparedValue(request.completed_steps, expectedFirstStep)
      || !samePreparedValue(request.player_safe_state, playerSafeAfter)
      || (routeOnly && (
        loopTrace.remaining_intent !== continuation?.remaining_intent
        || !samePreparedValue(loopTrace.completed_steps, expectedFirstStep)))) {
    preparedEffectFail('step2 trace does not bind the applied route lineage');
  }
}

export function validatePreparedDirectSlice({
  batch,
  direct,
  directTrace,
  route,
  turnStepApprovedOwners
}) {
  const plan = directTrace?.approved_plan;
  const activity = directTrace?.approved_plan?.activity;
  const batchActivity = batch?.operations?.[0]?.value;
  let approved;
  try {
    approved = turnStepApprovedOwners?.semanticActivityOwner?.resolve({
      activity: structuredClone(activity),
      actor: {
        ...structuredClone(directTrace?.plan_request?.actor),
        body: structuredClone(route.body_update.state_after)
      }
    });
  } catch (cause) {
    preparedEffectFail(
      'approved direct activity owner could not be replayed', cause);
  }
  const expectedBinding = approved == null ? null : {
    kind: 'semantic_activity',
    activity_id: batchActivity?.activity_id,
    profile_ref: approved.profile_ref,
    profile_pin: structuredClone(approved.profile_pin),
    duration_class: approved.duration_class,
    effort: approved.effort,
    body_effect_profile_ref: approved.body_effect_profile_ref,
    body_effect_context: {
      kind: 'semantic_activity',
      duration_class: approved.duration_class,
      effort: approved.effort
    }
  };
  const bodyComponents = (direct.consequence?.state_changes ?? []).filter(
    ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
  if (!isPreparedDirectContinuation(plan)
      || approved == null
      || direct.effect_kind !== 'semantic_activity'
      || direct.step_index !== 2
      || directTrace?.applied !== true
      || directTrace.player_response_boundary !== true
      || directTrace.approved_plan?.resolution !== 'direct'
      || directTrace.approved_plan?.operations?.length !== 0
      || activity?.owner !== 'semantic'
      || activity.duration_class !== batchActivity?.duration_class
      || activity.effort !== batchActivity?.effort
      || batch?.operations?.length !== 1
      || batch.operations[0]?.target !== 'party_events'
      || direct.operation_ref !== batchActivity?.activity_id
      || direct.owner_ref !== approved.profile_ref
      || batchActivity?.profile_ref !== approved.profile_ref
      || batchActivity?.duration_minutes !== approved.duration_minutes
      || batchActivity?.duration_class !== approved.duration_class
      || batchActivity?.effort !== approved.effort
      || direct.consequence?.duration_minutes !== approved.duration_minutes
      || approved.body_effect_ref !== null
      || direct.body_update?.applied !== false
      || direct.body_update?.proposal !== null
      || !samePreparedValue(
        direct.body_update?.state_after, approved.body_state_after)
      || bodyComponents.length !== 1
      || !samePreparedValue(bodyComponents[0], expectedBinding)) {
    preparedEffectFail(
      'direct activity slice differs from its trace and batch');
  }
}

export function validatePreparedBodyReplay({
  route,
  direct,
  factual,
  state,
  phase3Contracts
}) {
  const routeBody = route.body_update;
  const directBody = direct?.body_update ?? null;
  const proposal = routeBody.proposal;
  if (routeBody.applied !== true
      || (directBody != null && (directBody.applied !== false
        || directBody.proposal !== null
        || !samePreparedValue(directBody.state_after, routeBody.state_after)))
      || route.body_state_before_digest !== canonicalDigest(state.body_state)
      || !samePreparedValue(factual.body_update.state_after,
        routeBody.state_after)
      || proposal?.profile_ref !== factual.consequence.body_effect_ref) {
    preparedEffectFail('prepared route body owner is incomplete');
  }
  let expected;
  try {
    expected = {
      version: 1,
      schema: 'turn_body_update',
      ...applyApprovedTraceRouteBodyEffect({
        committed_state: {
          ...structuredClone(state),
          body_state: structuredClone(state.body_state)
        },
        consequence: structuredClone(route.consequence),
        time_update: structuredClone(route.time_update),
        effect: structuredClone(phase3Contracts?.routeBodyEffect)
      })
    };
  } catch (cause) {
    preparedEffectFail('approved route body owner could not be replayed', cause);
  }
  if (!samePreparedValue(expected, routeBody)) {
    preparedEffectFail(
      'prepared route body differs from approved owner output');
  }
}

export function isPreparedDirectContinuation(plan) {
  return plan?.resolution === 'direct'
    && plan.operations?.length === 0
    && plan.activity?.owner === 'semantic'
    && plan.activity.duration_class === 'moment'
    && plan.activity.effort === 'none';
}

export function samePreparedValue(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

export function preparedEffectFail(reason, cause = null) {
  fail('TRACE_TURN_STEP_PREPARED_EFFECT_RECONCILIATION_FAILED', {
    reason,
    ...(cause == null ? {} : { cause: cause?.code ?? cause?.message })
  });
}
