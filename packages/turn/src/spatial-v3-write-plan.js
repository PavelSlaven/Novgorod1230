import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { validateNarrationFlowResult } from '@rus/narration';

import {
  ALLOWED,
  CHILD_TABLES,
  NON_VERSIONED_MUTABLE_TABLES,
  PRESENTATION_TABLES,
  TABLE_MODES,
  childParentIdentities,
  validIdentity
} from './spatial-v3-write-plan-policy.js';
import {
  completeS1Topology,
  validFirstEntryPhysicalRecheck
} from './spatial-v3-write-plan-s1-validation.js';

const clone = (value) => structuredClone(value);
const INVALID_INPUT = Symbol('invalid combined write plan input');
const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
const fail = (code, party_id, diagnostics = {}) => Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics }) });
const identity = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
const canonicalWrites = (writes) => [...writes].sort((a, b) => identity(a).localeCompare(identity(b)));
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export async function buildCombinedWritePlan(rawInput = {}, options = {}) {
  const input = rawInput;
  const ordinaryMaterializationPlan = snapshotOrdinaryPlan(rawInput);
  const actionProductionPlans = snapshotExtensionPlans(rawInput,
    'action_production_atomic_write_plans');
  const localFirePlans = snapshotExtensionPlans(rawInput,
    'local_fire_atomic_write_plans');
  const spatialSemanticPlan = snapshotExtensionPlan(rawInput,
    'spatial_semantic_atomic_write_plan');
  const verifyApproval = ownData(options, 'verifyApproval');
  if (ordinaryMaterializationPlan === INVALID_INPUT
      || actionProductionPlans === INVALID_INPUT
      || localFirePlans === INVALID_INPUT
      || spatialSemanticPlan === INVALID_INPUT) {
    return fail('generated_schema_mismatch', null,
      { reason: 'extension atomic plans must be strict JSON data' });
  }
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
  const ordinary_materialization_atomic_write_plan =
    ordinaryMaterializationPlan;
  const action_production_atomic_write_plans = actionProductionPlans;
  const local_fire_atomic_write_plans = localFirePlans;
  const spatial_semantic_atomic_write_plan = spatialSemanticPlan;
  const approveNarration = ownData(options, 'approveNarration');
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
  if (containsKey(approved_write_sets, 'portrait_spec_v1')
      || containsKey(visible_package_envelope, 'portrait_spec_v1')) {
    return fail('generated_schema_mismatch', party_id, {
      reason: 'portrait_spec_v1 is a read projection and cannot enter P16'
    });
  }
  const verified = await verifyApproval(clone({
    party_id,
    operation_kind,
    canonical_input_digest,
    validation_report,
    visible_package_envelope,
    approved_write_sets,
    ordinary_materialization_atomic_write_plan,
    action_production_atomic_write_plans,
    local_fire_atomic_write_plans,
    spatial_semantic_atomic_write_plan
  }));
  if (!verified?.ok) return fail('generated_schema_mismatch', party_id, { reason: 'approved write set verifier rejected input' });
  let approvedNarration = null;
  if (approveNarration !== undefined && write_plan_kind === 'semantic_commit') {
    if (typeof approveNarration !== 'function') return fail('visible_package_persistence_gap',
      party_id, { reason: 'narration approval port is invalid' });
    try {
      approvedNarration = snapshotJsonData(await approveNarration(clone({
        party_id, operation_kind, canonical_input_digest, validation_report,
        visible_package_envelope, approved_write_sets,
        semantic_command_snapshot: idempotency.semantic_command_snapshot == null
          ? null : clone(idempotency.semantic_command_snapshot),
        ordinary_materialization_atomic_write_plan,
        action_production_atomic_write_plans, local_fire_atomic_write_plans,
        spatial_semantic_atomic_write_plan
      })));
    } catch(error){const code=String(error?.code??'');return fail(
      'visible_package_persistence_gap',party_id,{stage:'narration_approval',
        reason:/^[A-Z][A-Z0-9_]{0,127}$/u.test(code)?code:
          'narration_approval_rejected'});}
    if (approvedNarration === INVALID_INPUT || !validApprovedNarration(
      approvedNarration, party_id, visible_package_envelope)) return fail(
      'visible_package_persistence_gap', party_id,
      { stage: 'narration_approval',
        reason: 'narration_result_binding_invalid' });
  }
  const r=(code,diagnostics)=>fail(code,party_id,
    {stage:'write_plan_invariant',...diagnostics});
  const sets = { inserts: [], updates: [], appends: [], deletes: [] };
  for (const set of approved_write_sets) {
    for (const mode of Object.keys(sets)) {
      for (const write of set?.[mode] ?? []) {
        if (PRESENTATION_TABLES.has(write?.target_table)) {
          return r('visible_package_persistence_gap', { reason: 'presentation_write_owner_invalid' });
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
    const narrationJobRecord = approvedNarration == null ? {
      job_id: narrationJobId,
      party_id,
      package_id: visible_package_envelope.package_id,
      status: 'pending',
      idempotency_key: `presentation:${visible_package_envelope.package_id}:${visible_package_envelope.package_digest}`
    } : {
      job_id: narrationJobId,
      party_id,
      package_id: visible_package_envelope.package_id,
      status: 'delivered',
      idempotency_key: `presentation:${visible_package_envelope.package_id}:${visible_package_envelope.package_digest}`,
      next_attempt_ordinal: 1,
      narration_output: clone(approvedNarration),
      output_digest: approvedNarration.canonical_digest
    };
    const narrationJobWrite = {
      target_schema: 'party_runtime',
      target_table: 'party_narration_jobs',
      id: narrationJobId,
      record: narrationJobRecord,
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
    return r('generated_schema_mismatch', {
      reason: 'write_record_shape_or_mode_invalid'
    });
  }
  for (const mode of Object.keys(sets)) sets[mode] = canonicalWrites(sets[mode]);
  const identities = Object.values(sets).flat().map(identity);
  if (new Set(identities).size !== identities.length) return r('state_version_conflict', { reason: 'write_identity_conflict' });
  const identitySet = new Set(identities);
  const externalSpatialParents = spatial_semantic_atomic_write_plan == null ? new Set() : new Set([
    `party_runtime.party_scene_baselines:${spatial_semantic_atomic_write_plan.formal_spatial_context?.baseline_ref}`,
    `party_runtime.scene_position_nodes:${spatial_semantic_atomic_write_plan.resolution?.position_ref}`
  ]);
  if (Object.values(sets).flat().some((write) =>
    childParentIdentities(write).some((parent) => !identitySet.has(parent)
      && !externalSpatialParents.has(parent)))) {
    return r('generated_schema_mismatch', { reason: 'child_parent_missing' });
  }
  if (!identities.every((value) => physicalKeys.has(value))) return r('lock_order_violation', { reason: 'physical_lock_key_missing' });
  const changes = sets.appends.filter((write) => write.target_table === 'party_v3_change_sets' && write.id === change_set.id);
  if (changes.length !== 1 || changes[0].record.party_id !== party_id || changes[0].record.operation_kind !== operation_kind || changes[0].record.idempotency_record_id !== idempotency.id) return r('generated_schema_mismatch', { reason: 'change_set_binding_invalid' });
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
      return r('target_preparation_failed', { reason: 'first_entry_location_binding_invalid' });
    }
    if (claimUpdates.length !== 1
      || claimUpdates[0].id !== physicalRecheck.preparation_claim_id
      || claimUpdates[0].record.claim_status !== 'consumed'
      || claimUpdates[0].record.terminal_change_set_id !== change_set.id) {
      return r('target_preparation_failed', { reason: 'first_entry_claim_binding_invalid' });
    }
    if (physicalRecheck.baseline_disposition === 'reuse') {
      if (g5Sites.length || baselines.length || g6Instances.length || positions.length) {
        return r('target_preparation_failed', { reason: 'first_entry_reuse_contains_inserts' });
      }
    } else {
      const baseline = baselines[0];
      const g6 = g6Instances.find((write) => write.id === physicalRecheck.g6_instance_id);
      const position = positions.find((write) => write.id === physicalRecheck.position_id);
      const edgeCount = sets.inserts.filter((write) => write.target_table === 'scene_movement_edges').length;
      const linkCount = sets.inserts.filter((write) => write.target_table === 'visibility_links').length;
      const legacy = g6Instances.length === 1 && positions.length === 1
        && edgeCount === 0 && linkCount === 0;
      const s1 = g6Instances.length === 2 && positions.length === 2
        && g5Sites.length === 1 && edgeCount === 2 && linkCount === 2
        && completeS1Topology(sets.inserts, physicalRecheck, baseline, g6, position);
      if (baselines.length !== 1
        || g5Sites.length > 1
        || (!legacy && !s1)
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
        return r('target_preparation_failed', { reason: 'first_entry_created_chain_binding_invalid' });
      }
    }
  }
  const mutableKeys = new Set(
    [...sets.updates, ...sets.deletes]
      .filter((write) =>
        !NON_VERSIONED_MUTABLE_TABLES.includes(write.target_table))
      .map(identity)
  );
  if (expected_state_versions.length !== mutableKeys.size || expected_state_versions.some((expected) => !stable(expected?.target_table) || !stable(expected?.id) || !Number.isInteger(expected.state_version) || expected.state_version < 0 || !mutableKeys.has(`${expected.target_schema ?? 'party_runtime'}.${expected.target_table}:${expected.id}`))) return r('state_version_conflict', { reason: 'expected_state_version_set_invalid' });
  if (write_plan_kind === 'blocked_audit' && (sets.inserts.length || sets.updates.length || sets.deletes.length || sets.appends.some((write) => !['party_v3_change_sets', 'party_command_idempotency', 'party_route_plan_execution_events'].includes(write.target_table)))) return r('generated_schema_mismatch', { reason: 'blocked_audit_write_set_invalid' });
  const write_set = { inserts: sets.inserts, updates: sets.updates, appends: sets.appends, deletes: sets.deletes };
  const write_set_digest = computeSpatialV3CanonicalDigest(extensionDigestInput({
    write_set, ordinary_materialization_atomic_write_plan,
    action_production_atomic_write_plans, local_fire_atomic_write_plans,
    spatial_semantic_atomic_write_plan
  }));
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
    ordinary_materialization_atomic_write_plan: ordinary_materialization_atomic_write_plan == null
      ? null : clone(ordinary_materialization_atomic_write_plan),
    ...(action_production_atomic_write_plans.length === 0 ? {} : {
      action_production_atomic_write_plans:
        clone(action_production_atomic_write_plans)
    }),
    ...(local_fire_atomic_write_plans.length === 0 ? {} : {
      local_fire_atomic_write_plans: clone(local_fire_atomic_write_plans)
    }),
    ...(spatial_semantic_atomic_write_plan == null ? {} : {
      spatial_semantic_atomic_write_plan: clone(spatial_semantic_atomic_write_plan)
    }),
    write_set_digest,
    ...write_set
  };
  return freeze({ ok: true, plan: { ...plan, digest: computeSpatialV3CanonicalDigest(plan) } });
}


function ownData(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    ? descriptor.value : undefined;
}

function snapshotOrdinaryPlan(input) {
  return snapshotExtensionPlan(input,
    'ordinary_materialization_atomic_write_plan');
}

function snapshotExtensionPlans(input, field) {
  if (!input || typeof input !== 'object') return [];
  const descriptor = Object.getOwnPropertyDescriptor(input, field);
  if (descriptor == null || Object.hasOwn(descriptor, 'value')
      && descriptor.value === undefined) return [];
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    return INVALID_INPUT;
  }
  const snapshot = snapshotJsonData(descriptor.value);
  return Array.isArray(snapshot)
    && snapshot.every((entry) => entry != null
      && typeof entry === 'object' && !Array.isArray(entry))
    ? snapshot : INVALID_INPUT;
}

