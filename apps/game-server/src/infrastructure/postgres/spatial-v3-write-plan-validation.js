import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  CHILD_TABLES,
  FIRST_ENTRY_BINDING_FIELDS,
  FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS,
  TABLES,
  childParentKeys,
  digestInput,
  keyOf,
  sha256Hex,
  stable,
  validIdentity
} from './spatial-v3-write-layout.js';
import { createOrdinaryMaterializationAtomicWritePlan } from
  './ordinary-materialization-phase-6-commit.js';
import { actionProducedPhysicalKeys,
  validActionProductionExtension } from
  './action-produced-atomic-write-plan.js';
import { validLocalFireExtension } from
  './local-fire-write-plan-validation.js';

export const lockOrder = (plan) => [
  `01:clock:${plan.party_id}`,
  ...[...new Set(plan.owner_keys ?? [])].sort().map((key) => `02:owner:${key}`),
  ...[...new Set(plan.execution_keys ?? [])].sort().map((key) => `03:execution:${key}`),
  ...[...new Set(plan.g4_keys ?? [])].sort().map((key) => `04:g4:${key}`),
  ...[...new Set(plan.physical_keys)].sort().map((key) => `05:physical:${key}`),
  ...(plan.ordinary_materialization_atomic_write_plan?.finite_resource_transition == null
    ? [] : [`05:resource:${plan.party_id}:${plan.ordinary_materialization_atomic_write_plan.finite_resource_transition.source_resource_node_id}`]),
  ...(plan.action_production_atomic_write_plans ?? []).flatMap((action) =>
    action.source_pins ?? [])
    .filter(({ finite_resource_row: row }) => row != null)
    .map(({ finite_resource_row: row }) =>
      `05:resource:${plan.party_id}:${row.resource_node_id}`),
  `06:change-set:${plan.change_set_id}`,
  `06:idempotency:${plan.party_id}:${plan.operation_kind}:${plan.idempotency_key}`
];
function firstEntryPhysicalRecheck(plan) {
  return plan.commit_rechecks.find((check) => check?.kind === 'physical');
}
function validFirstEntryPhysicalRecheck(plan) {
  const check = firstEntryPhysicalRecheck(plan);
  if (!check
    || Object.keys(check).sort().join('\u0000')
      !== [...FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS].sort().join('\u0000')
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
    || !plan.physical_keys.includes(check.materialization_scope_key)
    || plan.g4_keys.length !== 1
    || plan.g4_keys[0] !== `${plan.party_id}:${check.g4_id}`) {
    return false;
  }
  const { digest, ...payload } = check;
  return digest === computeSpatialV3CanonicalDigest(payload);
}
function firstEntryWritesMatch(plan) {
  const check = firstEntryPhysicalRecheck(plan);
  const g5Sites = plan.inserts.filter((write) => write.target_table === 'party_g5_sites');
  const baselines = plan.inserts.filter((write) => write.target_table === 'party_scene_baselines');
  const g6Instances = plan.inserts.filter((write) => write.target_table === 'party_g6_instances');
  const positions = plan.inserts.filter((write) => write.target_table === 'scene_position_nodes');
  const locations = plan.updates.filter((write) => write.target_table === 'party_journey_locations');
  const claimUpdates = plan.updates.filter((write) => write.target_table === 'preparation_claims');
  if (locations.length !== 1
    || locations[0].record.location_kind !== 'scene'
    || locations[0].record.scene_position_id !== check.position_id
    || claimUpdates.length !== 1
    || claimUpdates[0].id !== check.preparation_claim_id
    || claimUpdates[0].record.claim_status !== 'consumed'
    || claimUpdates[0].record.terminal_change_set_id !== plan.change_set_id) return false;
  if (check.baseline_disposition === 'reuse') {
    return !g5Sites.length && !baselines.length && !g6Instances.length && !positions.length;
  }
  const baseline = baselines[0];
  const g6 = g6Instances[0];
  const position = positions[0];
  return baselines.length === 1
    && g6Instances.length === 1
    && positions.length === 1
    && g5Sites.length <= 1
    && baseline.id === check.scene_baseline_id
    && baseline.record.host_kind === 'g5_site'
    && baseline.record.host_id === check.g5_site_id
    && g6.id === check.g6_instance_id
    && g6.record.scene_baseline_id === check.scene_baseline_id
    && g6.record.host_kind === 'g5_site'
    && g6.record.host_id === check.g5_site_id
    && position.id === check.position_id
    && position.record.g6_instance_id === check.g6_instance_id
    && (g5Sites.length === 0 || g5Sites[0].id === check.g5_site_id)
    && (g5Sites.length === 0 || g5Sites[0].record.parent_g4_id === check.g4_id)
    && (baseline.record.source_kind !== 'generated_template'
      || (g5Sites.length === 1 && g5Sites[0].record.origin === 'generated'));
}
export function firstEntryEvidenceMatches(check, evidence) {
  return evidence
    && Object.keys(evidence).sort().join('\u0000')
      === [...FIRST_ENTRY_BINDING_FIELDS].sort().join('\u0000')
    && FIRST_ENTRY_BINDING_FIELDS.every((field) => evidence[field] === check[field]);
}
export function validateSpatialV3CombinedWritePlan(plan) {
  if (!plan || plan.schema !== 'spatial_v3.combined_write_plan.v2' || !stable(plan.party_id) || !stable(plan.operation_kind) || !stable(plan.canonical_input_digest) || !stable(plan.digest) || computeSpatialV3CanonicalDigest(digestInput(plan)) !== plan.digest) return false;
  const writeSet = {
    inserts: plan.inserts,
    updates: plan.updates,
    appends: plan.appends,
    deletes: plan.deletes
  };
  if (computeSpatialV3CanonicalDigest(extensionDigestInput(plan, writeSet))
      !== plan.write_set_digest
      || computeSpatialV3CanonicalDigest(plan.expected_state_versions)
        !== plan.expected_state_versions_digest) return false;
  if (!validOrdinaryMaterializationExtension(plan)) return false;
  if (!validActionProductionExtension(plan)) return false;
  if (!validLocalFireExtension(plan)) return false;
  if (!['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].every((kind) => plan.commit_rechecks?.some((check) => check?.kind === kind && stable(check.digest))) || ['owner_keys', 'execution_keys', 'g4_keys', 'physical_keys'].some((key) => !Array.isArray(plan[key]) || plan[key].some((value) => !stable(value)))) return false;
  if (plan.operation_kind === 'first_entry') {
    if (!validFirstEntryPhysicalRecheck(plan)) return false;
  }
  const all = [
    ['insert', plan.inserts],
    ['update', plan.updates],
    ['append', plan.appends],
    ['delete', plan.deletes]
  ]; const keys = [];
  for (const [mode, writes] of all) {
    if (!Array.isArray(writes)) return false;
    for (const write of writes) {
      const spec = TABLES[write?.target_table];
      if (!spec
        || write.target_schema && write.target_schema !== 'party_runtime'
        || !spec.modes.includes(mode)
        || !write.record
        || (CHILD_TABLES.has(write.target_table)
          ? write.record.party_id != null
          : write.record.party_id !== plan.party_id)
        || !stable(write.id)
        || !validIdentity(write)) return false;
      keys.push(keyOf(write));
    }
  }
  const versionedMutableWrites = [...plan.updates, ...plan.deletes]
    .filter((write) => TABLES[write.target_table]?.version !== false);
  if (new Set(keys).size !== keys.length
    || versionedMutableWrites.length
      !== plan.expected_state_versions.length) return false;
  const keySet = new Set(keys);
  if ([...plan.inserts, ...plan.updates, ...plan.appends, ...plan.deletes].some((write) =>
    childParentKeys(write).some((parent) => !keySet.has(parent)))) return false;
  if (!keys.every((key) => plan.physical_keys.includes(key))) return false;
  const changes = plan.appends.filter((write) => write.target_table === 'party_v3_change_sets' && write.id === plan.change_set_id && write.record.operation_kind === plan.operation_kind && write.record.idempotency_record_id === plan.idempotency_record_id);
  if (changes.length !== 1) return false;
  if (plan.operation_kind === 'first_entry' && !firstEntryWritesMatch(plan)) return false;
  const visibleWrites = plan.appends.filter((write) => write.target_table === 'party_visible_packages');
  const narrationJobs = plan.inserts.filter((write) => write.target_table === 'party_narration_jobs');
  if (plan.write_plan_kind === 'semantic_commit') {
    const envelope = plan.visible_package_envelope;
    const expectedJobId = `narration-job:${envelope?.package_id ?? ''}`;
    if (validateSpatialV3Contract('visible_package_persistence_envelope', envelope).length
      || envelope?.party_id !== plan.party_id
      || envelope?.change_set_id !== plan.change_set_id
      || envelope?.idempotency_record_id !== plan.idempotency_record_id
      || envelope?.presentation_status !== 'pending'
      || envelope?.package_digest !== computeSpatialV3CanonicalDigest(envelope?.visible_payload)
      || visibleWrites.length !== 1
      || visibleWrites[0].id !== envelope?.package_id
      || computeSpatialV3CanonicalDigest(visibleWrites[0].record) !== computeSpatialV3CanonicalDigest(envelope)
      || narrationJobs.length !== 1
      || narrationJobs[0].id !== expectedJobId
      || computeSpatialV3CanonicalDigest(narrationJobs[0].record) !== computeSpatialV3CanonicalDigest({
        job_id: expectedJobId,
        party_id: plan.party_id,
        package_id: envelope?.package_id,
        status: 'pending',
        idempotency_key: `presentation:${envelope?.package_id}:${envelope?.package_digest}`
      })) return false;
  } else if (plan.visible_package_envelope != null || visibleWrites.length || narrationJobs.length) {
    return false;
  }
  return versionedMutableWrites.every((write) =>
    plan.expected_state_versions.some((item) =>
      item.target_table === write.target_table
      && item.id === write.id
      && Number.isInteger(item.state_version)
      && item.state_version >= 0));
}

function extensionDigestInput(plan, writeSet) {
  const ordinary = plan.ordinary_materialization_atomic_write_plan;
  const actions = plan.action_production_atomic_write_plans ?? [];
  const localFire=plan.local_fire_atomic_write_plan;
  if (ordinary == null && actions.length === 0 && localFire==null) return writeSet;
  if (actions.length === 0 && localFire==null) return { write_set: writeSet,
    ordinary_materialization_atomic_write_plan: ordinary };
  return { write_set: writeSet,
    ...(ordinary == null ? {} : {
      ordinary_materialization_atomic_write_plan: ordinary
    }),
    ...(actions.length===0?{}:{action_production_atomic_write_plans:actions}),
    ...(localFire==null?{}:{local_fire_atomic_write_plan:localFire}) };
}

function validOrdinaryMaterializationExtension(plan) {
  const ordinary = plan.ordinary_materialization_atomic_write_plan;
  if (ordinary == null) return true;
  try {
    const sealed = createOrdinaryMaterializationAtomicWritePlan(ordinary);
    const party = plan.updates?.find((write) => write.target_table === 'parties'
      && write.id === plan.party_id);
    return sealed.party_id === plan.party_id
      && party?.record?.party_id === plan.party_id
      && plan.expected_state_versions.some((version) =>
        version.target_table === 'parties' && version.id === plan.party_id
          && version.state_version === sealed.expected_versions.party_state_version)
      && plan.physical_keys.includes(
        `party_runtime.party_ordinary_materialization_aggregates:${sealed.party_id}:${sealed.scope_ref.entity_kind}:${sealed.scope_ref.entity_id}`)
      && (sealed.schema !== 'ordinary_container_contents_atomic_write_plan_v2'
        || plan.physical_keys.includes(
          `party_runtime.party_containers:${sealed.scope_ref.entity_id}`)
        && sealed.items.every((item) =>
          plan.physical_keys.includes(`party_runtime.party_items:${item.item_id}`)
          && plan.physical_keys.includes(
            `party_runtime.party_item_placements:${item.item_id}`)))
      && (sealed.finite_resource_transition == null || plan.physical_keys.includes(
        `party_runtime.party_resource_nodes:${sealed.party_id}:${sealed.finite_resource_transition.source_resource_node_id}`));
  } catch { return false; }
}
