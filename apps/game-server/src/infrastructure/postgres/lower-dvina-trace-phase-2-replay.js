import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  phase2IntegrityError
} from './lower-dvina-trace-phase-2-read.js';
import {
  phase2PublicResult,
  rebuildPhase2HistoricalScreen
} from './lower-dvina-trace-phase-2-projection.js';

export async function loadHistoricalPhase2Replay({
  partyPool,
  partyId,
  idempotencyKey
}) {
  const idempotency = await partyPool.query(
    `SELECT request_id,status,result_change_set_id,
            semantic_command_snapshot
       FROM party_runtime.party_command_idempotency
      WHERE party_id=$1
        AND operation_kind='trace_wreck_inspection'
        AND idempotency_key=$2`,
    [partyId, idempotencyKey]
  );
  if (idempotency.rowCount === 0) return null;
  const record = idempotency.rows[0];
  if (idempotency.rowCount !== 1 || record.status !== 'committed') {
    throw phase2IntegrityError();
  }
  const persisted = await partyPool.query(
    `SELECT snapshot.state_payload,snapshot.state_digest,
            visible.package_id,visible.turn_id,
            visible.package_digest,visible.visible_payload,
            narration.status AS narration_status,
            narration.narration_output,
            narration.output_digest
       FROM party_runtime.party_state_snapshots snapshot
       JOIN party_runtime.party_visible_packages visible
         ON visible.party_id=snapshot.party_id
        AND visible.change_set_id=$2
       JOIN party_runtime.party_narration_jobs narration
         ON narration.party_id=visible.party_id
        AND narration.package_id=visible.package_id
      WHERE snapshot.party_id=$1
        AND snapshot.state_payload #>>
          '{last_turn,visible_package,change_set_id}'=$2`,
    [partyId, record.result_change_set_id]
  );
  const row = persisted.rows[0];
  const payload = row?.state_payload;
  const command = record.semantic_command_snapshot;
  if (persisted.rowCount !== 1
      || row.state_digest !== canonicalDigest(payload)
      || payload.last_turn.idempotency_key !== idempotencyKey
      || payload.last_turn.request_id !== record.request_id
      || command?.input_digest !== payload.last_turn.input_digest
      || command?.selected_option_id !== payload.last_turn.option_id
      || command?.action_set_digest
        !== payload.last_turn.action_set_digest
      || row.package_id
        !== payload.last_turn.visible_package.package_id
      || row.package_digest
        !== payload.last_turn.visible_package.package_digest
      || row.package_digest
        !== computeSpatialV3CanonicalDigest(row.visible_payload)
      || row.narration_status !== 'delivered'
      || row.output_digest
        !== row.narration_output?.canonical_digest
      || !validNarrationOutput(row.narration_output)) {
    throw phase2IntegrityError();
  }
  const screen = rebuildPhase2HistoricalScreen({
    payload,
    turnId: row.turn_id,
    visiblePayload: row.visible_payload,
    narrationOutput: row.narration_output,
    narrationOutputDigest: row.output_digest
  });
  return {
    input_digest: payload.last_turn.input_digest,
    state: payload,
    screen,
    public_result: phase2PublicResult({ payload, screen })
  };
}

function validNarrationOutput(narration) {
  if (!narration || narration.kind !== 'approved_narration') return false;
  const { canonical_digest: digest, ...payload } = narration;
  return digest === computeSpatialV3CanonicalDigest(payload)
    && narration.flow_result?.status === 'approved'
    && narration.flow_result?.pass === true
    && narration.text
      === narration.flow_result?.approved_output?.prose;
}
