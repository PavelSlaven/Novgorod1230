import { buildUiState } from '../src/ui-state.js';
import { buildPartyTurnBootstrapPayloadFromUiState } from '../src/ui/party-screen-adapter.js';
import { runPartyTurnPipeline } from '../src/world/turn-runtime/index.js';

export async function handlePlayerInput(world, text, options = {}) {
  const bootstrapPayload = ensurePartyBootstrap(world);
  const result = await runPartyTurnPipeline({
    world,
    partyScreenPayload: world.partyScreenPayload ?? bootstrapPayload,
    partyRuntimeState: world.partyRuntimeState ?? null,
    bootstrapPayload,
    rawText: text,
    selectedActionOptionId: options.selectedActionOptionId ?? null,
    env: process.env,
    llmExecutors: options.llmExecutors ?? {}
  });
  return { world, text: result.text, runtime: result };
}

export function ensurePartyBootstrap(world) {
  if (world?.partyScreenPayload) return world.partyScreenPayload;
  const uiState = buildUiState(world, { includeDebug: false });
  const payload = buildPartyTurnBootstrapPayloadFromUiState(uiState, {
    partyId: world?.worldKey ?? 'party_runtime_test',
    turnNumber: Number(world?.partyRuntimeState?.current_turn_number ?? 0),
    messageId: `test-bootstrap:${world?.worldKey ?? 'world'}`
  });
  world.partyScreenPayload = structuredClone(payload);
  return payload;
}
