import {
  validateLowerDvinaTraceSessionRead
} from './lower-dvina-trace-session.js';

export async function replayExistingLowerDvinaTraceStart({
  partyId,
  requestId,
  repository
}) {
  let session;
  try {
    session = await repository.loadSession(partyId);
  } catch (error) {
    if (error?.code === 'PARTY_NOT_FOUND') return null;
    throw error;
  }
  validateLowerDvinaTraceSessionRead({ partyId, session });
  return {
    request_id: requestId,
    party_id: partyId,
    screen: session.screen,
    delivery: {
      delivery_attempt_id:
        session.delivery_attempt.delivery_attempt_id,
      message_id: session.delivery_attempt.message_id,
      screen_digest: session.delivery_attempt.screen_digest,
      status: session.delivery_attempt.status,
      awaiting_client_ack:
        session.delivery_attempt.awaiting_client_ack
    }
  };
}
