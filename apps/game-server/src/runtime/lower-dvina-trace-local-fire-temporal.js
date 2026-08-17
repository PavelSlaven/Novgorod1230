import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../infrastructure/postgres/local-fire-atomic-write-plan.js';

export function lowerDvinaTraceLocalFireTemporalRegistration(profile) {
  requireProfile(profile);
  const ruleRef = versioned('world_process_rule',
    'local_exact_fire_due_v1', '1');
  const policyRef = versioned('world_process_policy', profile.policy_ref,
    String(profile.policy_version));
  return Object.freeze({
    rule_ref: ruleRef, policy_ref: policyRef,
    resolve(candidate, context) {
      const processRef = candidate?.source_ref?.entity_kind
        === 'local_world_process' ? candidate.source_ref.entity_id : null;
      const runtime = findRuntime(context?.projection, processRef);
      const request = context?.request;
      if (runtime == null || request?.idempotency_context == null
          || !exactCandidate(candidate, runtime, ruleRef, policyRef)) {
        fail('LOCAL_FIRE_TEMPORAL_CONTEXT_STALE');
      }
      const atomicPlan = createLocalFireAtomicWritePlan({
        schema: 'local_fire_atomic_write_request_v1',
        party_id: runtime.party_id,
        base_party_state_version: Number(request.base_state_version),
        change_set_id: request.idempotency_context.change_set_id,
        actor_ref: 'system:local_fire_boundary',
        authority_pin: runtime.authority_pin,
        ignition_basis_pin: runtime.ignition_basis_pin,
        process_state: runtime.process_state,
        fuel_pins: runtime.fuel_pins,
        action: 'due_boundary', at_timestamp: candidate.scheduled_at,
        causal_identity: {
          request_id: request.idempotency_context.idempotency_key,
          root_turn_id: request.turn_id,
          action_ref: `local-fire-boundary:${candidate.boundary_id}`,
          step_index: 1
        }
      });
      const ownerKeys = Object.freeze(['actor:system:local_fire_boundary']);
      const physicalKeys = Object.freeze(localFirePhysicalKeys(atomicPlan));
      const proposalId = `local-fire:${processRef}:due`;
      const candidateEvidence = Object.freeze({
        schema: 'rus.turn.local_fire_temporal_candidate_evidence.v1',
        rule_ref: structuredClone(ruleRef),
        policy_ref: structuredClone(policyRef),
        candidate_snapshot: structuredClone(candidate),
        candidate_digest: digest(candidate),
        local_fire_write_plan_digest: atomicPlan.write_plan_digest,
        resolution_identity_digest: digest({ proposal_id: proposalId,
          local_fire_write_plan_digest: atomicPlan.write_plan_digest,
          owner_keys: ownerKeys, physical_keys: physicalKeys })
      });
      return Object.freeze({ disposition: 'execute', follow_up_candidates: [],
        proposals: [Object.freeze({
          proposal_id: proposalId,
          local_fire_atomic_write_plan: atomicPlan,
          owner_keys: ownerKeys, physical_keys: physicalKeys,
          temporal_candidate_evidence: candidateEvidence
        })] });
    }
  });
}

function exactCandidate(candidate, runtime, ruleRef, policyRef) {
  const process = runtime.process_state;
  const expectedBoundary = `local-fire:${process.process_ref}:state:${
    process.state_version}`;
  const subjects = process.fuel_bindings.map(({ fuel_ref: ref }) =>
    ({ entity_kind: 'item', entity_id: ref }));
  const keys = ['boundary_id','boundary_kind','scheduled_at','source_ref',
    'primary_subject_ref','scope_ref','rule_ref','policy_ref',
    'preconditions_digest','resolution_class','interrupt_effect',
    'visibility_policy_ref','idempotency_key','subject_refs',
    'causal_parent_refs'];
  return candidate && Object.getPrototypeOf(candidate) === Object.prototype
    && Object.keys(candidate).length === keys.length
    && keys.every((key) => Object.hasOwn(candidate, key))
    && candidate.boundary_id === expectedBoundary
    && candidate.boundary_kind === 'world_process'
    && digest(candidate.scheduled_at) === digest(process.next_boundary_at)
    && digest(candidate.source_ref) === digest({
      entity_kind: 'local_world_process', entity_id: process.process_ref })
    && digest(candidate.primary_subject_ref) === digest(subjects[0])
    && digest(candidate.scope_ref) === digest({
      entity_kind: 'party', entity_id: runtime.party_id })
    && digest(candidate.rule_ref) === digest(ruleRef)
    && digest(candidate.policy_ref) === digest(policyRef)
    && candidate.preconditions_digest === digest({ process_state: process,
      expected_state_version: process.state_version })
    && candidate.resolution_class === 'local_exact_fire_due'
    && candidate.interrupt_effect === 'background'
    && digest(candidate.visibility_policy_ref) === digest(policyRef)
    && candidate.idempotency_key === expectedBoundary
    && digest(candidate.subject_refs) === digest(subjects)
    && Array.isArray(candidate.causal_parent_refs)
    && candidate.causal_parent_refs.length === 0;
}

function findRuntime(projection, processRef) {
  const candidates = [projection, projection?.phase6_state,
    projection?.world_state, projection?.conversation_state?.world_state];
  for (const candidate of candidates) {
    const found = candidate?.local_fire_runtime?.find?.(
      ({ process_state: state }) => state?.process_ref === processRef);
    if (found != null) return found;
  }
  return null;
}
function requireProfile(value) {
  if (value?.schema !== 'rus.lower_dvina_trace_local_fire_profile.v1'
      || value.status !== 'approved' || value.revision !== 1) {
    throw new TypeError('Exact local-fire profile is required.');
  }
}
function versioned(entity_kind, entity_id, authoring_version) {
  return { entity_ref: { entity_kind, entity_id }, authoring_version };
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
