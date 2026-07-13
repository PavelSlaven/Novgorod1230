import {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent
} from '@rus/presentation/opening-delivery';
import {
  createFirstGameScreenReadModel,
  validateFirstGameScreen,
  validateTurnScreen
} from '@rus/presentation';
import { serverError } from '../errors.js';

export function createGameCompositionRoot({
  newGameWorkflow,
  turnWorkflow,
  sessionStore,
  deliveryStore = null,
  now = () => new Date().toISOString()
} = {}) {
  requireMethod(newGameWorkflow, 'run', 'newGameWorkflow');
  requireMethod(turnWorkflow, 'run', 'turnWorkflow');
  requireMethod(sessionStore, 'load', 'sessionStore');
  requireMethod(sessionStore, 'save', 'sessionStore');
  if (deliveryStore != null) {
    requireMethod(deliveryStore, 'recordAttempt', 'deliveryStore');
    requireMethod(deliveryStore, 'commitAcknowledgement', 'deliveryStore');
  }

  return Object.freeze({
    health() {
      return Object.freeze({ status: 'ok', service: '@rus/game-server', api_version: 1 });
    },

    async startNewGame(input) {
      const normalized = normalizeNewGameInput(input, now());
      const pipeline = await newGameWorkflow.run(normalized);
      if (pipeline?.status !== 'approved') {
        throw serverError('NEW_GAME_NOT_APPROVED', 'New-game pipeline did not produce an approved result.', { status: 409 });
      }
      const stage26Result = extractStage26Result(pipeline);
      const screen = createFirstGameScreenReadModel({ stage26Result, generatedAt: now() });
      const validation = validateFirstGameScreen(screen);
      if (!validation.ok) throw serverError('FIRST_GAME_SCREEN_INVALID', validation.errors.join('; '), { status: 500 });
      const deliveryAttempt = markFirstScreenDeliverySent(
        createFirstScreenDeliveryAttempt({ stage26_result: stage26Result, created_at: now() }),
        { sent_at: now() }
      );
      await deliveryStore?.recordAttempt(deliveryAttempt);
      await sessionStore.save(screen.party_id, {
        version: 1,
        schema: 'game_server_session',
        party_id: screen.party_id,
        request_id: normalized.request_id,
        stage26_result: stage26Result,
        delivery_attempt: deliveryAttempt,
        delivery_ack_result: null,
        screen,
        turn_number: 0,
        updated_at: now()
      });
      return Object.freeze({
        request_id: normalized.request_id,
        party_id: screen.party_id,
        screen,
        delivery: publicDelivery(deliveryAttempt)
      });
    },

    async acknowledgeOpening(partyId, input) {
      const session = await requireSession(sessionStore, partyId);
      const acknowledgement = buildFirstScreenDeliveryAck({
        attempt: session.delivery_attempt,
        client_ack_id: text(input?.client_ack_id),
        acknowledged_at: text(input?.acknowledged_at) || now()
      });
      const result = acknowledgeFirstScreenDelivery({
        attempt: session.delivery_attempt,
        acknowledgement,
        existing_ack_result: session.delivery_ack_result
      });
      await deliveryStore?.commitAcknowledgement(result);
      await sessionStore.save(session.party_id, {
        ...session,
        delivery_attempt: result.delivery_attempt,
        delivery_ack_result: result,
        updated_at: now()
      });
      return Object.freeze({
        party_id: session.party_id,
        message_id: result.message_id,
        screen_digest: result.screen_digest,
        delivery_status: result.delivery_attempt.status,
        acknowledged_at: result.acknowledgement.acknowledged_at
      });
    },

    async submitTurn(partyId, input) {
      const session = await requireSession(sessionStore, partyId);
      const turnNumber = integer(input?.turn_number, session.turn_number + 1);
      if (turnNumber === 1 && session.delivery_ack_result?.pass !== true) {
        throw serverError('OPENING_ACK_REQUIRED', 'Opening screen must be acknowledged before the first turn.', { status: 409 });
      }
      const result = await turnWorkflow.run({
        party_id: session.party_id,
        turn_number: turnNumber,
        raw_text: text(input?.raw_text),
        selected_action_option_id: text(input?.selected_action_option_id) || null,
        received_at: text(input?.received_at) || now()
      });
      const validation = validateTurnScreen(result?.screen);
      if (!validation.ok) throw serverError('TURN_SCREEN_INVALID', validation.errors.join('; '), { status: 500 });
      await sessionStore.save(session.party_id, {
        ...session,
        screen: result.screen,
        turn_number: result.turn_number,
        last_turn_id: result.turn_id,
        updated_at: now()
      });
      return Object.freeze({
        party_id: result.party_id,
        screen: result.screen,
        turn: Object.freeze({
          turn_id: result.turn_id,
          turn_number: result.turn_number,
          status: result.status,
          mode: result.mode,
          summary: structuredClone(result.summary ?? {})
        })
      });
    },

    async getPartyScreen(partyId) {
      const session = await requireSession(sessionStore, partyId);
      return Object.freeze({
        party_id: session.party_id,
        turn_number: session.turn_number,
        screen: structuredClone(session.screen)
      });
    }
  });
}

function normalizeNewGameInput(input, receivedAt) {
  const requestId = text(input?.request_id) || `new-game:${receivedAt}`;
  const startText = text(input?.start_text);
  if (!startText) throw serverError('START_TEXT_REQUIRED', 'start_text is required.', { status: 400 });
  return Object.freeze({
    version: 1,
    schema: 'new_game_http_input',
    request_id: requestId,
    start_text: startText,
    player_name: text(input?.player_name),
    ui_fields: plain(input?.ui_fields) ? structuredClone(input.ui_fields) : null,
    client_defaults: plain(input?.client_defaults) ? structuredClone(input.client_defaults) : null,
    received_at: receivedAt
  });
}

function extractStage26Result(pipeline) {
  const candidates = [pipeline?.artifact, pipeline?.result?.artifact, pipeline?.result, pipeline?.stage26_result];
  const result = candidates.find((value) => value?.schema === 'stage26_first_game_screen_result');
  if (!result) throw serverError('STAGE26_RESULT_REQUIRED', 'Approved Stage 26 result is missing.', { status: 500 });
  return structuredClone(result);
}
async function requireSession(store, partyId) {
  const id = text(partyId);
  if (!id) throw serverError('PARTY_ID_REQUIRED', 'party_id is required.', { status: 400 });
  const session = await store.load(id);
  if (!session) throw serverError('PARTY_NOT_FOUND', 'Party session was not found.', { status: 404 });
  return session;
}
function publicDelivery(attempt) {
  return Object.freeze({
    delivery_attempt_id: attempt.delivery_attempt_id,
    message_id: attempt.message_id,
    screen_digest: attempt.screen_digest,
    status: attempt.status,
    awaiting_client_ack: attempt.awaiting_client_ack
  });
}
function requireMethod(value, method, label) {
  if (!value || typeof value[method] !== 'function') throw new TypeError(`${label}.${method} is required.`);
}
function text(value) { return String(value ?? '').trim(); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function integer(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
