import { serverError } from '../../errors.js';
import {
  phase2IntegrityError
} from './lower-dvina-trace-phase-2-read.js';

export function assertPhase2PresentationAdmission({
  row,
  payload,
  presentationIdempotencyKey
}) {
  if (row.screen?.screen_status !== 'committed_presentation_pending') {
    return;
  }
  if (row.screen.turn_id !== row.last_turn_id
      || payload.last_turn?.idempotency_key == null) {
    throw phase2IntegrityError();
  }
  if (presentationIdempotencyKey != null
      && presentationIdempotencyKey
        !== payload.last_turn.idempotency_key) {
    throw serverError(
      'TRACE_PHASE_2_PRESENTATION_PENDING',
      'The committed prior turn must finish presentation before a new turn.',
      {
        status: 409,
        details: {
          pending_turn_id: row.last_turn_id
        }
      }
    );
  }
}
