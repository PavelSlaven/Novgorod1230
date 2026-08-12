import { deepFreeze } from '@rus/kernel';

export {
  PartyLocalCommitmentPlanningError,
  planPartyLocalCommitment
} from './party-local-commitment.js';
export {
  buildTemporaryDispositionProposal,
  resolveTemporaryDispositionOptions,
  TemporaryDispositionPlanningError
} from './temporary-disposition.js';
const SUPPORTED_PROMISE_OPERATIONS = new Set([
  'initialize', 'offer', 'activate', 'fulfill', 'break'
]);

export class PromiseLifecyclePlanningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PromiseLifecyclePlanningError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function validateSocialBinding(binding = {}) {
  const errors = [];
  if (!text(binding.actor_id)) errors.push('actor_id is required');
  if (!text(binding.region_id)) errors.push('region_id is required');
  if (!text(binding.social_role_id)) errors.push('social_role_id is required');
  if (binding.occupation_ids != null && !Array.isArray(binding.occupation_ids)) errors.push('occupation_ids must be an array');
  return { ok: errors.length === 0, errors };
}

export function evaluateRights(binding = {}, action = {}) {
  const requested = text(action.right_id ?? action.action_type);
  const rights = new Set(strings(binding.rights ?? binding.allowed_actions));
  const restrictions = new Set(strings(binding.restrictions ?? binding.forbidden_actions));
  let decision = 'unknown';
  if (requested && restrictions.has(requested)) decision = 'forbidden';
  else if (requested && rights.has(requested)) decision = 'allowed';
  return deepFreeze({ actor_id:text(binding.actor_id) || null, right_id:requested || null, decision, requires_permission:decision === 'unknown' && Boolean(action.requires_permission) });
}

export function validateAuthorityReference(reference = {}) {
  const errors = [];
  if (!text(reference.authority_id)) errors.push('authority_id is required');
  if (!text(reference.region_id)) errors.push('region_id is required');
  if (!text(reference.authority_type)) errors.push('authority_type is required');
  return { ok: errors.length === 0, errors };
}

export function buildSocialRisk(input = {}) {
  const witnesses = Array.isArray(input.witness_ids) ? input.witness_ids.map(text).filter(Boolean) : [];
  const violations = Array.isArray(input.violation_ids) ? input.violation_ids.map(text).filter(Boolean) : [];
  const severity = Math.max(0, Math.min(4, (finite(input.base_severity) ?? 0) + (witnesses.length ? 1 : 0) + (violations.length > 1 ? 1 : 0)));
  return deepFreeze({ actor_id:text(input.actor_id) || null, action_id:text(input.action_id) || null, witness_ids:witnesses, violation_ids:violations, severity, requires_semantic_resolution:severity > 0 });
}

export function buildLegalConsequencePackage(input = {}) {
  const risk = input.risk && typeof input.risk === 'object' ? structuredClone(input.risk) : buildSocialRisk(input);
  return deepFreeze({
    actor_id:text(input.actor_id) || null,
    authority_id:text(input.authority_id) || null,
    jurisdiction_id:text(input.jurisdiction_id) || null,
    alleged_violation_ids:Array.isArray(input.alleged_violation_ids) ? input.alleged_violation_ids.map(text).filter(Boolean) : [],
    evidence_refs:Array.isArray(input.evidence_refs) ? structuredClone(input.evidence_refs) : [],
    witness_ids:Array.isArray(input.witness_ids) ? input.witness_ids.map(text).filter(Boolean) : [],
    risk,
    proposed_consequences:Array.isArray(input.proposed_consequences) ? structuredClone(input.proposed_consequences) : [],
    approval_required:true
  });
}

/**
 * Builds one approved promise lifecycle write proposal from supplied committed facts.
 * This is deliberately not a lifecycle executor or persistence adapter.
 */
export function planPromiseLifecycle(input = {}) {
  const operation = text(input.operation);
  if (!SUPPORTED_PROMISE_OPERATIONS.has(operation)) {
    fail('PROMISE_OPERATION_NOT_ALLOWED', 'Promise operation is not allowed.', { operation });
  }
  const definition = validatePromisePolicy(input.policy, operation);
  validateExactValue('PROMISE_PARTIES_MISMATCH', 'Promise parties do not match the approved policy.', input.parties, input.policy.parties);
  validateExactValue('PROMISE_WITNESSES_MISMATCH', 'Promise witnesses do not match the approved policy.', input.witness_slots, input.policy.witness_binding.required_witness_slots);
  validateExactValue('PROMISE_SCOPE_MISMATCH', 'Promise scope does not match the approved policy.', input.scope, input.policy.scope);
  validateCurrentState(input.current_state, definition);
  validateCausalBasis(input.causal_basis, definition.requires);

  return deepFreeze({
    kind:'social_obligation_proposal',
    policy_ref:{
      policy_id:input.policy.policy_id,
      revision:input.policy.revision
    },
    operation,
    parties:structuredClone(input.policy.parties),
    witness_slots:[...input.policy.witness_binding.required_witness_slots],
    scope:structuredClone(input.policy.scope),
    causal_basis:{ committed_fact_ids:[...definition.requires] },
    ...(definition.history_event ? { history_event:{ fact_id:definition.history_event, storage:'append_only' } } : {}),
    current_state_projection:{
      state_slot:definition.state_slot,
      expected_previous_fact:definition.previous_fact,
      next_fact:definition.next_fact,
      replace_previous_projection:definition.previous_fact !== null,
      superseded_current_facts:definition.previous_fact ? [definition.previous_fact] : []
    }
  });
}

