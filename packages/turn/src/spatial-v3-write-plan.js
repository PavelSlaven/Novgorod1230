import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

import {
  ALLOWED,
  CHILD_TABLES,
  FIRST_ENTRY_BINDING_FIELDS,
  FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS,
  PRESENTATION_TABLES,
  TABLE_MODES,
  childParentIdentities,
  validIdentity
} from './spatial-v3-write-plan-policy.js';

const clone = (value) => structuredClone(value);
const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const sha256Hex = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
const fail = (code, party_id, diagnostics = {}) => Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics }) });
const identity = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
const canonicalWrites = (writes) => [...writes].sort((a, b) => identity(a).localeCompare(identity(b)));
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function validFirstEntryPhysicalRecheck(check, physicalKeys, partyId, g4Keys) {
  if (!check
    || Object.keys(check).sort().join('\u0000')
      !== [...FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS].sort().join('\u0000')
    || check.kind !== 'physical'
    || !['create', 'reuse'].includes(check.baseline_disposition)
    || !stable(check.g4_id)
    || !stable(check.preparation_snapshot_id)
    || !Number.isInteger(check.preparation_member_ordinal)
    || check.preparation_member_ordinal < 0
    || !sha256Hex(check.preparation_snapshot_digest)
    || !sha256Hex(check.preparation_member_digest)
    || !stable(check.route_plan_id)
    || !sha256Hex(check.route_plan_digest)
    || !stable(check.route_plan_execution_id)
    || !stable(check.preparation_claim_id)
    || ![
      check.scene_baseline_id,
      check.g5_site_id,
      check.g6_instance_id,
      check.position_id
    ].every(stable)
    || check.materialization_scope_key
      !== `party_runtime.party_scene_baselines:${check.scene_baseline_id}`
    || !physicalKeys.includes(check.materialization_scope_key)
    || g4Keys.length !== 1
    || g4Keys[0] !== `${partyId}:${check.g4_id}`) {
    return false;
  }
  const { digest, ...payload } = check;
  return digest === computeSpatialV3CanonicalDigest(payload);
}

