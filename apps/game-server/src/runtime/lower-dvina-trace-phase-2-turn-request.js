import { canonicalDigest } from '@rus/materialization';
import { requiredTraceTurnText } from './lower-dvina-trace-phase-2-runtime-input.js';

export function buildTracePhase2TurnRequest({ partyId, input }) {
  const requestId = requiredTraceTurnText(input.request_id,
    'TRACE_TURN_REQUEST_ID_REQUIRED');
  const idempotencyKey = requiredTraceTurnText(
    input.idempotency_key ?? input.request_id,
    'TRACE_TURN_IDEMPOTENCY_KEY_REQUIRED');
  const rawText = requiredTraceTurnText(input.raw_text,
    'TRACE_TURN_RAW_TEXT_REQUIRED');
  return {
    requestId,
    idempotencyKey,
    rawText,
    inputDigest: canonicalDigest({
      party_id: partyId,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      raw_text: rawText,
    }),
  };
}
