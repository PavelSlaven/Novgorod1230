import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const TABLES = Object.freeze({
  party_v3_change_sets: { modes: ['append'], key: ['id'] },
  party_route_plan_execution_events: { modes: ['append'], key: ['execution_id', 'event_ordinal'] },
  party_traversal_interval_results: { modes: ['append'], key: ['id'] },
  party_timed_activity_attempts: { modes: ['append'], key: ['activity_execution_id', 'attempt_ordinal'] },
  party_activity_resource_bindings: { modes: ['append'], key: ['activity_execution_id', 'resource_kind', 'resource_id', 'binding_kind', 'change_set_id'] },
  party_temporal_event_subjects: { modes: ['append'], key: ['event_id', 'subject_kind', 'subject_id', 'subject_role'] },
  party_temporal_event_dependencies: { modes: ['append'], key: ['event_id', 'depends_on_event_id'] },
  party_npc_runtime_transitions: { modes: ['append'], key: ['transition_id'] },
  party_perception_records: { modes: ['append'], key: ['perception_id'] },
  party_perception_witnesses: { modes: ['append'], key: ['perception_id', 'witness_kind', 'witness_id'] },
  party_npc_decision_traces: { modes: ['append'], key: ['request_id'] },
  party_body_temporal_history: { modes: ['append'], key: ['history_id'] },
  party_visible_packages: { modes: ['append'], key: ['package_id'] },
  party_route_plan_executions: { modes: ['update'], key: ['id'], version: true },
  party_timed_activity_executions: { modes: ['insert', 'update'], key: ['id'], version: true },
  traveller_travel_states: { modes: ['update'], key: ['id'], version: true },
  party_journey_locations: { modes: ['update'], key: ['id'], version: true },
  party_clocks: { modes: ['update'], key: ['party_id'], version: true },
  party_carrier_attachments: { modes: ['update'], key: ['id'], version: true },
  party_npc_spatial_schedules: { modes: ['update'], key: ['id'], version: true },
  entity_placements: { modes: ['update'], key: ['party_id', 'entity_kind', 'entity_id'], version: true },
  expansion_frontiers: { modes: ['update'], key: ['id'], version: true },
  expansion_capacity_reservations: { modes: ['update'], key: ['id'], version: true },
  party_activity_participant_bindings: { modes: ['insert', 'update'], key: ['activity_execution_id', 'participant_kind', 'participant_id'], version: true },
  party_temporal_events: { modes: ['insert', 'update'], key: ['event_id'], version: true },
  party_remote_aggregate_states: { modes: ['insert', 'update'], key: ['aggregate_id'], version: true },
  party_propagation_processes: { modes: ['insert', 'update'], key: ['process_id'], version: true },
  party_route_plans: { modes: ['insert'], key: ['id'] },
  party_route_plan_steps: { modes: ['insert'], key: ['route_plan_id', 'ordinal'] },
  preparation_claims: { modes: ['insert'], key: ['id'] },
  party_cohorts: { modes: ['insert'], key: ['id'] },
  party_cohort_memberships: { modes: ['insert'], key: ['id'] },
  party_narration_jobs: { modes: ['insert'], key: ['job_id'] }
});
const CHILD_TABLES = new Set([
  'party_route_plan_execution_events',
  'party_traversal_interval_results',
  'party_timed_activity_attempts',
  'party_timed_activity_executions',
  'party_route_plan_steps',
  'party_activity_participant_bindings',
  'party_activity_resource_bindings',
  'party_temporal_event_subjects',
  'party_temporal_event_dependencies',
  'party_perception_witnesses'
]);
const IDENT = /^[a-z_][a-z0-9_]*$/u;
const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const quote = (value) => { if (!IDENT.test(String(value ?? ''))) throw Object.assign(new Error('unsafe identifier'), { spatialCode: 'generated_schema_mismatch' }); return `\"${value}\"`; };
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
const error = (code, party_id, diagnostics = {}) => createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics });
const digestInput = (plan) => { const { digest, ...value } = plan; return value; };
const keyOf = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
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
                          : write?.target_table === 'party_npc_decision_traces' ? write.record?.request_id === write.id
                            : write?.target_table === 'party_body_temporal_history' ? write.record?.history_id === write.id
                              : write?.target_table === 'party_remote_aggregate_states' ? write.record?.aggregate_id === write.id
                                : write?.target_table === 'party_propagation_processes' ? write.record?.process_id === write.id
                                  : write?.record?.id === write?.id;
