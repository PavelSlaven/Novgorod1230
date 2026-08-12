import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLegalConsequencePackage, buildSocialRisk,
  buildTemporaryDispositionProposal, evaluateRights, planPromiseLifecycle,
  PromiseLifecyclePlanningError, resolveTemporaryDispositionOptions,
  validateSocialBinding } from '../src/index.js';

const policy = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d/promise-policy.json'), 'utf8'));
const phase9 = JSON.parse(readFileSync(resolve(import.meta.dirname,
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m5-content/phase-9-bindings.json'), 'utf8'));
const dispositionContract = phase9.temporary_disposition.approved_contract;
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

test('social-law owns temporary disposition applicability and typed proposal',
  () => {
    assert.equal(dispositionContract.version, 2);
    assert.deepEqual(dispositionContract.supersedes_contract_ref, {
      contract_id: dispositionContract.contract_id, version: 1 });
    const optionSet = resolveTemporaryDispositionOptions({
      committed_fact_ids: [
        'ratsha_surrender_without_further_harm_committed',
        'zhdanko_submission_committed', 'sealed_packet_returned',
        'promise_current_active'],
      committed_actor_predicates: [
        'ratsha_storehouse_helper:at_fishing_camp',
        'ratsha_storehouse_helper:not_in_temporary_custody'],
      committed_witness_slots: ['eremey_fisher',
        'trace_ld_v1_audience_slot_participating_fisher'],
      committed_property_owner_ref:
        'trace_ld_v1_external_owner_savva_tverdich',
      contract: dispositionContract });
    assert.deepEqual(optionSet.eligible_option_ids.promise, [
      'preserve_active_no_summary_killing_promise',
      'commit_scope_breach_for_active_promise']);
    const selection = { schema: 'temporary_disposition_selection_v1',
      contract_ref: dispositionContract.contract_id,
      contract_revision: dispositionContract.version,
      selected_option_ids: {
        custody: 'hold_ratsha_and_zhdanko_for_authorized_handover',
        property: 'preserve_recovered_property_for_savva_handover',
        promise: 'preserve_active_no_summary_killing_promise' } };
    const proposal = buildTemporaryDispositionProposal({
      contract: dispositionContract, option_set: optionSet, selection });
    assert.equal(proposal.legal_effect, 'temporary_disposition_only');
    assert.deepEqual(proposal.selected_option_ids,
      selection.selected_option_ids);
    assert.deepEqual(proposal.custody_state, {
      schema: 'temporary_custody_state_v1',
      option_id: 'hold_ratsha_and_zhdanko_for_authorized_handover',
      status: 'temporary',
      party_slots: ['ratsha_storehouse_helper',
        'zhdanko_storehouse_controller'],
      committed_fact_id:
        'temporary_custody_both_for_authorized_handover' });
    assert.deepEqual(proposal.property_handover_plan, {
      schema: 'temporary_property_handover_plan_v1',
      option_id: 'preserve_recovered_property_for_savva_handover',
      status: 'temporary',
      owner_must_remain: 'trace_ld_v1_external_owner_savva_tverdich',
      property_mutation: null,
      committed_fact_id:
        'temporary_property_preserved_for_authorized_handover' });
    assert.deepEqual(proposal.promise_memory, {
      schema: 'temporary_promise_memory_v1',
      option_id: 'preserve_active_no_summary_killing_promise',
      status: 'recorded',
      scope: 'no_summary_killing_after_surrender_and_no_further_harm',
      committed_fact_id: 'temporary_promise_obligation_preserved' });
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
