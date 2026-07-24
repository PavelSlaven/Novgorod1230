import { resolveAlight, resolveBoard, graphValid } from './temporal-carriers-attachments.js';
import { resolveSynchronizedSlice, selectCarrierClockCommitMode } from './temporal-carriers-slice.js';
import { freeze, record, success, typed } from './temporal-carriers-support.js';
import {
  commandPayload,
  replayFor,
  structuralStateValid,
  validIncomingIdempotencyRecord,
  validLimits
} from './temporal-carriers-state.js';

export { selectCarrierClockCommitMode };

export function createTemporalCarrierProposalEngine({ resolveSynchronizedSlice: resolver, limits }) {
  if (typeof resolver !== 'function' || !validLimits(limits)) {
    throw new TypeError('temporal carrier engine requires the P19 resolver and explicit finite limits');
  }
  return Object.freeze({
    propose(state, command) {
      if (!structuralStateValid(state, limits)) return typed('temporal_change_set_conflict', state, { reason: 'invalid_state_snapshot' });
      if (!graphValid(state)) return typed('attachment_graph_invalid', state);
      if (!record(command) || !record(command.idempotency_record)) return typed('temporal_change_set_conflict', state, { reason: 'invalid_command' });
      const payload = commandPayload(command);
      if (!validIncomingIdempotencyRecord(command.idempotency_record, payload, state.party_id)) return typed('temporal_change_set_conflict', state, { reason: 'idempotency_record_does_not_bind_command' });
      const replay = replayFor(state, command.idempotency_record, freeze);
      if (replay === 'conflict') return typed('idempotency_conflict', state, { idempotency_key: command.idempotency_record.idempotency_key });
      if (replay !== null) return replay;
      if (command.expected_state_digest !== state.canonical_digest) return typed('state_version_conflict', state, { reason: 'state_snapshot_digest_changed' });
      if (command.kind === 'synchronized_slice') {
        const resultSet = resolveSynchronizedSlice(state, command, resolver);
        if (!resultSet.slice) return resultSet;
        return success({ result_set: resultSet });
      }
      if (command.kind === 'board') return resolveBoard(state, command, limits);
      if (command.kind === 'alight') return resolveAlight(state, command);
      return typed('temporal_change_set_conflict', state, { reason: 'unsupported_operation' });
    }
  });
}