/** Builds no domain decision: its verifier attests pre-approved input and it only seals the three physical write sets. */
export async function buildCombinedWritePlan(input = {}, { verifyApproval } = {}) {
  const {
    plan_id,
    party_id,
    write_plan_kind,
    operation_kind,
    canonical_input_digest,
    expected_state_versions,
    validation_report,
    idempotency,
    change_set,
    visible_package_envelope,
    approved_write_sets,
    lock_context,
    commit_rechecks
  } = input;
  if (![plan_id, party_id, operation_kind, canonical_input_digest, idempotency?.id, idempotency?.key, change_set?.id].every(stable) || !['semantic_commit', 'blocked_audit'].includes(write_plan_kind) || !Array.isArray(expected_state_versions) || !Array.isArray(approved_write_sets) || !lock_context || !Array.isArray(commit_rechecks) || typeof verifyApproval !== 'function') return fail('generated_schema_mismatch', party_id, { reason: 'complete combined-write input and injected approval verifier are required' });
  const requiredRechecks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'];
  if (!requiredRechecks.every((kind) => commit_rechecks.some((check) => check?.kind === kind && stable(check?.digest))) || ['owner_keys', 'execution_keys', 'g4_keys', 'physical_keys'].some((key) => !Array.isArray(lock_context[key]) || lock_context[key].some((value) => !stable(value)))) return fail('generated_schema_mismatch', party_id, { reason: 'complete lock context and commit rechecks are required' });
  if (operation_kind === 'first_entry') {
    const physicalRecheck = commit_rechecks.find((check) => check?.kind === 'physical');
    if (!validFirstEntryPhysicalRecheck(physicalRecheck, lock_context.physical_keys, party_id, lock_context.g4_keys)) {
      return fail('lock_order_violation', party_id, { reason: 'first_entry requires one sealed preparation-member binding and its exact scene-baseline materialization scope lock' });
    }
  }
  if (!validation_report || !['pass', 'pass_with_notes', 'blocked'].includes(validation_report.status) || !stable(validation_report.digest)) return fail('generated_schema_mismatch', party_id, { reason: 'validation report is malformed' });
  if ((write_plan_kind === 'semantic_commit' && !['pass', 'pass_with_notes'].includes(validation_report.status)) || (write_plan_kind === 'blocked_audit' && validation_report.status !== 'blocked')) return fail('generated_schema_mismatch', party_id, { reason: 'plan kind and validation status disagree' });
  const visibleErrors = visible_package_envelope == null
    ? []
    : validateSpatialV3Contract('visible_package_persistence_envelope', visible_package_envelope);
  if (write_plan_kind === 'semantic_commit' && (
    visibleErrors.length
    || visible_package_envelope?.party_id !== party_id
    || visible_package_envelope?.change_set_id !== change_set.id
    || visible_package_envelope?.idempotency_record_id !== idempotency.id
    || visible_package_envelope?.presentation_status !== 'pending'
    || visible_package_envelope?.package_digest !== computeSpatialV3CanonicalDigest(visible_package_envelope?.visible_payload)
  )) return fail('visible_package_persistence_gap', party_id, { reason: visibleErrors[0]?.message ?? 'semantic commit requires one matching pending visible package' });
  if (write_plan_kind === 'blocked_audit' && visible_package_envelope != null) return fail('visible_package_persistence_gap', party_id, { reason: 'blocked audit forbids a visible package' });
  const verified = await verifyApproval(clone({
    party_id,
    operation_kind,
    canonical_input_digest,
    validation_report,
    visible_package_envelope,
    approved_write_sets
  }));
  if (!verified?.ok) return fail('generated_schema_mismatch', party_id, { reason: 'approved write set verifier rejected input' });
  const sets = { inserts: [], updates: [], appends: [], deletes: [] };
  for (const set of approved_write_sets) {
    for (const mode of Object.keys(sets)) {
      for (const write of set?.[mode] ?? []) {
        if (PRESENTATION_TABLES.has(write?.target_table)) {
          return fail('visible_package_persistence_gap', party_id, { reason: 'visible package and narration job writes are derived only from the sealed envelope' });
        }
        sets[mode].push({ ...clone(write), operation_mode: mode });
      }
    }
  }
  const physicalKeys = new Set(lock_context.physical_keys);
  if (write_plan_kind === 'semantic_commit') {
    const narrationJobId = `narration-job:${visible_package_envelope.package_id}`;
    const packageWrite = {
      target_schema: 'party_runtime',
      target_table: 'party_visible_packages',
      id: visible_package_envelope.package_id,
      record: clone(visible_package_envelope),
      operation_mode: 'appends'
    };
    const narrationJobWrite = {
      target_schema: 'party_runtime',
      target_table: 'party_narration_jobs',
      id: narrationJobId,
      record: {
        job_id: narrationJobId,
        party_id,
        package_id: visible_package_envelope.package_id,
        status: 'pending',
        idempotency_key: `presentation:${visible_package_envelope.package_id}:${visible_package_envelope.package_digest}`
      },
      operation_mode: 'inserts'
    };
    sets.appends.push(packageWrite);
    sets.inserts.push(narrationJobWrite);
    physicalKeys.add(identity(packageWrite));
    physicalKeys.add(identity(narrationJobWrite));
  }
  const invalidWrite = Object.entries(sets).flatMap(([mode, writes]) =>
    writes.map((write) => ({ mode, write }))).find(({ mode, write }) =>
    !ALLOWED.has(write?.target_table)
    || !TABLE_MODES[write.target_table].includes(mode)
    || write.target_schema && write.target_schema !== 'party_runtime'
    || !stable(write?.id)
    || !write.record
    || !validIdentity(write)
    || (CHILD_TABLES.has(write.target_table)
      ? write.record.party_id != null
      : write.record.party_id !== party_id));
  if (invalidWrite) {
    return fail('generated_schema_mismatch', party_id, {
      reason:
        `write record is not a known party-owned shape or operation mode: ${invalidWrite.mode}:${invalidWrite.write?.target_table}:${invalidWrite.write?.id}`
    });
  }
  for (const mode of Object.keys(sets)) sets[mode] = canonicalWrites(sets[mode]);
  const identities = Object.values(sets).flat().map(identity);
  if (new Set(identities).size !== identities.length) return fail('state_version_conflict', party_id, { reason: 'insert/update/append/delete identities must be disjoint' });
  const identitySet = new Set(identities);
  if (Object.values(sets).flat().some((write) =>
    childParentIdentities(write).some((parent) => !identitySet.has(parent)))) {
    return fail('generated_schema_mismatch', party_id, { reason: 'party-owned child writes require their exact parent in the same sealed write plan' });
  }
  if (!identities.every((value) => physicalKeys.has(value))) return fail('lock_order_violation', party_id, { reason: 'every physical write must declare its exact physical lock key' });
  const changes = sets.appends.filter((write) => write.target_table === 'party_v3_change_sets' && write.id === change_set.id);
  if (changes.length !== 1 || changes[0].record.party_id !== party_id || changes[0].record.operation_kind !== operation_kind || changes[0].record.idempotency_record_id !== idempotency.id) return fail('generated_schema_mismatch', party_id, { reason: 'one matching append-only change set is required' });
  if (operation_kind === 'first_entry') {
    const physicalRecheck = commit_rechecks.find((check) => check.kind === 'physical');
    const locationUpdates = sets.updates.filter((write) => write.target_table === 'party_journey_locations');
    const g5Sites = sets.inserts.filter((write) => write.target_table === 'party_g5_sites');
    const baselines = sets.inserts.filter((write) => write.target_table === 'party_scene_baselines');
    const g6Instances = sets.inserts.filter((write) => write.target_table === 'party_g6_instances');
    const positions = sets.inserts.filter((write) => write.target_table === 'scene_position_nodes');
    const claimUpdates = sets.updates.filter((write) => write.target_table === 'preparation_claims');
    if (locationUpdates.length !== 1
      || locationUpdates[0].record.location_kind !== 'scene'
      || locationUpdates[0].record.scene_position_id !== physicalRecheck.position_id) {
      return fail('target_preparation_failed', party_id, { reason: 'first_entry location must use the exact prepared snapshot-member position' });
    }
    if (claimUpdates.length !== 1
      || claimUpdates[0].id !== physicalRecheck.preparation_claim_id
      || claimUpdates[0].record.claim_status !== 'consumed'
      || claimUpdates[0].record.terminal_change_set_id !== change_set.id) {
      return fail('target_preparation_failed', party_id, { reason: 'first_entry must consume exactly its sealed preparation claim in the combined write plan' });
    }
    if (physicalRecheck.baseline_disposition === 'reuse') {
      if (g5Sites.length || baselines.length || g6Instances.length || positions.length) {
        return fail('target_preparation_failed', party_id, { reason: 'reused first_entry baseline forbids duplicate G5/G6/position inserts' });
      }
    } else {
      const baseline = baselines[0];
      const g6 = g6Instances[0];
      const position = positions[0];
      if (baselines.length !== 1
        || g6Instances.length !== 1
        || positions.length !== 1
        || g5Sites.length > 1
        || baseline.id !== physicalRecheck.scene_baseline_id
        || baseline.record.host_kind !== 'g5_site'
        || baseline.record.host_id !== physicalRecheck.g5_site_id
        || g6.id !== physicalRecheck.g6_instance_id
        || g6.record.scene_baseline_id !== physicalRecheck.scene_baseline_id
        || g6.record.host_kind !== 'g5_site'
        || g6.record.host_id !== physicalRecheck.g5_site_id
        || position.id !== physicalRecheck.position_id
        || position.record.g6_instance_id !== physicalRecheck.g6_instance_id
        || (g5Sites.length === 1 && g5Sites[0].id !== physicalRecheck.g5_site_id)
        || (g5Sites.length === 1 && g5Sites[0].record.parent_g4_id !== physicalRecheck.g4_id)
        || (baseline.record.source_kind === 'generated_template'
          && (g5Sites.length !== 1 || g5Sites[0].record.origin !== 'generated'))) {
        return fail('target_preparation_failed', party_id, { reason: 'created first_entry baseline/G5/G6/position chain must exactly match its sealed preparation-member binding' });
      }
    }
  }
  const mutableKeys = new Set([...sets.updates, ...sets.deletes].map(identity));
  if (expected_state_versions.length !== mutableKeys.size || expected_state_versions.some((expected) => !stable(expected?.target_table) || !stable(expected?.id) || !Number.isInteger(expected.state_version) || expected.state_version < 0 || !mutableKeys.has(`${expected.target_schema ?? 'party_runtime'}.${expected.target_table}:${expected.id}`))) return fail('state_version_conflict', party_id, { reason: 'every mutable update or delete requires one expected version' });
  if (write_plan_kind === 'blocked_audit' && (sets.inserts.length || sets.updates.length || sets.deletes.length || sets.appends.some((write) => !['party_v3_change_sets', 'party_command_idempotency', 'party_route_plan_execution_events'].includes(write.target_table)))) return fail('generated_schema_mismatch', party_id, { reason: 'blocked audit may append audit rows only' });
  const write_set = { inserts: sets.inserts, updates: sets.updates, appends: sets.appends, deletes: sets.deletes };
  const write_set_digest = computeSpatialV3CanonicalDigest(write_set);
  const plan = {
    schema: 'spatial_v3.combined_write_plan.v2',
    plan_id,
    party_id,
    write_plan_kind,
    operation_kind,
    canonical_input_digest,
    expected_state_versions: clone(expected_state_versions),
    expected_state_versions_digest: computeSpatialV3CanonicalDigest(expected_state_versions),
    validation_report_digest: validation_report.digest,
    idempotency_record_id: idempotency.id,
    idempotency_key: idempotency.key,
    parent_idempotency_key: idempotency.parent_key ?? null,
    semantic_command_snapshot:
      idempotency.semantic_command_snapshot == null
        ? null
        : clone(idempotency.semantic_command_snapshot),
    semantic_command_digest:
      idempotency.semantic_command_digest ?? null,
    semantic_dependency_pins:
      idempotency.semantic_dependency_pins == null
        ? null
        : clone(idempotency.semantic_dependency_pins),
    request_id: idempotency.request_id ?? null,
    change_set_id: change_set.id,
    visible_package_envelope: visible_package_envelope == null ? null : clone(visible_package_envelope),
    owner_keys: [...lock_context.owner_keys].sort(),
    execution_keys: [...lock_context.execution_keys].sort(),
    g4_keys: [...lock_context.g4_keys].sort(),
    physical_keys: [...physicalKeys].sort(),
    commit_rechecks: clone(commit_rechecks).sort((a, b) => a.kind.localeCompare(b.kind) || a.digest.localeCompare(b.digest)),
    write_set_digest,
    ...write_set
  };
  return freeze({ ok: true, plan: { ...plan, digest: computeSpatialV3CanonicalDigest(plan) } });
}
