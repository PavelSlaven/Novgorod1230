import { deepFreeze } from '@rus/kernel';
import { runTurnWorkflow } from '../orchestrator.js';
import { assertValid, validateTurnModeResolution } from '../validators.js';

export function createLegacyTurnCompatibilityAdapter(services, defaults = {}) {
  return Object.freeze({
    createPartyTurnRuntimeState,
    shouldUsePartyTurnRuntime,
    bootstrapPartyRuntimeFromWorld,
    runPartyTurnPipeline(options = {}) {
      return runPartyTurnPipeline({ ...defaults, ...options, services: options.services ?? services });
    },
    runPartyTurnRuntime(options = {}) {
      return runPartyTurnPipeline({ ...defaults, ...options, services: options.services ?? services });
    }
  });
}

export function createPartyTurnRuntimeState({ partyScreenPayload, now = new Date().toISOString() } = {}) {
  const screen = extractActiveScreen(partyScreenPayload);
  if (!screen) throw new Error('createPartyTurnRuntimeState requires active party screen payload.');
  return deepFreeze({
    version: 1,
    schema: 'party_turn_runtime_state',
    initialized_at: now,
    party_id: text(screen.party_id),
    current_turn_number: Number(screen.turn_number ?? 0),
    current_phase: 'awaiting_player_input',
    current_screen: structuredClone(screen),
    public_state: structuredClone(screen.visible_context ?? screen.public_state ?? {}),
    hidden_state: {},
    turn_history: []
  });
}

export function shouldUsePartyTurnRuntime(world, partyScreenPayload, partyRuntimeState = null) {
  return partyRuntimeState?.schema === 'party_turn_runtime_state' || Boolean(extractActiveScreen(partyScreenPayload)) || Boolean(world && typeof world === 'object');
}

export function bootstrapPartyRuntimeFromWorld(world, bootstrapPayload) {
  const state = createPartyTurnRuntimeState({ partyScreenPayload: bootstrapPayload });
  if (world && typeof world === 'object') world.partyRuntimeState = structuredClone(state);
  return state;
}

export async function runPartyTurnPipeline(options = {}) {
  const runtime = options.partyRuntimeState ?? createPartyTurnRuntimeState({ partyScreenPayload: options.partyScreenPayload ?? options.bootstrapPayload });
  const requestId = text(options.requestId)
    || `legacy-turn:${runtime.party_id}:${Number(runtime.current_turn_number ?? 0) + 1}`;
  const result = await runTurnWorkflow({
    party_id: runtime.party_id,
    turn_number: Number(runtime.current_turn_number ?? 0) + 1,
    request_id: requestId,
    idempotency_key: requestId,
    raw_text: options.rawText,
    selected_action_option_id: options.selectedActionOptionId,
    routing_context: runtime.public_state
  }, options.services ?? {}, { now: options.now, requestId });
  const nextState = deepFreeze({
    ...structuredClone(runtime),
    current_turn_number: result.turn_number,
    current_phase: 'awaiting_player_input',
    current_screen: structuredClone(result.screen),
    public_state: structuredClone(result.screen.visible_context ?? {}),
    turn_history: [...(runtime.turn_history ?? []), { turn_id: result.turn_id, status: result.status }]
  });
  const payload = deepFreeze({
    version: 1,
    schema: 'party_turn_result_ui_payload',
    party_id: result.party_id,
    openingText: result.screen.prose,
    partyTurnScreen: result.screen,
    party_turn_screen: result.screen,
    runtime_state: { party_id: result.party_id, current_phase: nextState.current_phase, current_turn_number: nextState.current_turn_number }
  });
  return deepFreeze({ ...result, partyRuntimeState: nextState, partyScreenPayload: payload, text: result.screen.prose });
}

export async function runPartyTurnRuntime(options = {}) {
  return runPartyTurnPipeline(options);
}

export function resolveTurnMode(_rawText, availableContext = {}) {
  const approved = availableContext.approved_turn_mode_resolution;
  assertValid('turn_mode_resolution', validateTurnModeResolution(approved));
  return deepFreeze(structuredClone(approved));
}

export function resolveTurnIntentRoute(_rawText, availableContext = {}) {
  const approved = availableContext.approved_turn_intent_route;
  if (!approved || typeof approved !== 'object') throw new Error('approved_turn_intent_route is required; deterministic intent routing is not available in modular production.');
  return deepFreeze(structuredClone(approved));
}

function extractActiveScreen(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.partyTurnScreen ?? payload.party_turn_screen ?? payload.firstGameScreen ?? payload.first_game_screen ?? null;
}
function text(value) { return String(value ?? '').trim(); }
