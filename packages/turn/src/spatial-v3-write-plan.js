import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const clone = (value) => structuredClone(value);
const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const sha256Hex = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
const fail = (code, party_id, diagnostics = {}) => Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics }) });
const identity = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
const canonicalWrites = (writes) => [...writes].sort((a, b) => identity(a).localeCompare(identity(b)));
const PRESENTATION_TABLES = new Set(['party_visible_packages', 'party_narration_jobs']);
const FIRST_ENTRY_BINDING_FIELDS = Object.freeze([
  'baseline_disposition',
  'g4_id',
  'preparation_snapshot_id',
  'preparation_member_ordinal',
  'preparation_snapshot_digest',
  'preparation_member_digest',
  'route_plan_id',
  'route_plan_digest',
  'route_plan_execution_id',
  'preparation_claim_id',
  'scene_baseline_id',
  'g5_site_id',
  'g6_instance_id',
  'position_id'
]);
const FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS = Object.freeze([
  'kind',
  'digest',
  'materialization_scope_key',
  ...FIRST_ENTRY_BINDING_FIELDS
]);
const TABLE_MODES = Object.freeze({
  party_v3_change_sets: ['appends'],
  party_route_plan_execution_events: ['appends'],
  party_traversal_interval_results: ['appends'],
  party_timed_activity_attempts: ['appends'],
  party_activity_resource_bindings: ['appends'],
  party_temporal_event_subjects: ['appends'],
  party_temporal_event_dependencies: ['appends'],
  party_npc_runtime_transitions: ['appends'],
  party_perception_records: ['appends'],
  party_perception_witnesses: ['appends'],
  party_perception_replay_evidence: ['appends'],
  party_npc_reaction_option_proposals: ['appends'],
  party_npc_decision_traces: ['appends'],
  party_npc_reaction_consequences: ['appends'],
  party_npc_knowledge_merge_results: ['appends'],
  party_body_temporal_history: ['appends'],
  party_visible_packages: ['appends'],
  party_route_plan_executions: ['updates'],
  party_timed_activity_executions: ['inserts', 'updates'],
  traveller_travel_states: ['updates'],
  party_journey_locations: ['updates'],
  party_clocks: ['updates'],
  party_carrier_attachments: ['updates'],
  party_npc_spatial_schedules: ['updates'],
  entity_placements: ['updates'],
  expansion_frontiers: ['updates'],
  expansion_capacity_reservations: ['updates'],
  party_activity_participant_bindings: ['inserts', 'updates'],
  party_temporal_events: ['inserts', 'updates'],
  party_remote_aggregate_states: ['inserts', 'updates'],
  party_propagation_processes: ['inserts', 'updates'],
  party_npc_knowledge_merge_states: ['updates'],
  party_npc_knowledge: ['inserts'],
  party_route_plans: ['inserts'],
  party_route_plan_steps: ['inserts'],
  preparation_claims: ['inserts', 'updates'],
  party_g5_sites: ['inserts'],
  party_scene_baselines: ['inserts'],
  party_g6_instances: ['inserts'],
  scene_position_nodes: ['inserts'],
  party_cohorts: ['inserts'],
  party_cohort_memberships: ['inserts'],
  party_narration_jobs: ['inserts']
});
const ALLOWED = new Set(Object.keys(TABLE_MODES));
const CHILD_TABLES = new Set([
  'party_route_plan_execution_events',
  'party_traversal_interval_results',
  'party_timed_activity_attempts',
  'party_timed_activity_executions',
  'party_route_plan_steps',
  'preparation_claims',
  'party_activity_participant_bindings',
  'party_activity_resource_bindings',
  'party_temporal_event_subjects',
  'party_temporal_event_dependencies',
  'party_perception_witnesses'
]);
const validIdentity = (write) => write?.target_table === 'entity_placements'
  ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'party_clocks' ? write.record?.party_id === write.id
    : write?.target_table === 'party_route_plan_execution_events' ? write.id === `${write.record?.execution_id}:${write.record?.event_ordinal}`
      : write?.target_table === 'party_timed_activity_attempts' ? write.id === `${write.record?.activity_execution_id}:${write.record?.attempt_ordinal}`
        : write?.target_table === 'party_route_plan_steps' ? write.id === `${write.record?.route_plan_id}:${write.record?.ordinal}`
          : write?.target_table === 'party_visible_packages' ? write.record?.package_id === write.id
        : write?.target_table === 'party_narration_jobs' ? write.record?.job_id === write.id
          : write?.target_table === 'party_activity_participant_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.participant_kind}:${write.record?.participant_id}`
            : write?.target_table === 'party_activity_resource_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.resource_kind}:${write.record?.resource_id}:${write.record?.binding_kind}:${write.record?.change_set_id}`
              : write?.target_table === 'party_temporal_events' ? write.record?.event_id === write.id
                : write?.target_table === 'party_temporal_event_subjects' ? write.id === `${write.record?.event_id}:${write.record?.subject_kind}:${write.record?.subject_id}:${write.record?.subject_role}`
                  : write?.target_table === 'party_temporal_event_dependencies' ? write.id === `${write.record?.event_id}:${write.record?.depends_on_event_id}`
                    : write?.target_table === 'party_npc_runtime_transitions' ? write.record?.transition_id === write.id
                      : write?.target_table === 'party_perception_records' ? write.record?.perception_id === write.id
                        : write?.target_table === 'party_perception_witnesses' ? write.id === `${write.record?.perception_id}:${write.record?.witness_kind}:${write.record?.witness_id}`
                          : write?.target_table === 'party_perception_replay_evidence' ? write.record?.perception_id === write.id
                            : write?.target_table === 'party_npc_reaction_option_proposals' ? write.record?.request_id === write.id
                              : write?.target_table === 'party_npc_decision_traces' ? write.record?.request_id === write.id
                            : write?.target_table === 'party_npc_reaction_consequences' ? write.record?.request_id === write.id
                              : write?.target_table === 'party_npc_knowledge_merge_results' ? write.record?.proposal_id === write.id
                                : write?.target_table === 'party_npc_knowledge_merge_states' ? write.id === `${write.record?.party_id}:${write.record?.npc_id}`
                                  : write?.target_table === 'party_npc_knowledge' ? write.id === `${write.record?.npc_id}:${write.record?.knowledge_ref_kind}:${write.record?.fact_id}`
                            : write?.target_table === 'party_body_temporal_history' ? write.record?.history_id === write.id
                              : write?.target_table === 'party_remote_aggregate_states' ? write.record?.aggregate_id === write.id
                                : write?.target_table === 'party_propagation_processes' ? write.record?.process_id === write.id
                                  : write?.record?.id === write?.id;
