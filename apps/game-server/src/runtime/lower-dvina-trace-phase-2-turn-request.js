import { canonicalDigest } from '@rus/materialization';
import { requiredTraceTurnText } from './lower-dvina-trace-phase-2-runtime-input.js';
import { serverError } from '../errors.js';

// Runtime-local joining covers overlapping browser retries; P16 owns durable replay.
export function createTraceTurnRequestExecutor() {
  const inFlight = new Map();
  return async ({ partyId, idempotencyKey, inputDigest }, execute) => {
    const key = JSON.stringify([partyId, idempotencyKey]);
    const existing = inFlight.get(key);
    if (existing) {
      if (existing.inputDigest !== inputDigest) throw serverError(
        'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT',
        'The idempotency identity is already bound to another input.', { status: 409 });
      return existing.promise;
    }
    const entry = { inputDigest, promise: Promise.resolve().then(execute) };
    inFlight.set(key, entry);
    try { return await entry.promise; }
    finally { inFlight.delete(key); }
  };
}

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

export function buildTraceTurnWorkflowInput({
  partyId, state, requestId, idempotencyKey, rawText, contracts,
  phase3Contracts, phase4Contracts, phase5Contracts, phase7Contracts,
  turn10Contracts, phase8, phase9Contracts
}) {
  return {
    party_id: partyId,
    turn_number: Number(state.party_state.turn_number) + 1,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    raw_text: rawText,
    routing_context: {
      actor_id: state.actor_id,
      state_version: state.party_state.state_version,
      policy_id: 'lower_dvina_trace_semantic_intent',
      policy_version: '1',
      policy_pins: [
        contracts.activityPin,
        ...(phase3Contracts?.activityPins ?? []),
        ...(phase4Contracts?.activityPins ?? []),
        ...(phase5Contracts?.activityPins ?? []),
        ...(phase7Contracts ? [phase7Contracts.activityPin] : []),
        ...(turn10Contracts ? [turn10Contracts.activityPin] : []),
        ...(phase8?.contracts?.activityPins ?? []),
        ...(phase9Contracts?.pins ?? [])
      ]
    }
  };
}
