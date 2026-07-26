import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  TABLES,
  error,
  quote
} from './spatial-v3-write-layout.js';
import { orderWrites } from './spatial-v3-write-order.js';
import {
  firstEntryEvidenceMatches,
  lockOrder,
  validateSpatialV3CombinedWritePlan
} from './spatial-v3-write-plan-validation.js';
import {
  applySealedLifecycleInsert
} from './spatial-v3-lifecycle-insert.js';

export { validateSpatialV3CombinedWritePlan };

async function apply(tx, write, mode, expectedStateVersion = null, sealedPlan = null, committedAtTurn = 0) {
  const spec = TABLES[write.target_table]; const record = write.target_table === 'party_v3_change_sets' ? { ...Object.fromEntries(Object.entries(write.record).filter(([key]) => !['idempotency_record_id', 'created_at_turn', 'committed_at_turn'].includes(key))), expected_state_version_set_digest: sealedPlan.expected_state_versions_digest.replace('sha256:', ''), expected_state_version_set: sealedPlan.expected_state_versions, committed_state_version_set_digest: sealedPlan.expected_state_versions_digest.replace('sha256:', ''), write_plan_digest: sealedPlan.write_set_digest.replace('sha256:', ''), created_at_turn: committedAtTurn, committed_at_turn: committedAtTurn } : write.record; const columns = Object.keys(record); const table = `party_runtime.${quote(write.target_table)}`;
  if (mode === 'update') { const expected = expectedStateVersion; if (!Number.isInteger(expected) || expected < 0) throw Object.assign(new Error('update lacks expected version'), { spatialCode: 'state_version_conflict' }); const set = columns.filter((column) => !spec.key.includes(column) && column !== 'state_version'); const where = spec.key.map((column, index) => `${quote(column)}=$${set.length + index + 1}`).concat(`state_version=$${set.length + spec.key.length + 1}`); const params = [...set.map((column) => record[column]), ...spec.key.map((column) => record[column]), expected]; const result = await tx.query(`UPDATE ${table} SET ${set.map((column, index) => `${quote(column)}=$${index + 1}`).join(', ')}, state_version=state_version+1 WHERE ${where.join(' AND ')}`, params); if (result.rowCount !== 1) throw Object.assign(new Error('stale state version'), { spatialCode: 'state_version_conflict' }); return; }
  if (mode === 'delete') { const expected = expectedStateVersion; if (!Number.isInteger(expected) || expected < 0) throw Object.assign(new Error('delete lacks expected version'), { spatialCode: 'state_version_conflict' }); const where = spec.key.map((column, index) => `${quote(column)}=$${index + 1}`).concat(`state_version=$${spec.key.length + 1}`); const params = [...spec.key.map((column) => record[column]), expected]; const result = await tx.query(`DELETE FROM ${table} WHERE ${where.join(' AND ')}`, params); if (result.rowCount !== 1) throw Object.assign(new Error('stale state version'), { spatialCode: 'state_version_conflict' }); return; }
  const lifecycleFinalizer = await applySealedLifecycleInsert(tx, {
    ...write,
    record
  });
  if (lifecycleFinalizer) return lifecycleFinalizer;
  const values = columns.map((column) => Array.isArray(record[column]) ? JSON.stringify(record[column]) : record[column]); await tx.query(`INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`, values);
}

export function createSpatialV3CombinedAtomicCommitter({ withTransaction, recheck, now = () => new Date() } = {}) {
  return Object.freeze({ async commit({ plan, created_at_turn = 0, recheck: commitRecheck = recheck } = {}) {
    if (!validateSpatialV3CombinedWritePlan(plan)) return Object.freeze({ ok: false, error: error('generated_schema_mismatch', plan?.party_id, { reason: 'untrusted or non-whitelisted combined write plan' }) });
    if (!Number.isSafeInteger(created_at_turn) || created_at_turn < 0) return Object.freeze({ ok: false, error: error('generated_schema_mismatch', plan.party_id, { reason: 'commit turn must be one non-negative safe integer' }) });
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
        await tx.query(
          `INSERT INTO party_runtime.party_command_idempotency
           (id,party_id,operation_kind,idempotency_key,
            canonical_input_digest,expected_state_version_set_digest,
            status,lease_token,lease_expires_at,created_at_turn,
            semantic_command_snapshot,semantic_command_digest,
            semantic_dependency_pins,request_id)
           VALUES ($1,$2,$3,$4,$5,$6,'leased',$7,$8,$9,
             $10::jsonb,$11,$12::jsonb,$13)`,
          [
            plan.idempotency_record_id,
            plan.party_id,
            plan.operation_kind,
            plan.idempotency_key,
            plan.canonical_input_digest.replace('sha256:', ''),
            expectedDigest,
            `lease:${plan.plan_id}`,
            new Date(now().getTime() + 30000),
            created_at_turn,
            plan.semantic_command_snapshot == null
              ? null
              : JSON.stringify(plan.semantic_command_snapshot),
            plan.semantic_command_digest?.replace('sha256:', '') ?? null,
            plan.semantic_dependency_pins == null
              ? null
              : JSON.stringify(plan.semantic_dependency_pins),
            plan.request_id
          ]
        );
      }
      for (const check of plan.commit_rechecks) {
        const result = await commitRecheck({
          transaction: tx,
          party_id: plan.party_id,
          check: structuredClone(check),
          plan_digest: plan.digest,
          plan
        });
        if (!result?.ok) {
          throw Object.assign(new Error(`commit recheck failed: ${check.kind}`), {
            spatialCode: result?.code ?? 'state_version_conflict'
          });
        }
        if (plan.operation_kind === 'first_entry'
          && check.kind === 'physical'
          && !firstEntryEvidenceMatches(check, result.first_entry_binding)) {
          throw Object.assign(
            new Error('first_entry physical recheck did not attest the sealed preparation-member chain'),
            { spatialCode: 'target_preparation_failed' }
          );
        }
      }
      const lifecycleFinalizers = [];
      for (const { mode, write } of orderWrites(plan)) {
        const expectedStateVersion = mode === 'update' || mode === 'delete'
          ? plan.expected_state_versions.find((item) => item.target_table === write.target_table && item.id === write.id).state_version
          : null;
        const finalizeLifecycle = await apply(
          tx,
          write,
          mode,
          expectedStateVersion,
          plan,
          created_at_turn
        );
        if (finalizeLifecycle) {
          lifecycleFinalizers.push(finalizeLifecycle);
        }
      }
      for (const finalizeLifecycle of lifecycleFinalizers) {
        await finalizeLifecycle();
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
