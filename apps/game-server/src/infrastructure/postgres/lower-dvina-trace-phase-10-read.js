import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function assertPhase10NormalizedRows(pool, payload, head) {
  if (payload.completion == null) return;
  const completion = payload.completion;
  const expectedKeys = ['change_set_id', 'outcome', 'source_commit_version',
    'status'];
  if (canonicalDigest(Object.keys(completion).sort())
        !== canonicalDigest(expectedKeys)
      || completion.status !== 'committed'
      || completion.outcome?.schema
        !== 'rus.trace_composite_completion_outcome.v1'
      || completion.outcome.source_commit_version
        !== completion.source_commit_version
      || completion.source_commit_version + 1
        !== payload.party_state.state_version
      || completion.change_set_id
        !== payload.last_turn?.visible_package?.change_set_id
      || Number(head.clock_state_version)
        !== Number(payload.party_state.clock_state_version)
      || Number(head.body_state_version)
        !== Number(payload.party_state.body_state_version)) fail();
  const key = `completion:${payload.party_id}:${
    completion.source_commit_version}`;
  const persisted = await pool.query(
    `SELECT i.status,i.result_change_set_id,
            i.semantic_command_snapshot,i.semantic_dependency_pins,
            c.operation_kind,v.package_id,v.package_digest,
            v.committed_state_version,v.change_set_id,v.dependency_pins
       FROM party_runtime.party_command_idempotency i
       JOIN party_runtime.party_v3_change_sets c
         ON c.party_id=i.party_id AND c.id=i.result_change_set_id
       JOIN party_runtime.party_visible_packages v
         ON v.party_id=i.party_id AND v.change_set_id=i.result_change_set_id
      WHERE i.party_id=$1 AND i.idempotency_key=$2
        AND i.operation_kind='trace_phase_10_completion'`,
    [payload.party_id, key]
  );
  const row = persisted.rows[0];
  if (persisted.rowCount !== 1 || row.status !== 'committed'
      || row.result_change_set_id !== completion.change_set_id
      || row.operation_kind !== 'trace_phase_10_completion'
      || row.package_id !== payload.last_turn.visible_package.package_id
      || row.package_digest
        !== payload.last_turn.visible_package.package_digest
      || row.committed_state_version
        !== String(payload.party_state.state_version)
      || row.change_set_id !== completion.change_set_id
      || row.semantic_command_snapshot?.selected_option_id
        !== 'automatic_phase_10_completion'
      || row.semantic_command_snapshot?.semantic_trace?.semantic_llm_calls
        !== 'forbidden'
      || !validPins(row.semantic_dependency_pins?.phase10,
        row.dependency_pins)
      || head.screen?.current_projection_anchor?.package_id
        !== row.package_id) fail();
}

function validPins(authoritative, visible) {
  if (!Array.isArray(authoritative) || authoritative.length !== 3
      || authoritative.some((pin) => typeof pin?.key !== 'string'
        || typeof pin.path !== 'string' || typeof pin.digest !== 'string'
        || !Number.isSafeInteger(pin.revision))
      || visible?.canonical_digest !== canonicalDigest(visible?.pins ?? [])) {
    return false;
  }
  const visibleIds = new Set((visible.pins ?? []).map(
    (pin) => pin.entity_ref?.entity_id));
  return authoritative.every((pin) => visibleIds.has(pin.key));
}

function fail() { throw phase2IntegrityError(); }