function childParentKey(write) {
  switch (write?.target_table) {
    case 'party_activity_participant_bindings':
    case 'party_activity_resource_bindings':
    case 'party_timed_activity_attempts':
      return `party_runtime.party_timed_activity_executions:${write.record?.activity_execution_id}`;
    case 'party_timed_activity_executions':
    case 'party_route_plan_execution_events':
    case 'party_traversal_interval_results':
      return `party_runtime.party_route_plan_executions:${write.record?.route_plan_execution_id ?? write.record?.execution_id}`;
    case 'party_route_plan_steps':
      return `party_runtime.party_route_plans:${write.record?.route_plan_id}`;
    case 'party_temporal_event_subjects':
    case 'party_temporal_event_dependencies':
      return `party_runtime.party_temporal_events:${write.record?.event_id}`;
    case 'party_npc_runtime_transitions':
    case 'party_perception_records':
      return write.record?.event_id ? `party_runtime.party_temporal_events:${write.record.event_id}` : null;
    case 'party_perception_witnesses':
      return `party_runtime.party_perception_records:${write.record?.perception_id}`;
    case 'party_visible_packages':
      return `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`;
    case 'party_narration_jobs':
      return `party_runtime.party_visible_packages:${write.record?.package_id}`;
    default:
      return null;
  }
}

function orderingParentKeys(write) {
  const parents = new Set();
  const required = childParentKey(write);
  if (required) parents.add(required);
  if (write?.target_table === 'party_temporal_event_dependencies' && write.record?.depends_on_event_id) {
    parents.add(`party_runtime.party_temporal_events:${write.record.depends_on_event_id}`);
  }
  if (write?.target_table === 'party_propagation_processes' && write.record?.aggregate_id) {
    parents.add(`party_runtime.party_remote_aggregate_states:${write.record.aggregate_id}`);
  }
  if (write?.target_table === 'party_npc_spatial_schedules' && write.record?.current_activity_execution_id) {
    parents.add(`party_runtime.party_timed_activity_executions:${write.record.current_activity_execution_id}`);
  }
  return [...parents];
}

