import { serverError } from '../../../errors.js';

export async function loadSession(pool, partyId) {
  const result = await pool.query(
    `SELECT s.request_id,s.stage26_result,s.delivery_attempt,
            s.delivery_ack_result,s.screen,s.turn_number,s.last_turn_id,
            s.state_version,s.updated_at,
            p.materializer_version AS party_materializer_version,
            p.rng_version AS party_rng_algorithm_id,
            p.command_catalog_digest AS party_scenario_manifest_digest,
            snapshot.state_payload->>'schema' AS party_snapshot_schema,
            visible.package_id AS current_projection_package_id,
            visible.package_digest AS current_projection_package_digest,
            visible.committed_state_version
              AS current_projection_state_version,
            visible.visible_payload AS current_projection_payload,
            narration.status AS current_narration_status,
            narration.output_digest AS current_narration_output_digest,
            narration.narration_output AS current_narration_output
       FROM party_runtime.party_server_sessions s
       JOIN party_runtime.parties p
         ON p.party_id=s.party_id
       JOIN party_runtime.party_state_snapshots snapshot
         ON snapshot.party_id=p.party_id
        AND snapshot.state_version=p.state_version
       LEFT JOIN party_runtime.party_visible_packages visible
         ON visible.party_id=s.party_id
        AND visible.package_id=
          s.screen->'current_projection_anchor'->>'package_id'
       LEFT JOIN party_runtime.party_narration_jobs narration
         ON narration.party_id=s.party_id
        AND narration.package_id=visible.package_id
      WHERE s.party_id=$1`,
    [partyId]
  );
  if (result.rows.length === 0) {
    throw serverError(
      'PARTY_NOT_FOUND',
      'Party session was not found.',
      { status: 404 }
    );
  }
  return {
    request_id: result.rows[0].request_id,
    stage26_result: result.rows[0].stage26_result,
    delivery_attempt: result.rows[0].delivery_attempt,
    delivery_ack_result: result.rows[0].delivery_ack_result,
    screen: result.rows[0].screen,
    turn_number: Number(result.rows[0].turn_number),
    last_turn_id: result.rows[0].last_turn_id,
    state_version: Number(result.rows[0].state_version),
    updated_at: result.rows[0].updated_at,
    party_materializer_version:
      result.rows[0].party_materializer_version,
    party_rng_algorithm_id:
      result.rows[0].party_rng_algorithm_id,
    party_scenario_manifest_digest:
      result.rows[0].party_scenario_manifest_digest,
    party_snapshot_schema: result.rows[0].party_snapshot_schema,
    current_projection_package_id:
      result.rows[0].current_projection_package_id ?? null,
    current_projection_package_digest:
      result.rows[0].current_projection_package_digest ?? null,
    current_projection_state_version:
      result.rows[0].current_projection_state_version ?? null,
    current_projection_payload:
      result.rows[0].current_projection_payload ?? null,
    current_narration_status:
      result.rows[0].current_narration_status ?? null,
    current_narration_output_digest:
      result.rows[0].current_narration_output_digest ?? null,
    current_narration_output:
      result.rows[0].current_narration_output ?? null
  };
}

export async function tableExists(tx, name) {
  const result = await tx.query(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [name]
  );
  return result.rows[0]?.present === true;
}

export async function transaction(pool, work) {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SET CONSTRAINTS ALL DEFERRED');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}
