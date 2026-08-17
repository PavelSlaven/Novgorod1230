import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';

const clone = (value) => structuredClone(value);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const key = (value) => `${value.target_table}\u0000${value.id}`;
const failure = (partyId, reason) => {
  const pin = {
    dependency_role: 'planning_context_dependency',
    entity_ref: {
      entity_kind: 'party_change_set',
      entity_id: partyId ?? 'unknown'
    },
    version_pin: { pin_kind: 'party_state_version', state_version: 1 }
  };
  return freeze({
    ok: false,
    error: createSpatialV3TypedError('temporal_change_set_conflict', {
      subject_ref: pin.entity_ref,
      dependency_pins: {
        pins: [pin],
        canonical_digest:
          computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '')
      },
      diagnostics: { reason }
    })
  });
};

/**
 * Mechanically merges already mapped temporal domain write fragments into the
 * command's existing P16 input. It does not interpret domain proposals or add
 * writes; every fragment must already name its exact rows, versions and locks.
 */
export function integrateSpatialV3TemporalWriteFragments({
  base_write_plan_input,
  temporal_result
} = {}) {
  if (!record(base_write_plan_input)
    || !record(temporal_result)
    || typeof base_write_plan_input.party_id !== 'string') {
    return failure(
      base_write_plan_input?.party_id,
      'base write-plan input and temporal result are required'
    );
  }
  const proposals = temporal_result.combined_change_set?.proposals;
  if (proposals === undefined) {
    return freeze({ ok: true, input: clone(base_write_plan_input), fragment_count: 0 });
  }
  if (!Array.isArray(proposals)) {
    return failure(
      base_write_plan_input.party_id,
      'temporal combined change set must expose a finite proposal array'
    );
  }
  const fragments = proposals.filter((proposal) => proposal?.write_set !== undefined);
  const localFirePlans = proposals.filter((proposal) =>
    proposal?.local_fire_atomic_write_plan !== undefined);
  if (localFirePlans.length > 1) {
    return failure(base_write_plan_input.party_id,
      'multiple local-fire transitions cannot share one P16 change set');
  }
  if (localFirePlans.length === 1
      && (!Array.isArray(localFirePlans[0].physical_keys)
        || !Array.isArray(localFirePlans[0].owner_keys)
        || !validLocalFireCandidateEvidence(localFirePlans[0]))) {
    return failure(base_write_plan_input.party_id,
      'local-fire temporal transition requires exact candidate, owner and physical evidence');
  }
  if (fragments.length === 0 && localFirePlans.length === 0) {
    return freeze({ ok: true, input: clone(base_write_plan_input), fragment_count: 0 });
  }
  const input = clone(base_write_plan_input);
  if (localFirePlans.length === 1) {
    if (input.local_fire_atomic_write_plan != null) {
      return failure(input.party_id,
        'local-fire P16 extension identity is ambiguous');
    }
    input.local_fire_atomic_write_plan = clone(
      localFirePlans[0].local_fire_atomic_write_plan);
    const fragmentDigests = fragments.map(
      (fragment) => fragment.canonical_digest);
    const evidence = {
      schema: 'rus.turn.local_fire_temporal_integration_evidence.v1',
      base_canonical_input_digest: base_write_plan_input.canonical_input_digest,
      temporal_result_digest: temporal_result.canonical_digest,
      temporal_fragment_digests: fragmentDigests,
      candidate_evidence: clone(
        localFirePlans[0].temporal_candidate_evidence)
    };
    input.local_fire_temporal_evidence = {
      ...evidence, canonical_digest: computeSpatialV3CanonicalDigest(evidence)
    };
  }
  if (!Array.isArray(input.approved_write_sets)
    || !Array.isArray(input.expected_state_versions)
    || !record(input.lock_context)
    || !Array.isArray(input.lock_context.physical_keys)
    || localFirePlans.length === 1
      && !Array.isArray(input.lock_context.owner_keys)) {
    return failure(
      input.party_id,
      'base write-plan input lacks explicit write, version or lock sets'
    );
  }
  const seenRows = new Map();
  for (const writeSet of input.approved_write_sets) {
    for (const mode of ['appends', 'inserts', 'updates', 'deletes']) {
      if (mode === 'deletes' && writeSet?.[mode] === undefined) {
        writeSet.deletes = [];
      }
      if (!Array.isArray(writeSet?.[mode])) {
        return failure(input.party_id, `base ${mode} must be an array`);
      }
      for (const row of writeSet[mode]) seenRows.set(key(row), mode);
    }
  }
  const versions = new Map(
    input.expected_state_versions.map((entry) => [key(entry), entry.state_version])
  );
  const physicalKeys = new Set(input.lock_context.physical_keys);
  const ownerKeys = localFirePlans.length === 1
    ? new Set(input.lock_context.owner_keys) : null;
  for (const ownerKey of localFirePlans[0]?.owner_keys ?? []) {
    if (typeof ownerKey !== 'string' || ownerKey.length === 0) {
      return failure(input.party_id,
        'local-fire temporal owner lock identity is invalid');
    }
    ownerKeys.add(ownerKey);
  }
  for (const physicalKey of localFirePlans[0]?.physical_keys ?? []) {
    if (typeof physicalKey !== 'string' || physicalKey.length === 0) {
      return failure(input.party_id,
        'local-fire temporal physical lock identity is invalid');
    }
    physicalKeys.add(physicalKey);
  }
  for (const fragment of fragments) {
    if (!record(fragment.write_set)
      || !Array.isArray(fragment.expected_state_versions)
      || !Array.isArray(fragment.physical_keys)) {
      return failure(
        input.party_id,
        'temporal write fragment must contain exact writes, versions and physical locks'
      );
    }
    const copied = { appends: [], inserts: [], updates: [], deletes: [] };
    for (const mode of ['appends', 'inserts', 'updates', 'deletes']) {
      const fragmentWrites = fragment.write_set[mode]
        ?? (mode === 'deletes' ? [] : null);
      if (!Array.isArray(fragmentWrites)) {
        return failure(input.party_id, `temporal ${mode} must be an array`);
      }
      for (const row of fragmentWrites) {
        const rowKey = key(row);
        if (!row?.target_table || !row?.id || seenRows.has(rowKey)) {
          return failure(
            input.party_id,
            `duplicate or incomplete temporal write identity: ${rowKey}`
          );
        }
        seenRows.set(rowKey, mode);
        copied[mode].push(clone(row));
      }
    }
    for (const entry of fragment.expected_state_versions) {
      const versionKey = key(entry);
      const prior = versions.get(versionKey);
      if (prior !== undefined && prior !== entry.state_version) {
        return failure(
          input.party_id,
          `conflicting temporal expected state version: ${versionKey}`
        );
      }
      if (prior === undefined) {
        versions.set(versionKey, entry.state_version);
        input.expected_state_versions.push(clone(entry));
      }
    }
    for (const physicalKey of fragment.physical_keys) {
      if (typeof physicalKey !== 'string' || physicalKey.length === 0) {
        return failure(input.party_id, 'temporal physical lock identity is invalid');
      }
      physicalKeys.add(physicalKey);
    }
    input.approved_write_sets.push(copied);
  }
  input.lock_context.physical_keys = [...physicalKeys].sort();
  if (ownerKeys !== null) {
    input.lock_context.owner_keys = [...ownerKeys].sort();
  }
  input.canonical_input_digest = computeSpatialV3CanonicalDigest({
    command_input_digest: base_write_plan_input.canonical_input_digest,
    temporal_result_digest: temporal_result.canonical_digest,
    temporal_fragment_digests: fragments.map(
      (fragment) => fragment.canonical_digest
    )
  });
  return freeze({ ok: true, input, fragment_count: fragments.length });
}