export function planTemporaryDispositionPromiseOutcome(input = {}) {
  const proposal = input.disposition_proposal;
  const promise = input.current_promise;
  if (!plainObject(proposal)
      || proposal.schema !== 'temporary_disposition_proposal_v1'
      || !Array.isArray(proposal.committed_fact_outputs)
      || !plainObject(proposal.promise_memory)) {
    fail('PROMISE_DISPOSITION_PROPOSAL_INVALID',
      'Temporary disposition proposal is required.');
  }
  if (promise == null) {
    if (proposal.promise_memory.option_id !== 'record_no_active_promise') {
      fail('PROMISE_CURRENT_STATE_CONFLICT',
        'Missing promise is admitted only by the authored no-promise option.');
    }
    return deepFreeze({ kind:'no_active_promise', transition:null,
      recognized_current_state:null, basis_fact_id:null });
  }
  const state = text(promise.current_state);
  const stateFact = text(promise.current_state_fact);
  if (stateFact !== `promise_current_${state}`) {
    fail('PROMISE_CURRENT_STATE_CONFLICT',
      'Promise current-state fact does not match its state.');
  }
  if (['fulfilled', 'broken'].includes(state)) {
    const expectedOption = state === 'fulfilled'
      ? 'recognize_fulfilled_promise'
      : 'recognize_broken_promise';
    if (proposal.promise_memory.option_id !== expectedOption) {
      fail('PROMISE_CURRENT_STATE_CONFLICT',
        'Terminal promise requires its exact authored recognition option.');
    }
    return deepFreeze({ kind:'terminal_state_recognized', transition:null,
      recognized_current_state:state, basis_fact_id:null });
  }
  if (['not_offered', 'offered'].includes(state)
      && proposal.promise_memory.option_id === 'record_no_active_promise') {
    return deepFreeze({ kind:'no_active_promise', transition:null,
      recognized_current_state:state, basis_fact_id:null });
  }
  if (state !== 'active') {
    fail('PROMISE_CURRENT_STATE_CONFLICT',
      'Temporary disposition cannot transition this promise state.', {
        current_state:state
      });
  }
  const facts = new Set(proposal.committed_fact_outputs);
  const projections = (input.policy?.lifecycle_input_projections ?? []).filter(
    (candidate) => candidate?.required_current_state_fact === stateFact
      && Array.isArray(candidate.source_committed_facts)
      && candidate.source_committed_facts.every((fact) => facts.has(fact))
      && text(candidate.projected_committed_fact));
  if (projections.length !== 1) {
    fail('PROMISE_DISPOSITION_BASIS_AMBIGUOUS',
      'Disposition must produce one approved promise lifecycle basis.');
  }
  const basis = projections[0].projected_committed_fact;
  const transition = (input.policy.transitions ?? []).find((candidate) =>
    candidate?.from === 'active'
      && Array.isArray(candidate.requires)
      && sameValue(candidate.requires, [basis]));
  if (transition == null || !['fulfilled', 'broken'].includes(transition.to)) {
    fail('PROMISE_POLICY_INVALID',
      'Disposition lifecycle transition is missing.');
  }
  const operation = transition.to === 'fulfilled' ? 'fulfill' : 'break';
  return deepFreeze({ kind:'lifecycle_transition', basis_fact_id:basis,
    recognized_current_state:null, transition:planPromiseLifecycle({
      policy:input.policy, operation,
      parties:structuredClone(input.policy.parties),
      witness_slots:[...input.policy.witness_binding.required_witness_slots],
      scope:structuredClone(input.policy.scope), current_state:{
        state_slot:input.policy.history_and_current_state_contract
          .current_state_slot, fact_id:stateFact
      }, causal_basis:{ committed_fact_ids:[basis] }
    }) });
}

