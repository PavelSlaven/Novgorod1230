import { canonicalDigest } from '@rus/materialization';
import { exactShape, fail, plain, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const BODY_METRICS = ['health', 'satiety', 'energy'];

export function validateBodyEventCommit(operation, factual, state) {
  const outer = operation.payload;
  const payload = outer.payload;
  if (outer.actor_ref !== bodyActorId(factual, state)
      || outer.body_effect_ref !== payload.body_effect_ref
      || !(exactShape(payload, ['body_effect_ref', 'profile_pin',
        'selected_context', 'exact_deltas', 'state_after', 'selection_policy',
        'rng_consumption']) || exactShape(payload, ['body_effect_ref',
        'profile_pin', 'selected_context', 'exact_deltas',
        'condition_transitions', 'state_after', 'selection_policy',
        'rng_consumption']))
      || (payload.condition_transitions !== undefined
        && !Array.isArray(payload.condition_transitions))
      || !text(payload.body_effect_ref) || !validProfilePin(payload.profile_pin)
      || !exactShape(payload.selected_context,
        ['kind', 'mechanism', 'severity', 'body_part_ref'])
      || payload.selected_context.kind !== 'direct_body_event'
      || !exactShape(payload.exact_deltas, BODY_METRICS)
      || Object.values(payload.exact_deltas).some((value) => !Number.isFinite(value))
      || !plain(payload.state_after)
      || payload.selection_policy !== 'fixed_approved_effect'
      || payload.rng_consumption !== 'forbidden') {
    fail('TRACE_TURN_STEP_BODY_EVENT_OWNER_INVALID', {
      operation_id: operation.operation_id });
  }
  const components = (factual.consequence?.state_changes ?? []).filter(
    ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
  const componentIndex = components.findIndex((component) =>
    component?.kind === 'direct_body_event'
      && component.operation_id === operation.operation_id);
  const component = components[componentIndex];
  const proposals = factual.body_update?.proposal?.component_proposals;
  const proposal = Array.isArray(proposals) ? proposals[componentIndex] : null;
  const hidden = factual.hidden_update ?? factual.consequence?.hidden_update;
  const hiddenMatches = plain(hidden) && Object.values(hidden).filter(
    (value) => same(value, payload)).length;
  if (componentIndex < 0 || !exactShape(component, ['kind', 'operation_id',
    'body_effect_profile_ref', 'profile_pin', 'body_effect_context'])
      || component.body_effect_profile_ref !== payload.body_effect_ref
      || !same(component.profile_pin, payload.profile_pin)
      || !same(component.body_effect_context, payload.selected_context)
      || !Array.isArray(proposals) || proposals.length !== components.length
      || proposal?.profile_ref !== payload.body_effect_ref
      || !same(proposal.profile_pin, payload.profile_pin)
      || !same(proposal.selected_context, payload.selected_context)
      || !same(proposal.exact_deltas, payload.exact_deltas)
      || !same(proposal.state_after, payload.state_after)
      || proposal.selection_policy !== payload.selection_policy
      || proposal.rng_consumption !== payload.rng_consumption
      || hiddenMatches !== 1) reconciliationFail(operation.operation_id);
  if (!same(proposals.at(-1)?.state_after, factual.body_update?.state_after)) {
    reconciliationFail(operation.operation_id,
      'final component state_after differs from factual body_update');
  }
}

export function validateBodyComponentOrder(batch, factual, state) {
  const expected = batch.operations.flatMap((fragment) => {
    if (fragment.target === 'party_events') return [{
      kind: 'semantic_activity', ref: fragment.value.activity_id }];
    if (fragment.target === 'party_state'
        && fragment.value.operation_kind === 'apply_body_event') return [{
      kind: 'direct_body_event', ref: fragment.value.operation_id }];
    return [];
  });
  const components = (factual.consequence?.state_changes ?? []).filter(
    (component) => ['semantic_activity', 'direct_body_event'].includes(
      component?.kind));
  const actual = components.flatMap((component) => {
    if (component?.kind === 'semantic_activity') return [{
      kind: component.kind, ref: component.activity_id }];
    if (component?.kind === 'direct_body_event') return [{
      kind: component.kind, ref: component.operation_id }];
    return [];
  });
  const bodyEffectRef = factual.consequence?.body_effect_ref ?? null;
  const applied = factual.body_update?.applied === true;
  if (!same(expected, actual)) reconciliationFail(null,
    'ordered batch and consequence body components differ');
  if (bodyEffectRef != null && (!text(bodyEffectRef) || !applied)) {
    reconciliationFail(null, 'consequence body effect has no applied body owner');
  }
  if (!applied) return;
  const proposals = factual.body_update?.proposal?.component_proposals;
  const composite = factual.body_update?.proposal;
  const compositeShape = exactShape(composite, ['schema', 'profile_ref',
    'profile_pin', 'component_proposals', 'exact_deltas', 'selection_policy',
    'rng_consumption'])
    && composite.schema === 'rus.body_state.composite_fixed_effect_proposal.v1'
    && validProfilePin(composite.profile_pin)
    && validBodyDeltas(composite.exact_deltas)
    && composite.selection_policy === 'ordered_committed_step_components'
    && composite.rng_consumption === 'forbidden';
  const proposalsMatch = Array.isArray(proposals)
    && proposals.length === components.length && components.length > 0
    && components.every((component, index) => {
      const proposal = proposals[index];
      return exactShape(proposal, ['schema', 'profile_ref', 'profile_pin',
        'selected_context', 'exact_deltas', 'condition_transitions',
        'selection_policy', 'rng_consumption', 'state_after'])
        && proposal.schema === 'rus.body_state.fixed_approved_effect_proposal.v1'
        && proposal.profile_ref === component.body_effect_profile_ref
        && same(proposal.profile_pin, component.profile_pin)
        && same(composite.profile_pin, component.profile_pin)
        && same(proposal.selected_context, component.body_effect_context)
        && validBodyDeltas(proposal.exact_deltas)
        && Array.isArray(proposal.condition_transitions)
        && proposal.selection_policy === 'fixed_approved_effect'
        && proposal.rng_consumption === 'forbidden' && plain(proposal.state_after);
    });
  const summedDeltas = proposalsMatch ? Object.fromEntries(BODY_METRICS.map(
    (metric) => [metric, proposals.reduce((sum, proposal) =>
      sum + proposal.exact_deltas[metric], 0)])) : null;
  if (!compositeShape || !proposalsMatch
      || !same(composite.exact_deltas, summedDeltas)
      || (bodyEffectRef != null && composite?.profile_ref !== bodyEffectRef)) {
    reconciliationFail(null, 'ordered batch, consequence and body proposals differ');
  }
  let expectedState = structuredClone(bodyState(batch, state));
  for (const proposal of proposals) {
    expectedState = applyBodyProposal(expectedState, proposal);
    if (!same(proposal.state_after, expectedState)) reconciliationFail(null,
      'component state_after differs from persisted body arithmetic');
  }
  if (!same(factual.body_update.state_after, expectedState)) {
    reconciliationFail(null,
      'final body state differs from ordered component arithmetic');
  }
}
function bodyActorId(factual, state) {
  return factual?.consequence?.phase7?.autonomous?.request?.npc_ref
    ?? state.actor_id;
}
function bodyState(batch, state) {
  const actor = batch.operations.find(({ target, value }) =>
    target === 'party_state' && value?.operation_kind === 'apply_body_event')
    ?.value?.payload?.actor_ref ?? state.actor_id;
  return actor === state.actor_id ? state.body_state
    : state.npcs?.find(({ instance_id }) => actor === instance_id)?.check_body_state;
}
function applyBodyProposal(before, proposal) {
  if (!plain(before)) reconciliationFail(null, 'persisted body state is absent');
  const activeConditions = structuredClone(before.active_conditions ?? []);
  if (!Array.isArray(activeConditions)) reconciliationFail(null,
    'persisted body conditions are invalid');
  for (const transition of proposal.condition_transitions) {
    if (!exactShape(transition, ['from', 'to', 'outcome'])
        || !text(transition.from) || !text(transition.to)) {
      reconciliationFail(null, 'body condition transition is invalid');
    }
    const matches = activeConditions.filter(({ id }) => id === transition.from);
    if (matches.length !== 1) reconciliationFail(null,
      'body condition transition has no exact persisted source');
    matches[0].id = transition.to;
    if (text(transition.outcome)) matches[0].effect = transition.outcome;
    matches[0].cause = proposal.profile_ref;
  }
  return { ...structuredClone(before),
    ...Object.fromEntries(BODY_METRICS.map((metric) => [metric,
      Math.max(0, Math.min(100, before[metric] + proposal.exact_deltas[metric]))])),
    active_conditions: activeConditions };
}
function validBodyDeltas(value) {
  return exactShape(value, BODY_METRICS)
    && BODY_METRICS.every((metric) => Number.isSafeInteger(value[metric]));
}
function validProfilePin(value) {
  return exactShape(value, ['artifact_id', 'revision', 'digest'])
    && text(value.artifact_id) && Number.isSafeInteger(value.revision)
    && value.revision >= 1 && typeof value.digest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.digest);
}
function reconciliationFail(operationId, reason = null) {
  fail('TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED', {
    operation_id: operationId, ...(reason == null ? {} : { reason }) });
}
function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}
