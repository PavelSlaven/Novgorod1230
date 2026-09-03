import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { queryWithTurnDeadline, withTurnDeadlineTransaction } from
  './query-with-turn-deadline.js';

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const clone = (value) => structuredClone(value);

function required(input, ...names) {
  for (const name of names) if (!text(input?.[name])) throw new TypeError(`presentation ${name} is required`);
}

const attemptId = (jobId, ordinal) => `${jobId}:attempt:${ordinal}`;
const claimToken = (jobId, ordinal) => `claim:${jobId}:${ordinal}`;
const leaseAt = (now, duration) => new Date(now.getTime() + duration);

/**
 * The presentation worker owns only the mutable narration job.  The factual
 * visible package is read under a key-share lock and is never updated here.
 */
export function createTemporalPresentationPostgresStore({ pool, now = () => new Date(), leaseDurationMs = 30000 } = {}) {
  if (!pool?.connect || typeof pool.query !== 'function') throw new TypeError('temporal presentation store requires a pg pool');
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) throw new TypeError('leaseDurationMs must be a positive integer');

  async function transaction(work, turnBudget = null) {
    if (Number.isFinite(turnBudget?.remaining?.()?.deadline_ms)) {
      return withTurnDeadlineTransaction(pool, turnBudget, work);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async function lock(tx, partyId, packageId, packageDigest) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`07:presentation:${partyId}:${packageId}`]);
    const pkg = await tx.query(`SELECT package_id,party_id,turn_id,committed_state_version,change_set_id,package_digest,visible_payload,presentation_status,projection_policy_ref,dependency_pins,idempotency_record_id
      FROM party_runtime.party_visible_packages WHERE party_id=$1 AND package_id=$2 AND package_digest=$3 FOR KEY SHARE`, [partyId, packageId, packageDigest]);
    if (pkg.rowCount !== 1) throw new Error('committed visible package not found');
    return pkg.rows[0];
  }

  async function jobForUpdate(tx, partyId, packageId, key) {
    const result = await tx.query(`SELECT job_id,party_id,package_id,status,idempotency_key,next_attempt_ordinal,active_attempt_id,claim_token,lease_expires_at,narration_output,output_digest,state_version
      FROM party_runtime.party_narration_jobs WHERE party_id=$1 AND package_id=$2 AND idempotency_key=$3 FOR UPDATE`, [partyId, packageId, key]);
    if (result.rowCount !== 1) throw new Error('presentation job not found');
    return result.rows[0];
  }

  return Object.freeze({
    async loadCommittedVisiblePackage(input = {}) {
      required(input, 'party_id', 'package_id', 'package_digest');
      const result = await queryWithTurnDeadline(pool, {
        text: `SELECT package_id,party_id,turn_id,committed_state_version,change_set_id,package_digest,visible_payload,presentation_status,projection_policy_ref,dependency_pins,idempotency_record_id
        FROM party_runtime.party_visible_packages WHERE party_id=$1 AND package_id=$2 AND package_digest=$3`,
        values: [input.party_id, input.package_id, input.package_digest]
      }, input.turnBudget);
      if (result.rowCount !== 1) return Object.freeze({ ok: false, envelope: null });
      return Object.freeze({ ok: true, envelope: clone(result.rows[0]) });
    },

    async claimPresentationAttempt(input = {}) {
      required(input, 'party_id', 'package_id', 'package_digest', 'presentation_idempotency_key');
      return transaction(async (tx) => {
        const pkg = await lock(tx, input.party_id, input.package_id, input.package_digest);
        let job = await jobForUpdate(tx, input.party_id, input.package_id, input.presentation_idempotency_key);
        const key = `presentation:${pkg.package_id}:${pkg.package_digest}`;
        if (job.idempotency_key !== key) throw new Error('presentation idempotency conflict');
        if (job.status === 'delivered' || job.status === 'output_ready') {
          if (!Number.isInteger(job.next_attempt_ordinal) || job.next_attempt_ordinal <= 0) throw new Error('presentation attempt cursor is invalid');
          const persistedAttemptId = attemptId(job.job_id, job.next_attempt_ordinal - 1);
          return Object.freeze({ ok: true, disposition: job.status, attempt_id: persistedAttemptId, narration_result: clone(job.narration_output), output_digest: job.output_digest, presentation_outcome: job.status === 'delivered' ? { presentation_status: 'delivered', attempt_id: persistedAttemptId, output_digest: job.output_digest } : null });
        }
        const clock = now();
        if (job.status === 'in_progress' && new Date(job.lease_expires_at) > clock) return Object.freeze({ ok: true, disposition: 'in_progress', attempt_id: job.active_attempt_id });
        if (job.status === 'in_progress') {
          const stateVersion = Number(job.state_version);
          if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) throw new Error('presentation state version is invalid');
          await tx.query(`INSERT INTO party_runtime.party_narration_attempts (attempt_id,job_id,attempt_ordinal,outcome,failure_code,failure_metadata)
            VALUES ($1,$2,$3,'failed_retryable','lease_expired',$4)`, [job.active_attempt_id, job.job_id, job.next_attempt_ordinal - 1, JSON.stringify({ reason: 'lease_expired' })]);
          const released = await tx.query(`UPDATE party_runtime.party_narration_jobs SET status='failed_retryable',active_attempt_id=NULL,claim_token=NULL,lease_expires_at=NULL,state_version=state_version+1
            WHERE job_id=$1 AND status='in_progress' AND state_version=$2`, [job.job_id, stateVersion]);
          if (released.rowCount !== 1) throw new Error('presentation lease release CAS failed');
          job = { ...job, status: 'failed_retryable', state_version: stateVersion + 1 };
        }
        if (!['pending', 'failed_retryable'].includes(job.status)) throw new Error('presentation job lifecycle conflict');
        const ordinal = job.next_attempt_ordinal;
        const id = attemptId(job.job_id, ordinal); const token = claimToken(job.job_id, ordinal);
        const claimed = await tx.query(`UPDATE party_runtime.party_narration_jobs SET status='in_progress',next_attempt_ordinal=$1,active_attempt_id=$2,claim_token=$3,lease_expires_at=$4,state_version=state_version+1
          WHERE job_id=$5 AND status=$6 AND state_version=$7`, [ordinal + 1, id, token, leaseAt(clock, leaseDurationMs), job.job_id, job.status, job.state_version]);
        if (claimed.rowCount !== 1) throw new Error('presentation claim CAS failed');
        return Object.freeze({ ok: true, disposition: 'claimed', attempt_id: id, claim_token: token });
      }, input.turnBudget);
    },

    async persistNarrationOutput(input = {}) {
      required(input, 'party_id', 'package_id', 'package_digest', 'presentation_idempotency_key', 'attempt_id', 'claim_token', 'output_digest');
      const narration = input.narration_result;
      if (!narration || typeof narration !== 'object' || Array.isArray(narration)
        || narration.package_digest !== input.package_digest
        || narration.canonical_digest !== input.output_digest) {
        throw new TypeError('narration output identity is invalid');
      }
      const { canonical_digest: canonicalDigest, ...narrationPayload } = narration;
      if (computeSpatialV3CanonicalDigest(narrationPayload) !== canonicalDigest) throw new TypeError('narration output digest is invalid');
      return transaction(async (tx) => {
        await lock(tx, input.party_id, input.package_id, input.package_digest);
        const job = await jobForUpdate(tx, input.party_id, input.package_id, input.presentation_idempotency_key);
        const updated = await tx.query(`UPDATE party_runtime.party_narration_jobs SET status='output_ready',active_attempt_id=NULL,claim_token=NULL,lease_expires_at=NULL,narration_output=$1,output_digest=$2,state_version=state_version+1
          WHERE job_id=$3 AND status='in_progress' AND active_attempt_id=$4 AND claim_token=$5 AND state_version=$6 RETURNING next_attempt_ordinal`, [JSON.stringify(input.narration_result), input.output_digest, job.job_id, input.attempt_id, input.claim_token, job.state_version]);
        if (updated.rowCount !== 1) return Object.freeze({ ok: false, disposition: 'state_conflict' });
        return Object.freeze({ ok: true, disposition: 'output_ready', attempt_id: input.attempt_id, narration_result: clone(input.narration_result), output_digest: input.output_digest });
      }, input.turnBudget);
    },

    async finalizePresentationAttempt(input = {}) {
      required(input, 'party_id', 'package_id', 'package_digest', 'presentation_idempotency_key', 'attempt_id', 'presentation_status');
      if (!['delivered', 'failed_retryable'].includes(input.presentation_status)) throw new TypeError('invalid presentation_status');
      if (input.presentation_status === 'delivered') required(input, 'output_digest');
      return transaction(async (tx) => {
        await lock(tx, input.party_id, input.package_id, input.package_digest);
        const job = await jobForUpdate(tx, input.party_id, input.package_id, input.presentation_idempotency_key);
        if (input.presentation_status === 'delivered') {
          if (input.attempt_id !== attemptId(job.job_id, job.next_attempt_ordinal - 1)) return Object.freeze({ ok: false, presentation_status: 'state_conflict' });
          const updated = await tx.query(`UPDATE party_runtime.party_narration_jobs SET status='delivered',state_version=state_version+1
            WHERE job_id=$1 AND status='output_ready' AND output_digest=$2 AND state_version=$3`, [job.job_id, input.output_digest, job.state_version]);
          if (updated.rowCount !== 1) return Object.freeze({ ok: false, presentation_status: 'state_conflict' });
          await tx.query(`INSERT INTO party_runtime.party_narration_attempts (attempt_id,job_id,attempt_ordinal,outcome,output_digest)
            VALUES ($1,$2,$3,'delivered',$4)`, [input.attempt_id, job.job_id, job.next_attempt_ordinal - 1, input.output_digest]);
        } else {
          required(input, 'claim_token');
          const updated = await tx.query(`UPDATE party_runtime.party_narration_jobs SET status='failed_retryable',active_attempt_id=NULL,claim_token=NULL,lease_expires_at=NULL,state_version=state_version+1
            WHERE job_id=$1 AND status='in_progress' AND active_attempt_id=$2 AND claim_token=$3 AND state_version=$4`, [job.job_id, input.attempt_id, input.claim_token, job.state_version]);
          if (updated.rowCount !== 1) return Object.freeze({ ok: false, presentation_status: 'state_conflict' });
          await tx.query(`INSERT INTO party_runtime.party_narration_attempts (attempt_id,job_id,attempt_ordinal,outcome,failure_code,failure_metadata)
            VALUES ($1,$2,$3,'failed_retryable',$4,$5)`, [input.attempt_id, job.job_id, job.next_attempt_ordinal - 1, input.failure?.stage ?? 'narration_failed', JSON.stringify(input.failure ?? {})]);
        }
        return Object.freeze({ ok: true, presentation_status: input.presentation_status, attempt_id: input.attempt_id, output_digest: input.presentation_status === 'delivered' ? input.output_digest : null });
      }, input.turnBudget);
    }
  });
}