function validatePromisePolicy(policy, operation) {
  if (!plainObject(policy)) fail('PROMISE_POLICY_INVALID', 'Promise policy must be a plain object.');
  if (policy.schema !== 'rus.trace_promise_policy.v1'
    || !text(policy.policy_id)
    || !Number.isInteger(policy.revision)
    || policy.revision < 1
    || policy.owner !== '@rus/social-law'
    || policy.fallback_policy !== 'forbidden'
    || policy.normalization_policy !== 'forbidden'
    || policy.alias_policy !== 'forbidden'
    || !Array.isArray(policy.owner_contracts)
    || !policy.owner_contracts.includes('@rus/social-law:social_obligation_proposal')
    || !plainObject(policy.parties)
    || !text(policy.parties.promisor_slot)
    || !text(policy.parties.beneficiary_slot)
    || !plainObject(policy.scope)
    || !Array.isArray(policy.scope.conditions)
    || !Array.isArray(policy.scope.does_not_mean)
    || !Array.isArray(policy.witness_binding?.required_witness_slots)
    || policy.witness_binding.required_witness_slots.length < 1
    || new Set(policy.witness_binding.required_witness_slots).size
      !== policy.witness_binding.required_witness_slots.length) {
    fail('PROMISE_POLICY_INVALID', 'Promise policy does not satisfy the owner contract.');
  }
  const lifecycle = policy.history_and_current_state_contract;
  if (!plainObject(lifecycle)
    || lifecycle.history_event_storage !== 'append_only'
    || lifecycle.current_state_cardinality !== 'exactly_one'
    || lifecycle.current_state_projection_write !== 'replace_previous_projection_atomically'
    || lifecycle.history_events_as_current_state_or_completion_input !== 'forbidden'
    || !text(lifecycle.current_state_slot)
    || !text(lifecycle.initial_current_state_fact)
    || !Array.isArray(policy.states)
    || policy.states.length < 3
    || policy.states[0] !== 'not_offered'
    || policy.states[1] !== 'offered'
    || policy.states[2] !== 'active') {
    fail('PROMISE_POLICY_INVALID', 'Promise lifecycle state contract is incomplete.');
  }
  if (operation === 'initialize') {
    return {
      from:null,
      to:policy.states[0],
      history_event:null,
      previous_fact:null,
      next_fact:lifecycle.initial_current_state_fact,
      state_slot:lifecycle.current_state_slot,
      requires:[]
    };
  }
  const statePair = operation === 'offer'
    ? [policy.states[0], policy.states[1]]
    : operation === 'activate'
      ? [policy.states[1], policy.states[2]]
      : operation === 'fulfill'
        ? ['active', 'fulfilled'] : ['active', 'broken'];
  const [from, to] = statePair;
  const matches = (policy.transitions ?? []).filter(
    (transition) => transition?.from === from && transition?.to === to
  );
  if (matches.length !== 1) {
    fail('PROMISE_POLICY_INVALID', 'Promise lifecycle transition is missing or ambiguous.', { operation });
  }
  const transition = matches[0];
  const projection = transition.current_state_projection;
  if (!Array.isArray(transition.requires)
    || !text(transition.history_event_output)
    || projection?.state_slot !== lifecycle.current_state_slot
    || !text(projection.expected_previous_fact)
    || !text(projection.next_fact)
    || projection.replace_previous_projection !== true
    || !sameValue(projection.superseded_current_facts, [projection.expected_previous_fact])) {
    fail('PROMISE_POLICY_INVALID', 'Promise lifecycle transition projection is incomplete.', { operation });
  }
  if (operation === 'offer'
    && (policy.offer_timing?.offer_is_active_fact !== false
      || !text(policy.offer_timing.must_precede_check_ref))) {
    fail('PROMISE_POLICY_INVALID', 'Promise offer timing is incomplete.');
  }
  if (['activate', 'fulfill', 'break'].includes(operation)) {
    const projections = (policy.lifecycle_input_projections ?? []).filter(
      (projectionInput) =>
        projectionInput?.required_current_state_fact === projection.expected_previous_fact
        && projectionInput?.projected_committed_fact
          && transition.requires.includes(projectionInput.projected_committed_fact)
    );
    if (projections.length !== 1) {
      fail('PROMISE_POLICY_INVALID', 'Promise activation causal projection is missing or ambiguous.');
    }
  }
  return {
    from,
    to,
    history_event:transition.history_event_output,
    previous_fact:projection.expected_previous_fact,
    next_fact:projection.next_fact,
    state_slot:projection.state_slot,
    requires:[...transition.requires]
  };
}

function validateCurrentState(currentState, definition) {
  if (definition.previous_fact === null) {
    if (currentState !== null) fail('PROMISE_CURRENT_STATE_CONFLICT', 'Initialization requires no current state projection.', { current_state:currentState });
    return;
  }
  validateExactValue(
    'PROMISE_CURRENT_STATE_CONFLICT',
    'Current promise state does not match the required transition source.',
      currentState,
    { state_slot:definition.state_slot, fact_id:definition.previous_fact }
  );
}

function validateCausalBasis(causalBasis, requiredFacts) {
  validateExactValue(
    'PROMISE_CAUSAL_BASIS_INVALID',
    'Committed causal basis does not match the approved transition requirements.',
    causalBasis,
    { committed_fact_ids:requiredFacts }
  );
}

function validateExactValue(code, message, actual, expected) {
  if (!sameValue(actual, expected)) fail(code, message, { expected, actual });
}

function fail(code, message, details) { throw new PromiseLifecyclePlanningError(code, message, details); }
function sameValue(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }

function strings(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
