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
  const localFireProposals = proposals.filter((proposal) =>
    proposal?.local_fire_atomic_write_plans !== undefined);
  if (localFireProposals.some((proposal) =>
    !Array.isArray(proposal.local_fire_atomic_write_plans)
      || !Array.isArray(proposal.physical_keys)
      || !Array.isArray(proposal.owner_keys))) {
    return failure(base_write_plan_input.party_id,
      'local-fire temporal transition requires owner and physical lock sets');
  }
  const localFirePlans = localFireProposals.flatMap((proposal) =>
    proposal.local_fire_atomic_write_plans);
  if (fragments.length === 0 && localFirePlans.length === 0) {
    return freeze({ ok: true, input: clone(base_write_plan_input), fragment_count: 0 });
  }
  const input = clone(base_write_plan_input);
  if (input.local_fire_atomic_write_plans === undefined) {
    input.local_fire_atomic_write_plans = [];
  }
  if (!Array.isArray(input.local_fire_atomic_write_plans)) {
    return failure(input.party_id,
      'base local-fire write plans must be an ordered array');
  }
  const existingPlans=new Map(input.local_fire_atomic_write_plans.map(
    (plan)=>[localFireIdentity(plan),JSON.stringify(plan)]));
  for(const plan of localFirePlans){
    const identity=localFireIdentity(plan),serialized=JSON.stringify(plan);
    if(existingPlans.has(identity)){
      if(existingPlans.get(identity)!==serialized)return failure(input.party_id,
        'conflicting local-fire temporal transition identity');
      continue;
    }
    existingPlans.set(identity,serialized);
    input.local_fire_atomic_write_plans.push(clone(plan));
  }
  if (!Array.isArray(input.approved_write_sets)
    || !Array.isArray(input.expected_state_versions)
    || !record(input.lock_context)
    || !Array.isArray(input.lock_context.physical_keys)
    || localFirePlans.length > 0
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
  const ownerKeys = localFirePlans.length > 0
    ? new Set(input.lock_context.owner_keys) : null;
  for (const proposal of localFireProposals) {
    for (const ownerKey of proposal.owner_keys) {
      if (typeof ownerKey !== 'string' || ownerKey.length === 0) {
        return failure(input.party_id,
          'local-fire temporal owner lock identity is invalid');
      }
      ownerKeys.add(ownerKey);
    }
    for (const physicalKey of proposal.physical_keys) {
      if (typeof physicalKey !== 'string' || physicalKey.length === 0) {
        return failure(input.party_id,
          'local-fire temporal physical lock identity is invalid');
      }
      physicalKeys.add(physicalKey);
    }
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

function localFireIdentity(plan){const proposal=plan?.transition_proposal;
  const cause=proposal?.cause;return cause?.kind==='temporal_boundary'
    ?`temporal:${cause.boundary_id}`
    :`actor:${cause?.root_turn_id}:${cause?.step_index}:${plan?.actor_ref}`;}
