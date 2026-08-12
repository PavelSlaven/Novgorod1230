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
import {
  buildLowerDvinaTraceTurnStepCheckWrites
} from './lower-dvina-trace-turn-step-checks.js';
import {
  validLowerDvinaTraceTurnStepReplayEvidence
} from './lower-dvina-trace-turn-step-idempotency.js';

export async function loadPhase2IdempotencyRecord({
  partyPool,
  partyId,
  idempotencyKey
}) {
  const idempotency = await partyPool.query(
    `SELECT id,request_id,operation_kind,status,result_change_set_id,
            semantic_command_snapshot,semantic_command_digest,
            semantic_dependency_pins
       FROM party_runtime.party_command_idempotency
      WHERE party_id=$1
        AND operation_kind IN (
          'trace_wreck_inspection',
          'trace_phase_3_turn',
          'trace_phase_4_turn',
          'trace_phase_5_treatment',
          'trace_phase_6_carry',
          'trace_phase_7_fire_rest',
          'trace_phase_8_accusation',
          'trace_phase_9_bag_recovery',
          'trace_phase_9_bag_opened',
          'trace_phase_9_packet_recovered',
          'trace_phase_9_return_to_camp',
          'trace_phase_9_onisim_testimony',
          'trace_phase_9_evidence_resolved',
          'trace_phase_9_temporary_disposition',
          'combat_exchange',
          'trace_turn_step'
        )
        AND idempotency_key=$2`,
    [partyId, idempotencyKey]
  );
  if (idempotency.rowCount === 0) return null;
  const record = idempotency.rows[0];
  if (idempotency.rowCount !== 1 || record.status !== 'committed') {
    throw phase2IntegrityError();
  }
  return record;
}

export async function loadCurrentOrHistoricalPhase2Replay({
  partyPool,
  partyId,
  idempotencyKey,
  loadState
}) {
  const idempotency = await loadPhase2IdempotencyRecord({
    partyPool, partyId, idempotencyKey
  });
  if (idempotency == null) return null;
  const state = await loadState(partyId, {
    presentationIdempotencyKey: idempotencyKey
  });
  if (state.last_turn?.idempotency_key !== idempotencyKey) {
    return loadHistoricalPhase2Replay({
      partyPool, partyId, idempotencyKey,
      idempotencyRecord: idempotency
    });
  }
  const result = await partyPool.query(
    `SELECT session.screen,session.turn_number,
            visible.package_id,visible.package_digest,
            visible.dependency_pins
       FROM party_runtime.party_server_sessions session
       JOIN party_runtime.party_visible_packages visible
         ON visible.party_id=session.party_id
        AND visible.change_set_id=$2
      WHERE session.party_id=$1`,
    [partyId, idempotency.result_change_set_id]
  );
  const row = result.rows[0];
  if (result.rowCount !== 1
      || row.package_id !== state.last_turn.visible_package.package_id
      || row.package_digest !== state.last_turn.visible_package.package_digest) {
    throw phase2IntegrityError();
  }
  assertPhase2ReplayRecord({
    record: idempotency,
    payload: state,
    visibleDependencyPins: row.dependency_pins
  });
  await assertCommittedTurnStepChecks({
    partyPool,
    payload: state,
    changeSetId: idempotency.result_change_set_id,
    idempotencyRecordId: idempotency.id
  });
  return {
    input_digest: state.last_turn.input_digest,
    state,
    screen: row.screen,
    public_result: phase2PublicResult({ payload: state, screen: row.screen })
  };
}

export async function loadHistoricalPhase2Replay({
  partyPool,
  partyId,
  idempotencyKey,
  idempotencyRecord = undefined
}) {
  const record = idempotencyRecord === undefined
    ? await loadPhase2IdempotencyRecord({
      partyPool, partyId, idempotencyKey
    }) : idempotencyRecord;
  if (record == null) return null;
  const persisted = await partyPool.query(
    `SELECT snapshot.state_payload,snapshot.state_digest,
            visible.package_id,visible.turn_id,
            visible.package_digest,visible.visible_payload,
            visible.dependency_pins,
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
  if (persisted.rowCount !== 1
      || row.state_digest !== canonicalDigest(payload)
      || payload.last_turn.idempotency_key !== idempotencyKey
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
  assertPhase2ReplayRecord({
    record,
    payload,
    visibleDependencyPins: row.dependency_pins
  });
  if (payload.last_turn?.turn_step_commit != null) {
    await assertCommittedTurnStepChecks({
      partyPool,
      payload,
      changeSetId: record.result_change_set_id,
      idempotencyRecordId: record.id
    });
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

export function assertPhase2ReplayRecord({
  record,
  payload,
  visibleDependencyPins
}) {
  const command = record?.semantic_command_snapshot;
  const turnStep = payload?.last_turn?.turn_step_commit != null;
  if (payload?.last_turn?.request_id !== record?.request_id
      || command?.input_digest !== payload?.last_turn?.input_digest
      || command?.selected_option_id !== payload?.last_turn?.option_id
      || command?.action_set_digest
        !== payload?.last_turn?.action_set_digest
      || (turnStep && (
        payload.last_turn.turn_step_idempotency_record_id !== record.id
        || payload.last_turn.visible_package?.change_set_id
          !== record.result_change_set_id
        || !validLowerDvinaTraceTurnStepReplayEvidence({
          record, payload, visibleDependencyPins
        })))) {
    throw phase2IntegrityError();
  }
}

export async function assertCommittedTurnStepChecks({
  partyPool, payload, changeSetId, idempotencyRecordId
}) {
  const envelope = payload.last_turn?.turn_step_commit;
  if (envelope == null) return;
  const expectedWrites = buildLowerDvinaTraceTurnStepCheckWrites({
    partyId: payload.party_id,
    envelope,
    inputDigest: payload.last_turn.input_digest,
    changeSetId,
    idemId: idempotencyRecordId
  });
  const persisted = await partyPool.query(
    `SELECT check_resolution_id,check_scope_kind,check_scope_key,
            check_policy_ref,deterministic_roll_input_digest,roll_value,
            modifier_snapshot,target_value,result_kind,
            consequence_policy_ref,result_change_set_id,canonical_digest
       FROM party_runtime.party_check_resolutions
      WHERE party_id=$1 AND result_change_set_id=$2
        AND check_scope_key->>'idempotency_record_id'=$3
      ORDER BY check_resolution_id`,
    [payload.party_id, changeSetId, idempotencyRecordId]
  );
  const expected = expectedWrites.map(({ record }) => {
    const { party_id: _partyId, ...persistedRecord } = record;
    return persistedRecord;
  }).sort((left, right) => left.check_resolution_id.localeCompare(
    right.check_resolution_id));
  if (persisted.rowCount !== expected.length
      || canonicalDigest(persisted.rows) !== canonicalDigest(expected)) {
    throw phase2IntegrityError();
  }
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
