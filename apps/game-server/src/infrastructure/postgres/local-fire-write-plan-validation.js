import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  './local-fire-atomic-write-plan.js';

export function validLocalFireExtension(plan) {
  const localFire = plan.local_fire_atomic_write_plan;
  if (localFire == null) return plan.local_fire_temporal_evidence == null;
  try {
    const sealed = createLocalFireAtomicWritePlan(localFire);
    const causal = sealed.transition_proposal.causal_identity;
    const trace = plan.semantic_command_snapshot?.semantic_trace
      ?.step_traces?.[causal.step_index - 1];
    const outerBound = plan.operation_kind === 'trace_turn_step'
      ? causal.request_id === plan.request_id
        && causal.root_turn_id === plan.visible_package_envelope?.turn_id
        && plan.owner_keys.includes(`actor:${sealed.actor_ref}`)
        && trace?.step_index === causal.step_index
        && trace.approved_plan != null
        && traceOperationMatches(trace.approved_plan, sealed)
        && causal.action_ref === `local-fire-action:${digest({
          domain: 'rus.world_processes.local_fire.trace_action_ref.v1',
          root_turn_id: causal.root_turn_id, step_index: causal.step_index,
          approved_plan: trace.approved_plan })}`
      : ['start','add_fuel','due_boundary'].includes(
          sealed.transition_proposal.action)
        && causal.request_id === plan.idempotency_key
        && causal.root_turn_id === plan.visible_package_envelope?.turn_id
        && plan.owner_keys.includes(`actor:${sealed.actor_ref}`)
        && (sealed.transition_proposal.action !== 'due_boundary'
          || sealed.actor_ref === 'system:local_fire_boundary')
        && (sealed.transition_proposal.action === 'due_boundary'
          ? causal.action_ref.startsWith('local-fire-boundary:')
          : causal.action_ref.startsWith('local-fire-command:'));
    const party = plan.updates?.find((write) =>
      write.target_table === 'parties' && write.id === plan.party_id);
    const temporalBound = sealed.transition_proposal.action === 'due_boundary'
      ? validTemporalEvidence(plan.local_fire_temporal_evidence, sealed,
        plan.canonical_input_digest)
      : plan.local_fire_temporal_evidence == null;
    return outerBound && temporalBound && sealed.party_id === plan.party_id
      && sealed.change_set_id === plan.change_set_id
      && party?.record?.party_id === plan.party_id
      && plan.expected_state_versions.some((version) =>
        version.target_table === 'parties' && version.id === plan.party_id
          && version.state_version === sealed.base_party_state_version)
      && localFirePhysicalKeys(sealed).every((key) =>
        plan.physical_keys.includes(key))
      && !hasGenericFuelMutationConflict(plan, sealed);
  } catch { return false; }
}

