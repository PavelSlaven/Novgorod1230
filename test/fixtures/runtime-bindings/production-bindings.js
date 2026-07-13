import { computeStage26ScreenDigest } from '@rus/contracts';

export async function createRuntimeBindings() {
  return {
    newGameOptionsFactory: async () => ({}),
    turnServicesFactory: async () => ({}),
    stage25PostcommitProjector: async () => ({ version: 1, schema: 'unused_test_postcommit' }),
    newGameRunner: async (options) => ({
      status: 'approved',
      artifact: stage26Fixture(options.requestId),
      checkpoint: { outputs: {} }
    }),
    turnRunner: async (input) => turnFixture(input)
  };
}

function stage26Fixture(requestId) {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-browser-1',
    main_prose: 'Перед тобой дорога к Новгороду.',
    action_panel: { suggested_actions: [{ option_id: 'look', label: 'Осмотреться' }] },
    position_panel: { position_ref: { g1_id: 'g1-1', g2_id: 'g2-1' } },
    panels: {},
    delivery_state: { message_id: 'message-browser-1' }
  };
  return {
    version: 1,
    schema: 'stage26_first_game_screen_result',
    pass: true,
    request_id: requestId ?? 'request-browser-1',
    party_id: screen.party_id,
    transaction_id: 'tx-browser-1',
    first_game_screen: screen,
    screen_digest: computeStage26ScreenDigest(screen),
    visible_context_package_digest: 'sha256:visible',
    narrator_output_digest: 'sha256:narrator',
    delivery_permission: { can_create_delivery_attempt: true, can_show_screen: true, can_accept_first_turn_intent: true }
  };
}

function turnFixture(input) {
  return {
    version: 1,
    schema: 'turn_result',
    party_id: input.party_id,
    turn_id: `turn-${input.turn_number}`,
    turn_number: input.turn_number,
    status: 'resolved',
    mode: 'attention',
    summary: { outcome: 'observed' },
    commit: { status: 'committed' },
    screen: {
      version: 1,
      schema: 'turn_screen',
      screen_status: 'ready',
      party_id: input.party_id,
      turn_id: `turn-${input.turn_number}`,
      turn_number: input.turn_number,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: { current_position: { g1_id: 'g1-1' } },
      input_panel: { input_contract: 'intent_not_fact' },
      action_panel: { suggested_actions: [] },
      panels: {}
    }
  };
}