function orderWrites(plan) {
  const modeRank = Object.freeze({ update: 0, insert: 1, append: 2 });
  const pending = new Map([
    ...plan.updates.map((write) => [keyOf(write), { mode: 'update', write }]),
    ...plan.inserts.map((write) => [keyOf(write), { mode: 'insert', write }]),
    ...plan.appends.map((write) => [keyOf(write), { mode: 'append', write }])
  ]);
  const planKeys = new Set(pending.keys());
  const completed = new Set();
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.entries()]
      .filter(([, entry]) => orderingParentKeys(entry.write)
        .filter((parent) => planKeys.has(parent))
        .every((parent) => completed.has(parent)))
      .sort((left, right) => modeRank[left[1].mode] - modeRank[right[1].mode] || left[0].localeCompare(right[0]));
    if (!ready.length) throw Object.assign(new Error('write dependency cycle'), { spatialCode: 'generated_schema_mismatch' });
    for (const [key, entry] of ready) {
      pending.delete(key);
      completed.add(key);
      ordered.push(entry);
    }
  }
  return ordered;
}
const lockOrder = (plan) => [
  `01:clock:${plan.party_id}`,
  ...[...new Set(plan.owner_keys ?? [])].sort().map((key) => `02:owner:${key}`),
  ...[...new Set(plan.execution_keys ?? [])].sort().map((key) => `03:execution:${key}`),
  ...[...new Set(plan.g4_keys ?? [])].sort().map((key) => `04:g4:${key}`),
  ...[...new Set(plan.physical_keys)].sort().map((key) => `05:physical:${key}`),
  `06:change-set:${plan.change_set_id}`, `06:idempotency:${plan.idempotency_record_id}`
];
export function validateSpatialV3CombinedWritePlan(plan) {
  if (!plan || plan.schema !== 'spatial_v3.combined_write_plan.v2' || !stable(plan.party_id) || !stable(plan.operation_kind) || !stable(plan.canonical_input_digest) || !stable(plan.digest) || computeSpatialV3CanonicalDigest(digestInput(plan)) !== plan.digest) return false;
  if (computeSpatialV3CanonicalDigest({ inserts: plan.inserts, updates: plan.updates, appends: plan.appends }) !== plan.write_set_digest || computeSpatialV3CanonicalDigest(plan.expected_state_versions) !== plan.expected_state_versions_digest) return false;
  if (!['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].every((kind) => plan.commit_rechecks?.some((check) => check?.kind === kind && stable(check.digest))) || ['owner_keys', 'execution_keys', 'g4_keys', 'physical_keys'].some((key) => !Array.isArray(plan[key]) || plan[key].some((value) => !stable(value)))) return false;
  const all = [['insert', plan.inserts], ['update', plan.updates], ['append', plan.appends]]; const keys = [];
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
  if (new Set(keys).size !== keys.length || plan.updates.length !== plan.expected_state_versions.length) return false;
  const keySet = new Set(keys);
  if ([...plan.inserts, ...plan.updates, ...plan.appends].some((write) => childParentKey(write) && !keySet.has(childParentKey(write)))) return false;
  if (!keys.every((key) => plan.physical_keys.includes(key))) return false;
  const changes = plan.appends.filter((write) => write.target_table === 'party_v3_change_sets' && write.id === plan.change_set_id && write.record.operation_kind === plan.operation_kind && write.record.idempotency_record_id === plan.idempotency_record_id);
  if (changes.length !== 1) return false;
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
  return plan.updates.every((write) => plan.expected_state_versions.some((item) => item.target_table === write.target_table && item.id === write.id && Number.isInteger(item.state_version) && item.state_version >= 0));
}
async function apply(tx, write, mode, expectedStateVersion = null, sealedPlan = null) {
  const spec = TABLES[write.target_table]; const record = write.target_table === 'party_v3_change_sets' ? { ...Object.fromEntries(Object.entries(write.record).filter(([key]) => key !== 'idempotency_record_id')), expected_state_version_set_digest: sealedPlan.expected_state_versions_digest.replace('sha256:', ''), expected_state_version_set: sealedPlan.expected_state_versions, committed_state_version_set_digest: sealedPlan.expected_state_versions_digest.replace('sha256:', ''), write_plan_digest: sealedPlan.write_set_digest.replace('sha256:', '') } : write.record; const columns = Object.keys(record); const table = `party_runtime.${quote(write.target_table)}`;
  if (mode === 'update') { const expected = expectedStateVersion; if (!Number.isInteger(expected) || expected < 0) throw Object.assign(new Error('update lacks expected version'), { spatialCode: 'state_version_conflict' }); const set = columns.filter((column) => !spec.key.includes(column) && column !== 'state_version'); const where = spec.key.map((column, index) => `${quote(column)}=$${set.length + index + 1}`).concat(`state_version=$${set.length + spec.key.length + 1}`); const params = [...set.map((column) => record[column]), ...spec.key.map((column) => record[column]), expected]; const result = await tx.query(`UPDATE ${table} SET ${set.map((column, index) => `${quote(column)}=$${index + 1}`).join(', ')}, state_version=state_version+1 WHERE ${where.join(' AND ')}`, params); if (result.rowCount !== 1) throw Object.assign(new Error('stale state version'), { spatialCode: 'state_version_conflict' }); return; }
  const values = columns.map((column) => Array.isArray(record[column]) ? JSON.stringify(record[column]) : record[column]); await tx.query(`INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`, values);
}

export function createSpatialV3CombinedAtomicCommitter({ withTransaction, recheck, now = () => new Date() } = {}) {
  return Object.freeze({ async commit({ plan, created_at_turn = 0, recheck: commitRecheck = recheck } = {}) {
    if (!validateSpatialV3CombinedWritePlan(plan)) return Object.freeze({ ok: false, error: error('generated_schema_mismatch', plan?.party_id, { reason: 'untrusted or non-whitelisted combined write plan' }) });
    if (typeof withTransaction !== 'function' || typeof commitRecheck !== 'function') return Object.freeze({ ok: false, error: error('generated_schema_mismatch', plan.party_id, { reason: 'transaction owner and full recheck port required' }) });
    try { return await withTransaction(async (tx) => {
      const locks = lockOrder(plan); for (const lock of locks) await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
      const existingChangeSet = await tx.query('SELECT party_id,operation_kind,expected_state_version_set_digest,write_plan_digest FROM party_runtime.party_v3_change_sets WHERE id=$1 FOR UPDATE', [plan.change_set_id]);
      const expectedPlanDigest = plan.write_set_digest.replace('sha256:', ''); const expectedVersionDigest = plan.expected_state_versions_digest.replace('sha256:', '');
      if (existingChangeSet.rows.length && (existingChangeSet.rows[0].party_id !== plan.party_id || existingChangeSet.rows[0].operation_kind !== plan.operation_kind || existingChangeSet.rows[0].write_plan_digest !== expectedPlanDigest || existingChangeSet.rows[0].expected_state_version_set_digest !== expectedVersionDigest)) throw Object.assign(new Error('persisted change set conflicts with sealed plan'), { spatialCode: 'state_version_conflict' });
      const idem = await tx.query(`SELECT id,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,result_change_set_id,terminal_failure_code,terminal_failure_digest,state_version FROM party_runtime.party_command_idempotency WHERE party_id=$1 AND operation_kind=$2 AND idempotency_key=$3 FOR UPDATE`, [plan.party_id, plan.operation_kind, plan.idempotency_key]);
      const expectedDigest = plan.expected_state_versions_digest.replace('sha256:', '');
      if (idem.rows.length) {
        const row = idem.rows[0];
        if (row.canonical_input_digest !== plan.canonical_input_digest.replace('sha256:', '') || row.expected_state_version_set_digest !== expectedDigest) {
          throw Object.assign(new Error('idempotency input mismatch'), { spatialCode: 'idempotency_conflict' });
        }
        if (row.status === 'committed') {
          if (row.result_change_set_id !== plan.change_set_id || existingChangeSet.rows.length !== 1) {
            throw Object.assign(new Error('idempotency replay does not match the sealed change set'), { spatialCode: 'idempotency_conflict' });
          }
          return Object.freeze({ ok: true, replay: true, change_set_id: row.result_change_set_id });
        }
        if (existingChangeSet.rows.length) {
          throw Object.assign(new Error('nonterminal idempotency state already has a committed change set'), { spatialCode: 'state_version_conflict' });
        }
        if (row.status === 'failed_terminal') return Object.freeze({ ok: false, terminal: true, error: error(row.terminal_failure_code, plan.party_id, { replay: true }) });
        if (row.status !== 'leased' || new Date(row.lease_expires_at) > now()) return Object.freeze({ ok: false, in_progress: true, error: error('idempotency_conflict', plan.party_id, { reason: 'unexpired lease' }) });
        const reclaim = await tx.query(`UPDATE party_runtime.party_command_idempotency SET lease_token=$1,lease_expires_at=$2,state_version=state_version+1 WHERE id=$3 AND state_version=$4 AND status='leased'`, [`lease:${plan.plan_id}`, new Date(now().getTime() + 30000), row.id, row.state_version]);
        if (reclaim.rowCount !== 1) throw Object.assign(new Error('lease CAS failed'), { spatialCode: 'idempotency_conflict' });
      } else {
        if (existingChangeSet.rows.length) throw Object.assign(new Error('committed change set lacks its idempotency record'), { spatialCode: 'state_version_conflict' });
        await tx.query(`INSERT INTO party_runtime.party_command_idempotency (id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,created_at_turn) VALUES ($1,$2,$3,$4,$5,$6,'leased',$7,$8,$9)`, [plan.idempotency_record_id, plan.party_id, plan.operation_kind, plan.idempotency_key, plan.canonical_input_digest.replace('sha256:', ''), expectedDigest, `lease:${plan.plan_id}`, new Date(now().getTime() + 30000), created_at_turn]);
      }
      for (const check of plan.commit_rechecks) { const result = await commitRecheck({ transaction: tx, party_id: plan.party_id, check: structuredClone(check), plan_digest: plan.digest, plan }); if (!result?.ok) throw Object.assign(new Error(`commit recheck failed: ${check.kind}`), { spatialCode: result?.code ?? 'state_version_conflict' }); }
      for (const { mode, write } of orderWrites(plan)) {
        const expectedStateVersion = mode === 'update'
          ? plan.expected_state_versions.find((item) => item.target_table === write.target_table && item.id === write.id).state_version
          : null;
        await apply(tx, write, mode, expectedStateVersion, plan);
      }
      const settled = await tx.query(`UPDATE party_runtime.party_command_idempotency SET status='committed',result_change_set_id=$1,lease_token=NULL,lease_expires_at=NULL,finalized_at_turn=$2,state_version=state_version+1 WHERE party_id=$3 AND operation_kind=$4 AND idempotency_key=$5 AND status='leased'`, [plan.change_set_id, created_at_turn, plan.party_id, plan.operation_kind, plan.idempotency_key]); if (settled.rowCount !== 1) throw Object.assign(new Error('idempotency settle failed'), { spatialCode: 'idempotency_conflict' });
      return Object.freeze({ ok: true, replay: false, change_set_id: plan.change_set_id, lock_keys: Object.freeze(locks) });
    }); } catch (cause) { return Object.freeze({ ok: false, error: error(cause.spatialCode ?? 'generated_schema_mismatch', plan.party_id, { reason: cause.message }) }); }
  } });
}

/** P16 owns the PostgreSQL transaction boundary for every target-v3 writer. */
export function createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck, now } = {}) {
  if (!pool?.connect) throw new TypeError('P16 PostgreSQL committer requires a pg pool');
  return createSpatialV3CombinedAtomicCommitter({
    now,
    recheck,
    withTransaction: async (work) => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await work(client); if (!result?.ok) { await client.query('ROLLBACK'); return result; } await client.query('COMMIT'); return result; }
      catch (cause) { await client.query('ROLLBACK').catch(() => {}); throw cause; }
      finally { client.release(); }
    }
  });
}