function validLocalFireCandidateEvidence(proposal) {
  const evidence = proposal.temporal_candidate_evidence;
  const plan = proposal.local_fire_atomic_write_plan;
  const candidate = evidence?.candidate_snapshot;
  const process = plan?.transition_proposal?.process_before;
  const source = candidate?.source_ref;
  const authority = plan?.authority_pin?.persisted_row;
  const boundaryId = `local-fire:${process?.process_ref}:state:${
    process?.state_version}`;
  const subjects = process?.fuel_bindings?.map(({ fuel_ref: ref }) =>
    ({ entity_kind: 'item', entity_id: ref }));
  const exact = ['schema','rule_ref','policy_ref','candidate_snapshot',
    'candidate_digest','local_fire_write_plan_digest',
    'resolution_identity_digest'];
  const candidateKeys = ['boundary_id','boundary_kind','scheduled_at',
    'source_ref','primary_subject_ref','scope_ref','rule_ref','policy_ref',
    'preconditions_digest','resolution_class','interrupt_effect',
    'visibility_policy_ref','idempotency_key','subject_refs',
    'causal_parent_refs'];
  return record(evidence) && Object.keys(evidence).length === exact.length
    && exact.every((key) => Object.hasOwn(evidence, key))
    && evidence.schema === 'rus.turn.local_fire_temporal_candidate_evidence.v1'
    && record(candidate) && Object.keys(candidate).length === candidateKeys.length
    && candidateKeys.every((key) => Object.hasOwn(candidate, key))
    && candidate.boundary_id === boundaryId
    && candidate.boundary_kind === 'world_process'
    && source?.entity_kind === 'local_world_process'
    && source.entity_id === process?.process_ref
    && computeSpatialV3CanonicalDigest(candidate.primary_subject_ref)
      === computeSpatialV3CanonicalDigest(subjects?.[0])
    && computeSpatialV3CanonicalDigest(candidate.scope_ref)
      === computeSpatialV3CanonicalDigest({ entity_kind: 'party',
        entity_id: plan.party_id })
    && computeSpatialV3CanonicalDigest(candidate.rule_ref)
      === computeSpatialV3CanonicalDigest(evidence.rule_ref)
    && evidence.rule_ref?.entity_ref?.entity_kind === 'world_process_rule'
    && evidence.rule_ref.entity_ref.entity_id === 'local_exact_fire_due_v1'
    && evidence.rule_ref.authoring_version === '1'
    && computeSpatialV3CanonicalDigest(candidate.policy_ref)
      === computeSpatialV3CanonicalDigest(evidence.policy_ref)
    && evidence.policy_ref?.entity_ref?.entity_kind === 'world_process_policy'
    && evidence.policy_ref.entity_ref.entity_id === authority?.policy_ref
    && evidence.policy_ref.authoring_version === String(authority?.policy_version)
    && candidate.resolution_class === 'local_exact_fire_due'
    && candidate.interrupt_effect === 'background'
    && computeSpatialV3CanonicalDigest(candidate.visibility_policy_ref)
      === computeSpatialV3CanonicalDigest(evidence.policy_ref)
    && candidate.idempotency_key === boundaryId
    && computeSpatialV3CanonicalDigest(candidate.subject_refs)
      === computeSpatialV3CanonicalDigest(subjects)
    && Array.isArray(candidate.causal_parent_refs)
    && candidate.causal_parent_refs.length === 0
    && computeSpatialV3CanonicalDigest(candidate) === evidence.candidate_digest
    && computeSpatialV3CanonicalDigest(candidate.scheduled_at)
      === computeSpatialV3CanonicalDigest(plan.transition_proposal.at_timestamp)
    && computeSpatialV3CanonicalDigest(candidate.scheduled_at)
      === computeSpatialV3CanonicalDigest(process?.next_boundary_at)
    && candidate.preconditions_digest === computeSpatialV3CanonicalDigest({
      process_state: process, expected_state_version: process?.state_version })
    && plan.transition_proposal.causal_identity?.action_ref
      === `local-fire-boundary:${boundaryId}`
    && evidence.local_fire_write_plan_digest === plan.write_plan_digest
    && evidence.resolution_identity_digest
      === computeSpatialV3CanonicalDigest({ proposal_id: proposal.proposal_id,
        local_fire_write_plan_digest: plan.write_plan_digest,
        owner_keys: proposal.owner_keys, physical_keys: proposal.physical_keys });
}