function validTemporalEvidence(evidence, sealed, canonicalInputDigest) {
  const candidateEvidence = evidence?.candidate_evidence;
  const candidate = candidateEvidence?.candidate_snapshot;
  const before = sealed.transition_proposal.process_before;
  const boundaryId = `local-fire:${before?.process_ref}:state:${
    before?.state_version}`;
  const subjects = before?.fuel_bindings?.map(({ fuel_ref: ref }) =>
    ({ entity_kind: 'item', entity_id: ref }));
  const outerKeys = ['schema','base_canonical_input_digest',
    'temporal_result_digest','temporal_fragment_digests',
    'candidate_evidence','canonical_digest'];
  const candidateKeys = ['schema','rule_ref','policy_ref','candidate_snapshot',
    'candidate_digest','local_fire_write_plan_digest',
    'resolution_identity_digest'];
  const snapshotKeys = ['boundary_id','boundary_kind','scheduled_at',
    'source_ref','primary_subject_ref','scope_ref','rule_ref','policy_ref',
    'preconditions_digest','resolution_class','interrupt_effect',
    'visibility_policy_ref','idempotency_key','subject_refs',
    'causal_parent_refs'];
  if (!exact(evidence, outerKeys) || !exact(candidateEvidence, candidateKeys)
      || !exact(candidate, snapshotKeys)
      || evidence.schema
        !== 'rus.turn.local_fire_temporal_integration_evidence.v1'
      || candidateEvidence.schema
        !== 'rus.turn.local_fire_temporal_candidate_evidence.v1'
      || candidate?.source_ref?.entity_kind !== 'local_world_process'
      || candidate.source_ref.entity_id !== before?.process_ref
      || candidate.boundary_id !== boundaryId
      || candidate.boundary_kind !== 'world_process'
      || digest(candidate.primary_subject_ref) !== digest(subjects?.[0])
      || digest(candidate.scope_ref) !== digest({ entity_kind: 'party',
        entity_id: sealed.party_id })
      || candidateEvidence.candidate_digest !== digest(candidate)
      || candidateEvidence.local_fire_write_plan_digest
        !== sealed.write_plan_digest
      || candidateEvidence.rule_ref?.entity_ref?.entity_kind
        !== 'world_process_rule'
      || candidateEvidence.rule_ref.entity_ref.entity_id
        !== 'local_exact_fire_due_v1'
      || candidateEvidence.rule_ref.authoring_version !== '1'
      || digest(candidate.rule_ref) !== digest(candidateEvidence.rule_ref)
      || candidateEvidence.policy_ref?.entity_ref?.entity_kind
        !== 'world_process_policy'
      || candidateEvidence.policy_ref.entity_ref.entity_id
        !== sealed.authority_pin.persisted_row.policy_ref
      || candidateEvidence.policy_ref.authoring_version
        !== String(sealed.authority_pin.persisted_row.policy_version)
      || digest(candidate.policy_ref) !== digest(candidateEvidence.policy_ref)
      || candidate.resolution_class !== 'local_exact_fire_due'
      || candidate.interrupt_effect !== 'background'
      || digest(candidate.visibility_policy_ref)
        !== digest(candidateEvidence.policy_ref)
      || candidate.idempotency_key !== boundaryId
      || digest(candidate.subject_refs) !== digest(subjects)
      || !Array.isArray(candidate.causal_parent_refs)
      || candidate.causal_parent_refs.length !== 0
      || digest(candidate.scheduled_at)
        !== digest(sealed.transition_proposal.at_timestamp)
      || digest(candidate.scheduled_at) !== digest(before.next_boundary_at)
      || candidate.preconditions_digest !== digest({ process_state: before,
        expected_state_version: before?.state_version })
      || sealed.transition_proposal.causal_identity.action_ref
        !== `local-fire-boundary:${boundaryId}`
      || candidateEvidence.resolution_identity_digest !== digest({
        proposal_id: `local-fire:${before.process_ref}:due`,
        local_fire_write_plan_digest: sealed.write_plan_digest,
        owner_keys: ['actor:system:local_fire_boundary'],
        physical_keys: localFirePhysicalKeys(sealed) })) return false;
  const { canonical_digest: canonicalDigest, ...payload } = evidence;
  return canonicalDigest === digest(payload)
    && canonicalInputDigest === digest({
      command_input_digest: evidence.base_canonical_input_digest,
      temporal_result_digest: evidence.temporal_result_digest,
      temporal_fragment_digests: evidence.temporal_fragment_digests });
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function traceOperationMatches(approvedPlan, sealed) {
  const operations = approvedPlan?.operations;
  if (!Array.isArray(operations)) return false;
  const matches = operations.filter(({ op }) => op === 'request_world_process');
  if (matches.length !== 1) return false;
  const operation = matches[0];
  const proposal = sealed.transition_proposal;
  const expectedAction = proposal.action === 'start' ? 'start'
    : proposal.action === 'add_fuel' ? 'affect' : null;
  const expectedProcessRef = proposal.action === 'start' ? null
    : proposal.process_before?.process_ref ?? null;
  const expectedTargets = proposal.action === 'start'
    ? [sealed.ignition_basis_pin.item_id] : [];
  return expectedAction !== null && operation.actor_ref === sealed.actor_ref
    && operation.process_kind === 'fire'
    && operation.process_action === expectedAction
    && operation.process_ref === expectedProcessRef
    && digest(operation.source_refs) === digest(proposal.added_fuel_refs)
    && digest(operation.target_refs) === digest(expectedTargets);
}

function hasGenericFuelMutationConflict(plan, sealed) {
  const protectedRefs = new Set([
    ...sealed.transition_proposal.added_fuel_refs,
    ...(sealed.transition_proposal.process_before?.fuel_bindings ?? [])
      .map(({ fuel_ref: ref }) => ref)
  ]);
  return genericItemMutationRefs(plan).some((ref) => protectedRefs.has(ref));
}

function genericItemMutationRefs(plan) {
  return [...plan.inserts, ...plan.updates, ...plan.deletes]
    .flatMap((write) => {
      if (write.target_table === 'party_items'
          || write.target_table === 'party_item_placements') {
        return [write.record?.item_id ?? write.id];
      }
      if (write.target_table === 'party_ownership'
          && write.record?.item_id != null) return [write.record.item_id];
      return [];
    });
}
