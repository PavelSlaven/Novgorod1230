import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';

const clone = (value) => structuredClone(value);
const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
const fail = (code, party_id, diagnostics = {}) => Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics }) });
const identity = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
const canonicalWrites = (writes) => [...writes].sort((a, b) => identity(a).localeCompare(identity(b)));
const ALLOWED = new Set(['party_v3_change_sets', 'party_route_plan_execution_events', 'party_traversal_interval_results', 'party_timed_activity_attempts', 'party_route_plan_executions', 'party_timed_activity_executions', 'traveller_travel_states', 'party_journey_locations', 'party_clocks', 'party_carrier_attachments', 'entity_placements', 'expansion_frontiers', 'expansion_capacity_reservations', 'party_route_plans', 'party_route_plan_steps', 'preparation_claims', 'party_cohorts', 'party_cohort_memberships']);
const validIdentity = (write) => write?.target_table === 'entity_placements'
  ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'party_clocks' ? write.record?.party_id === write.id
    : write?.target_table === 'party_route_plan_execution_events' ? write.id === `${write.record?.execution_id}:${write.record?.event_ordinal}`
      : write?.record?.id === write?.id;
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }

/** Builds no domain decision: its verifier attests pre-approved input and it only seals the three physical write sets. */
export async function buildCombinedWritePlan(input = {}, { verifyApproval } = {}) {
  const { plan_id, party_id, write_plan_kind, operation_kind, canonical_input_digest, expected_state_versions, validation_report, idempotency, change_set, approved_write_sets, lock_context, commit_rechecks } = input;
  if (![plan_id, party_id, operation_kind, canonical_input_digest, idempotency?.id, idempotency?.key, change_set?.id].every(stable) || !['semantic_commit', 'blocked_audit'].includes(write_plan_kind) || !Array.isArray(expected_state_versions) || !Array.isArray(approved_write_sets) || !lock_context || !Array.isArray(commit_rechecks) || typeof verifyApproval !== 'function') return fail('generated_schema_mismatch', party_id, { reason: 'complete combined-write input and injected approval verifier are required' });
  const requiredRechecks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'];
  if (!requiredRechecks.every((kind) => commit_rechecks.some((check) => check?.kind === kind && stable(check?.digest))) || ['owner_keys', 'execution_keys', 'g4_keys', 'physical_keys'].some((key) => !Array.isArray(lock_context[key]) || lock_context[key].some((value) => !stable(value)))) return fail('generated_schema_mismatch', party_id, { reason: 'complete lock context and commit rechecks are required' });
  if (!validation_report || !['pass', 'pass_with_notes', 'blocked'].includes(validation_report.status) || !stable(validation_report.digest)) return fail('generated_schema_mismatch', party_id, { reason: 'validation report is malformed' });
  if ((write_plan_kind === 'semantic_commit' && !['pass', 'pass_with_notes'].includes(validation_report.status)) || (write_plan_kind === 'blocked_audit' && validation_report.status !== 'blocked')) return fail('generated_schema_mismatch', party_id, { reason: 'plan kind and validation status disagree' });
  const verified = await verifyApproval(clone({ party_id, operation_kind, canonical_input_digest, validation_report, approved_write_sets }));
  if (!verified?.ok) return fail('generated_schema_mismatch', party_id, { reason: 'approved write set verifier rejected input' });
  const sets = { inserts: [], updates: [], appends: [] };
  for (const set of approved_write_sets) for (const mode of Object.keys(sets)) for (const write of set?.[mode] ?? []) sets[mode].push({ ...clone(write), operation_mode: mode });
  if (Object.values(sets).some((writes) => writes.some((write) => !ALLOWED.has(write?.target_table) || write.target_schema && write.target_schema !== 'party_runtime' || !stable(write?.id) || !write.record || !validIdentity(write) || (write.target_table !== 'party_route_plan_execution_events' && write.record.party_id !== party_id)))) return fail('generated_schema_mismatch', party_id, { reason: 'write record is not a known party-owned shape' });
  for (const mode of Object.keys(sets)) sets[mode] = canonicalWrites(sets[mode]);
  const identities = Object.values(sets).flat().map(identity);
  if (new Set(identities).size !== identities.length) return fail('state_version_conflict', party_id, { reason: 'insert/update/append identities must be disjoint' });
  if (!identities.every((value) => lock_context.physical_keys.includes(value))) return fail('lock_order_violation', party_id, { reason: 'every physical write must declare its exact physical lock key' });
  const changes = sets.appends.filter((write) => write.target_table === 'party_v3_change_sets' && write.id === change_set.id);
  if (changes.length !== 1 || changes[0].record.party_id !== party_id || changes[0].record.operation_kind !== operation_kind || changes[0].record.idempotency_record_id !== idempotency.id) return fail('generated_schema_mismatch', party_id, { reason: 'one matching append-only change set is required' });
  const updateKeys = new Set(sets.updates.map(identity));
  if (expected_state_versions.length !== sets.updates.length || expected_state_versions.some((expected) => !stable(expected?.target_table) || !stable(expected?.id) || !Number.isInteger(expected.state_version) || expected.state_version < 0 || !updateKeys.has(`${expected.target_schema ?? 'party_runtime'}.${expected.target_table}:${expected.id}`))) return fail('state_version_conflict', party_id, { reason: 'every mutable update requires one expected version' });
  if (write_plan_kind === 'blocked_audit' && (sets.inserts.length || sets.updates.length || sets.appends.some((write) => !['party_v3_change_sets', 'party_command_idempotency', 'party_route_plan_execution_events'].includes(write.target_table)))) return fail('generated_schema_mismatch', party_id, { reason: 'blocked audit may append audit rows only' });
  const write_set = { inserts: sets.inserts, updates: sets.updates, appends: sets.appends };
  const write_set_digest = computeSpatialV3CanonicalDigest(write_set);
  const plan = { schema: 'spatial_v3.combined_write_plan.v2', plan_id, party_id, write_plan_kind, operation_kind, canonical_input_digest, expected_state_versions: clone(expected_state_versions), expected_state_versions_digest: computeSpatialV3CanonicalDigest(expected_state_versions), validation_report_digest: validation_report.digest, idempotency_record_id: idempotency.id, idempotency_key: idempotency.key, parent_idempotency_key: idempotency.parent_key ?? null, change_set_id: change_set.id, owner_keys: [...lock_context.owner_keys].sort(), execution_keys: [...lock_context.execution_keys].sort(), g4_keys: [...lock_context.g4_keys].sort(), physical_keys: [...lock_context.physical_keys].sort(), commit_rechecks: clone(commit_rechecks).sort((a, b) => a.kind.localeCompare(b.kind) || a.digest.localeCompare(b.digest)), write_set_digest, ...write_set };
  return freeze({ ok: true, plan: { ...plan, digest: computeSpatialV3CanonicalDigest(plan) } });
}
