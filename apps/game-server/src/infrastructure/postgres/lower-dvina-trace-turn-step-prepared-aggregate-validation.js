import { buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate } from '@rus/turn';
import { isPreparedDirectContinuation, preparedEffectFail,
  samePreparedValue } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { samePreparedTimeBase } from
  './lower-dvina-trace-turn-step-prepared-effect-values.js';

const DEFERRED_DOMAIN_OPERATIONS = new Set(['request_discovery',
  'request_container_access', 'request_movement', 'request_item_use',
  'request_activity', 'emit_interaction', 'request_combat']);

export function validateRouteOnlyBoundaryTrace({ routeTrace, directTrace,
  loopTrace }) {
  const continuation = routeTrace.approved_plan?.continuation;
  const deferredRequired = routeTrace.approved_plan?.goal_result === 'pending'
    && continuation != null;
  if (directTrace == null) {
    if (deferredRequired) preparedEffectFail(
      'pending route continuation lacks its deferred step');
    return;
  }
  if (!deferredRequired) preparedEffectFail(
    'terminal route has an unexpected deferred step');
  const plan = directTrace.approved_plan;
  const resolution = plan?.resolution;
  const operation = plan?.operations?.[0];
  const clarification = resolution === 'clarification_required';
  const deferredDomain = resolution === 'domain_request'
    && plan.activity?.owner === 'domain' && plan.operations?.length === 1
    && DEFERRED_DOMAIN_OPERATIONS.has(operation?.op);
  const deferredCheck = resolution === 'generic_check'
    && plan.operations?.length === 0 && plan.check != null;
  const deferredDirect = resolution === 'direct'
    && !isPreparedDirectContinuation(plan);
  const deferredClarification = clarification
    && plan.operations?.length === 0 && plan.clarification != null
    && samePreparedValue(plan.clarification, loopTrace.clarification);
  if (directTrace.step_index !== 2 || directTrace.working_revision !== 1
      || directTrace.applied !== false
      || directTrace.player_response_boundary !== true
      || directTrace.check_binding !== null || directTrace.check_outcome !== null
      || directTrace.plan_request?.step_index !== 2
      || directTrace.plan_request?.working_revision !== 1
      || loopTrace.working_revision !== 1
      || loopTrace.status !== 'player_response_required'
      || loopTrace.stop_reason !== (clarification
        ? 'clarification_required' : 'player_response')
      || (!clarification && loopTrace.clarification !== null)
      || ![deferredDomain, deferredCheck, deferredDirect,
        deferredClarification].some(Boolean)) {
    preparedEffectFail('route-only boundary trace is not an exact deferred step');
  }
}
export function validatePreparedEnvelopeAggregate({ ledger, envelope, factual }) {
  const consequence = envelope?.consequence;
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  const totalDuration = Number(expectedTime.exact_elapsed.exact_minutes.numerator);
  if (consequence?.prepared_effect_ledger_digest !== ledger.ledger_digest
      || consequence.duration_minutes !== totalDuration
      || !samePreparedTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(consequence.visible_seed?.completed_steps ?? null,
        envelope.loop_trace?.completed_steps ?? null)
      || !samePreparedValue(consequence.visible_seed?.clarification ?? null,
        envelope.loop_trace?.clarification ?? null)) {
    preparedEffectFail('prepared aggregate differs from its ordered ledger');
  }
  for (const slice of ledger.slices) {
    validatePreparedConsequenceContribution(slice, consequence);
  }
}
function validatePreparedConsequenceContribution(slice, consequence) {
  const fragment = structuredClone(slice.consequence);
  for (const seed of Object.values(fragment.visible_seed ?? {})) {
    if (seed?.kind === 'semantic_activity') seed.duration_minutes = Number(
      slice.time_update.exact_elapsed.exact_minutes.numerator);
  }
  const merged = new Set(['duration_minutes', 'visible_seed', 'hidden_update',
    'state_changes', 'suggested_actions', 'prepared_effect_ledger_digest',
    'activity_attempt_id']);
  for (const [key, value] of Object.entries(fragment)) {
    if (!merged.has(key) && !samePreparedValue(value, consequence[key])) {
      preparedEffectFail(`prepared consequence differs on ${key}`);
    }
  }
  for (const key of ['visible_seed', 'hidden_update']) {
    for (const [name, value] of Object.entries(fragment[key] ?? {})) {
      if (!containsPreparedValue(consequence[key]?.[name], value)) {
        preparedEffectFail(`prepared consequence differs on ${key}.${name}`);
      }
    }
  }
  for (const key of ['state_changes', 'suggested_actions']) {
    const actual = consequence[key] ?? [];
    if ((fragment[key] ?? []).some((value) => !actual.some((candidate) =>
      samePreparedValue(value, candidate)))) {
      preparedEffectFail(`prepared consequence omits ${key}`);
    }
  }
}
function containsPreparedValue(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual)
    && expected.every((value) => actual.some((candidate) =>
      containsPreparedValue(candidate, value)));
  if (expected != null && typeof expected === 'object') {
    return actual != null && typeof actual === 'object' && !Array.isArray(actual)
      && Object.entries(expected).every(([key, value]) =>
        containsPreparedValue(actual[key], value));
  }
  return samePreparedValue(actual, expected);
}