function childParentIdentities(write) {
  switch (write?.target_table) {
    case 'party_activity_participant_bindings':
    case 'party_activity_resource_bindings':
    case 'party_timed_activity_attempts':
      return [`party_runtime.party_timed_activity_executions:${write.record?.activity_execution_id}`];
    case 'party_timed_activity_executions':
    case 'party_route_plan_execution_events':
    case 'party_traversal_interval_results':
      return [`party_runtime.party_route_plan_executions:${write.record?.route_plan_execution_id ?? write.record?.execution_id}`];
    case 'party_route_plan_steps':
      return [`party_runtime.party_route_plans:${write.record?.route_plan_id}`];
    case 'party_g6_instances':
      return [`party_runtime.party_scene_baselines:${write.record?.scene_baseline_id}`];
    case 'scene_position_nodes':
      return [`party_runtime.party_g6_instances:${write.record?.g6_instance_id}`];
    case 'party_temporal_event_subjects':
    case 'party_temporal_event_dependencies':
      return [`party_runtime.party_temporal_events:${write.record?.event_id}`];
    case 'party_npc_runtime_transitions':
    case 'party_perception_records':
      return write.record?.event_id ? [`party_runtime.party_temporal_events:${write.record.event_id}`] : [];
    case 'party_perception_witnesses':
      return [`party_runtime.party_perception_records:${write.record?.perception_id}`];
    case 'party_perception_replay_evidence':
      return [
        `party_runtime.party_perception_records:${write.record?.perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_reaction_option_proposals':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_reaction_consequences':
      return [
        `party_runtime.party_perception_records:${write.record?.perception_id}`,
        `party_runtime.party_npc_decision_traces:${write.record?.request_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_knowledge_merge_results':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_knowledge_merge_states':
      return [`party_runtime.party_v3_change_sets:${write.record?.updated_change_set_id}`];
    case 'party_npc_knowledge':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_npc_knowledge_merge_results:${write.record?.proposal_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.updated_change_set_id}`
      ];
    case 'party_visible_packages':
      return [`party_runtime.party_v3_change_sets:${write.record?.change_set_id}`];
    case 'party_narration_jobs':
      return [`party_runtime.party_visible_packages:${write.record?.package_id}`];
    default:
      return [];
  }
}
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
  const sets = { inserts: [], updates: [], appends: [] };
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
  if (Object.entries(sets).some(([mode, writes]) => writes.some((write) => !ALLOWED.has(write?.target_table)
    || !TABLE_MODES[write.target_table].includes(mode)
    || write.target_schema && write.target_schema !== 'party_runtime'
    || !stable(write?.id)
    || !write.record
    || !validIdentity(write)
    || (CHILD_TABLES.has(write.target_table) ? write.record.party_id != null : write.record.party_id !== party_id)))) {
    return fail('generated_schema_mismatch', party_id, { reason: 'write record is not a known party-owned shape or operation mode' });
  }
  for (const mode of Object.keys(sets)) sets[mode] = canonicalWrites(sets[mode]);
  const identities = Object.values(sets).flat().map(identity);
  if (new Set(identities).size !== identities.length) return fail('state_version_conflict', party_id, { reason: 'insert/update/append identities must be disjoint' });
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
  const updateKeys = new Set(sets.updates.map(identity));
  if (expected_state_versions.length !== sets.updates.length || expected_state_versions.some((expected) => !stable(expected?.target_table) || !stable(expected?.id) || !Number.isInteger(expected.state_version) || expected.state_version < 0 || !updateKeys.has(`${expected.target_schema ?? 'party_runtime'}.${expected.target_table}:${expected.id}`))) return fail('state_version_conflict', party_id, { reason: 'every mutable update requires one expected version' });
  if (write_plan_kind === 'blocked_audit' && (sets.inserts.length || sets.updates.length || sets.appends.some((write) => !['party_v3_change_sets', 'party_command_idempotency', 'party_route_plan_execution_events'].includes(write.target_table)))) return fail('generated_schema_mismatch', party_id, { reason: 'blocked audit may append audit rows only' });
  const write_set = { inserts: sets.inserts, updates: sets.updates, appends: sets.appends };
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