function snapshotExtensionPlan(input, field) {
  if (!input || typeof input !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(input, field);
  if (descriptor == null || (Object.hasOwn(descriptor, 'value')
      && descriptor.value === undefined)) return null;
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
      || descriptor.value === null) {
    return descriptor?.value === null ? null : INVALID_INPUT;
  }
  const snapshot = snapshotJsonData(descriptor.value);
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot : INVALID_INPUT;
}

function extensionDigestInput({ write_set,
  ordinary_materialization_atomic_write_plan: ordinary,
  action_production_atomic_write_plans: actions,
  local_fire_atomic_write_plans: localFire,
  spatial_semantic_atomic_write_plan: spatialSemantic }) {
  if (ordinary == null && actions.length === 0 && localFire.length === 0 && spatialSemantic == null) return write_set;
  if (actions.length === 0 && localFire.length === 0) {
    return { write_set,
      ordinary_materialization_atomic_write_plan: ordinary,
      ...(spatialSemantic == null ? {} : { spatial_semantic_atomic_write_plan: spatialSemantic }) };
  }
  return {
    write_set,
    ...(ordinary == null ? {} : {
      ordinary_materialization_atomic_write_plan: ordinary
    }),
    ...(actions.length === 0 ? {} : {
      action_production_atomic_write_plans: actions }),
    ...(localFire.length === 0 ? {} : { local_fire_atomic_write_plans: localFire }),
    ...(spatialSemantic == null ? {} : { spatial_semantic_atomic_write_plan: spatialSemantic })
  };
}

