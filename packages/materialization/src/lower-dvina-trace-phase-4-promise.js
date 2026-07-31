import { planPromiseLifecycle } from '@rus/social-law';
import { canonicalDigest, deterministicInstanceId } from './core.js';

export function buildLowerDvinaTracePhase4Promise({
  input,
  runId,
  bundle,
  playerId,
  phase3Prepared,
  phase4Prepared,
  participatingFisher,
  fail
}) {
  const binding = phase4Prepared.binding.promise_initial_binding;
  const eremey = phase3Prepared.npcs.find(
    (npc) => npc.participant_slot_ref === 'eremey_fisher'
  );
  const fisher = phase3Prepared.npcs.find(
    (npc) => npc.participant_slot_ref === participatingFisher
  );
  const promisePolicy = bundle.promise_policy;
  if (!eremey || !fisher
    || binding?.policy_ref !== promisePolicy.policy_id
    || binding.promisor_ref !== promisePolicy.parties.promisor_slot
    || binding.beneficiary_ref !== promisePolicy.parties.beneficiary_slot
    || canonicalDigest(binding.witness_refs)
      !== canonicalDigest(promisePolicy.witness_binding.required_witness_slots)
    || binding.scope_source !== 'approved_promise_policy_scope'
    || binding.initial_state !== 'not_offered'
    || binding.initial_state_fact !== 'promise_current_not_offered'
    || binding.selection_policy !== 'fixed_approved_initial_state'
    || binding.rng_consumption !== 'forbidden') {
    fail('TRACE_PHASE_4_PROMISE_BINDING_INVALID', 'The exact approved promise initialization binding is required.');
  }
  const proposal = planPromiseLifecycle({
    policy: promisePolicy,
    operation: 'initialize',
    parties: structuredClone(promisePolicy.parties),
    witness_slots: [...promisePolicy.witness_binding.required_witness_slots],
    scope: structuredClone(promisePolicy.scope),
    current_state: null,
    causal_basis: { committed_fact_ids: [] }
  });
  return {
    instance_id: deterministicInstanceId(input.party_id, runId, 'promise', binding.policy_ref, 0),
    policy_ref: {
      id: promisePolicy.policy_id,
      revision: promisePolicy.revision,
      digest: bundle.artifact_pins.promise_policy.digest
    },
    promisor_actor_id: playerId,
    beneficiary_actor_id: phase4Prepared.ratsha.instance_id,
    witness_actor_ids: [eremey.instance_id, fisher.instance_id],
    witness_slot_bindings: {
      eremey_fisher: eremey.instance_id,
      trace_ld_v1_audience_slot_participating_fisher: fisher.instance_id
    },
    scope_snapshot: structuredClone(promisePolicy.scope),
    current_state: binding.initial_state,
    current_state_fact: binding.initial_state_fact,
    state_version: 1,
    initialization_proposal: structuredClone(proposal)
  };
}
