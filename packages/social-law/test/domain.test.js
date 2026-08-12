import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLegalConsequencePackage, buildSocialRisk, evaluateRights, planPromiseLifecycle, PromiseLifecyclePlanningError, validateSocialBinding } from '../src/index.js';

const policy = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d/promise-policy.json'), 'utf8'));
const parties = { promisor_slot:'player_clerk', beneficiary_slot:'ratsha_storehouse_helper' };
const witness_slots = ['eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'];
const scope = {
  obligation:'prevent_immediate_killing_or_revenge_without_hearing',
  conditions:['ratsha_surrenders', 'ratsha_causes_no_further_harm'],
  does_not_mean:['pardon', 'innocence', 'immunity', 'release', 'freedom_from_accountability', 'final_judgment']
};

test('social-law evaluates only supplied rights and packages risk for approval', () => {
  const binding = { actor_id:'a', region_id:'r', social_role_id:'role', rights:['trade'], restrictions:['carry_sword'] };
  assert.equal(validateSocialBinding(binding).ok, true);
  assert.equal(evaluateRights(binding, { right_id:'trade' }).decision, 'allowed');
  assert.equal(evaluateRights(binding, { right_id:'carry_sword' }).decision, 'forbidden');
  const risk = buildSocialRisk({ actor_id:'a', witness_ids:['w'], violation_ids:['v'], base_severity:1 });
  assert.equal(risk.severity, 2);
  assert.equal(buildLegalConsequencePackage({ actor_id:'a', risk }).approval_required, true);
});

test('promise lifecycle planner produces only approved initialization, offer, and activation proposals', () => {
  const initialize = planPromiseLifecycle({ policy, operation:'initialize', parties, witness_slots, scope, current_state:null, causal_basis:{ committed_fact_ids:[] } });
  assert.deepEqual(initialize.current_state_projection, {
    state_slot:'trace_ld_v1_promise_no_summary_killing_current_state', expected_previous_fact:null,
    next_fact:'promise_current_not_offered', replace_previous_projection:false, superseded_current_facts:[]
  });

  const offer = planPromiseLifecycle({
    policy, operation:'offer', parties, witness_slots, scope,
    current_state:{ state_slot:'trace_ld_v1_promise_no_summary_killing_current_state', fact_id:'promise_current_not_offered' },
    causal_basis:{ committed_fact_ids:['promisor_offer_committed', 'required_witnesses_present'] }
  });
  assert.equal(offer.history_event.fact_id, 'promise_offered');
  assert.equal(offer.current_state_projection.next_fact, 'promise_current_offered');

  const activate = planPromiseLifecycle({
    policy, operation:'activate', parties, witness_slots, scope,
    current_state:{ state_slot:'trace_ld_v1_promise_no_summary_killing_current_state', fact_id:'promise_current_offered' },
    causal_basis:{ committed_fact_ids:['promise_activation_basis_committed'] }
  });
  assert.equal(activate.history_event.fact_id, 'promise_activated');
  assert.equal(activate.current_state_projection.next_fact, 'promise_current_active');
  assert.equal(Object.isFrozen(activate), true);
});

test('promise lifecycle planner fails closed on policy, parties, witnesses, scope, state, and causal basis mismatches', () => {
  const input = {
    policy, operation:'offer', parties, witness_slots, scope,
    current_state:{ state_slot:'trace_ld_v1_promise_no_summary_killing_current_state', fact_id:'promise_current_not_offered' },
    causal_basis:{ committed_fact_ids:['promisor_offer_committed', 'required_witnesses_present'] }
  };
  const cases = [
    [{ ...policy, owner:'@rus/other-owner' }, 'PROMISE_POLICY_INVALID'],
    [{ ...parties, promisor_slot:'other' }, 'PROMISE_PARTIES_MISMATCH'],
    [['eremey_fisher'], 'PROMISE_WITNESSES_MISMATCH'],
    [{ ...scope, does_not_mean:scope.does_not_mean.slice(1) }, 'PROMISE_SCOPE_MISMATCH'],
    [{ state_slot:'trace_ld_v1_promise_no_summary_killing_current_state', fact_id:'promise_current_offered' }, 'PROMISE_CURRENT_STATE_CONFLICT'],
    [{ committed_fact_ids:['promisor_offer_committed'] }, 'PROMISE_CAUSAL_BASIS_INVALID']
  ];
  for (const [value, code] of cases) {
    const candidate = structuredClone(input);
    if (code === 'PROMISE_POLICY_INVALID') candidate.policy = value;
    else if (code === 'PROMISE_PARTIES_MISMATCH') candidate.parties = value;
    else if (code === 'PROMISE_WITNESSES_MISMATCH') candidate.witness_slots = value;
    else if (code === 'PROMISE_SCOPE_MISMATCH') candidate.scope = value;
    else if (code === 'PROMISE_CURRENT_STATE_CONFLICT') candidate.current_state = value;
    else candidate.causal_basis = value;
    assert.throws(() => planPromiseLifecycle(candidate), (error) => error instanceof PromiseLifecyclePlanningError && error.code === code);
  }
  assert.throws(
    () => planPromiseLifecycle({ ...input, operation:'fulfill' }),
    (error) => error instanceof PromiseLifecyclePlanningError && error.code === 'PROMISE_OPERATION_NOT_ALLOWED'
  );
});