function snapshotJsonData(value) {
  const seen = new WeakSet();
  function visit(input) {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input)
      ? input : INVALID_INPUT;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0) return INVALID_INPUT;
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input)
        !== (array ? Array.prototype : Object.prototype)) return INVALID_INPUT;
    const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1
        || !names.includes('length'))) return INVALID_INPUT;
    seen.add(input);
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
          || (array && key !== String(output.length))) return INVALID_INPUT;
      const child = visit(descriptor.value);
      if (child === INVALID_INPUT) return INVALID_INPUT;
      if (array) output.push(child); else output[key] = child;
    }
    return output;
  }
  return visit(value);
}

function containsKey(value, key, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => containsKey(child, key, seen));
}

function validApprovedNarration(value, partyId, envelope) {
  const flow = value?.flow_result;
  if (!envelope || value?.kind !== 'approved_narration'
      || value.party_id !== partyId || value.request_id !== envelope.turn_id
      || value.package_id !== envelope.package_id
      || value.package_digest !== envelope.package_digest
      || !validateNarrationFlowResult(flow).ok
      || flow.request_id !== envelope.turn_id || flow.status !== 'approved'
      || flow.pass !== true || flow.final_audit?.schema !== 'narration_audit'
      || flow.final_audit?.pass !== true
      || !Array.isArray(flow.final_audit?.concerns)
      || flow.final_audit.concerns.length !== 0
      || !stable(flow.approved_output?.prose)
      || value.text !== flow.approved_output.prose
      || computeSpatialV3CanonicalDigest(value.dependency_pins)
        !== computeSpatialV3CanonicalDigest(envelope.dependency_pins)
      || !stable(value.canonical_digest)) return false;
  const { canonical_digest, ...payload } = value;
  return stable(canonical_digest)
    && canonical_digest === computeSpatialV3CanonicalDigest(payload);
}
