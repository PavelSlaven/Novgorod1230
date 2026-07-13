import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPartyTurnRuntimeState,
  resolveTurnIntentRoute,
  resolveTurnMode,
  runPartyTurnPipeline
} from '../src/world/turn-runtime/index.js';
import { getTurnLlmRoleConfigs, getTurnRoleConfig } from '../src/world/provider-config.js';

test('resolveTurnMode decomposes mixed intent into orchestration modes instead of world facts', () => {
  const resolution = resolveTurnMode('Я тихо подхожу к двери, слушаю, а потом пробую открыть.', {
    partyId: 'party_001',
    turnNumber: 1,
    visibleExits: [{ label: 'дверь' }]
  });

  assert.equal(resolution.selected_primary_mode, 'item_property');
  assert.deepEqual(
    resolution.secondary_modes,
    ['attention', 'movement_scene', 'stealth_order_violation', 'stealth', 'item_access', 'time_progression']
  );
  assert.equal(resolution.intent.player_words_are_world_facts, false);
  assert.equal(resolution.target.label, 'дверь');
  assert.equal(resolution.schema, 'turn_mode_resolution');
});

test('intent router returns retrieval scope for social mixed turn', () => {
  const route = resolveTurnIntentRoute('Тихо подхожу к человеку, показываю пустые руки и спрашиваю про ворота.', {
    partyId: 'party_001',
    turnNumber: 2
  });

  assert.equal(route.candidate_primary_mode, 'social_npc');
  assert.match(route.candidate_secondary_modes.join(' '), /movement_scene/);
  assert.match(route.candidate_secondary_modes.join(' '), /stealth_order_violation/);
  assert.equal(route.needs_npcs, true);
  assert.equal(route.needs_hidden_state, true);
  assert.equal(route.schema, 'turn_intent_route');
});

test('party turn pipeline keeps raw_text as intent and returns safe player screen', async () => {
  const result = await runPartyTurnPipeline({
    partyScreenPayload: partyFirstScreenPayload(),
    rawText: 'осматриваюсь'
  });

  assert.equal(result.playerTurnInput.contract, 'intent_not_fact');
  assert.equal(result.playerTurnInput.raw_text, 'осматриваюсь');
  assert.equal(result.turnModeResolution.selected_primary_mode, 'attention');
  assert.equal(result.partyRuntimeState.current_turn_number, 1);
  assert.equal(result.partyRuntimeState.current_phase, 'awaiting_player_input');
  assert.equal(result.partyScreenPayload.party_turn_screen.schema, 'party_turn_screen');
  const serialized = JSON.stringify(result.partyScreenPayload);
  assert.equal(serialized.includes('private_motives'), false);
  assert.equal(serialized.includes('source_001'), false);
  assert.equal(serialized.includes('npc_001'), false);
});

test('suggested action stays intent and increments runtime state across turns', async () => {
  const first = await runPartyTurnPipeline({
    partyScreenPayload: partyFirstScreenPayload(),
    rawText: 'Подойти к тёмному проходу.',
    selectedActionOptionId: 'suggested_action_001'
  });
  const second = await runPartyTurnPipeline({
    partyScreenPayload: first.partyScreenPayload,
    partyRuntimeState: first.partyRuntimeState,
    rawText: 'иду на север'
  });

  assert.equal(first.playerTurnInput.input_source, 'suggested_action');
  assert.equal(first.playerTurnInput.selected_action_option_id, 'suggested_action_001');
  assert.equal(first.turnModeResolution.selected_primary_mode, 'movement_scene');
  assert.equal(second.partyRuntimeState.current_turn_number, 2);
  assert.equal(second.partyRuntimeState.current_phase, 'awaiting_player_input');
  assert.equal(second.turnModeResolution.selected_primary_mode, 'movement_scene');
});

test('createPartyTurnRuntimeState activates from first screen without legacy world loop', () => {
  const runtimeState = createPartyTurnRuntimeState({ partyScreenPayload: partyFirstScreenPayload() });
  assert.equal(runtimeState.schema, 'party_turn_runtime_state');
  assert.equal(runtimeState.current_turn_number, 0);
  assert.equal(runtimeState.current_phase, 'awaiting_player_input');
});

test('turn role configs use separate DeepSeek models and JSON contracts', () => {
  const env = {
    DEEPSEEK_API_KEY: 'test-key',
    TURN_INTENT_ROUTER_MODEL: 'router-x',
    TURN_ORCHESTRATOR_MODEL: 'orch-x',
    TURN_AUDITOR_MODEL: 'audit-x',
    TURN_FORMAT_REPAIR_MODEL: 'repair-x'
  };

  const router = getTurnRoleConfig('intent_router', env);
  const orchestrator = getTurnRoleConfig('orchestrator', env);
  const configs = getTurnLlmRoleConfigs(env);

  assert.equal(router.model, 'router-x');
  assert.equal(router.responseFormat.type, 'json_object');
  assert.equal(orchestrator.model, 'orch-x');
  assert.equal(orchestrator.thinking.type, 'enabled');
  assert.equal(configs.auditor.model, 'audit-x');
  assert.equal(configs.format_repairer.model, 'repair-x');
  assert.equal(configs.auditor.responseFormat.type, 'json_object');
});

function partyFirstScreenPayload() {
  return {
    version: 1,
    schema: 'party_first_screen_ui_payload',
    party_id: 'party_001',
    openingText: 'Темно и холодно.',
    firstGameScreen: {
      version: 1,
      schema: 'first_game_screen',
      request_id: 'req_001',
      screen_status: 'ready',
      party_id: 'party_001',
      turn_number: 0,
      main_prose: 'Темно и холодно. Рядом виден закрытый ларь, а у стены стоит человек.',
      position_panel: {
        public_position_label: 'у закрытого ларя в тёмном углу',
        technical_position_hidden: true,
        debug_position: null
      },
      time_panel: {
        public_time_label: 'глубокая ночь',
        public_light_label: 'темно, видимость ограничена',
        public_weather_label: 'холодно'
      },
      character_panel: {
        public_character_label: 'Ты',
        body_state_summary: ['ощущается холод'],
        inventory_summary: [],
        warning_badges: ['видимость ограничена']
      },
      attention_panel: {
        visible_npcs: [{ label: 'человек у стены', attention_mode: 'ask', risk_hint: 'low', certainty: 'visible' }],
        visible_items: [],
        visible_containers: [{ label: 'закрытый ларь', attention_mode: 'inspect', risk_hint: 'medium', certainty: 'visible' }],
        visible_exits: [
          { label: 'дверь', attention_mode: 'move', risk_hint: 'unknown', certainty: 'visible' },
          { label: 'тёмный проход', attention_mode: 'move', risk_hint: 'medium', certainty: 'visible' }
        ],
        audible_or_sensory_cues: [{ label: 'можно прислушаться к темноте', attention_mode: 'listen', certainty: 'uncertain' }],
        known_context_hints: [{ label: 'чужие вещи лучше не трогать без причины', certainty: 'known' }]
      },
      action_panel: {
        suggested_actions: [
          { suggested_action_id: 'suggested_action_001', label: 'Подойти к тёмному проходу.', action_kind: 'move' }
        ],
        free_text_input: {
          enabled: true,
          placeholder: 'Что ты делаешь?',
          input_contract: 'player_intent_not_world_fact'
        }
      },
      map_panel: {
        enabled: true,
        map_mode: 'character_known_only',
        known_current_node: { label: 'текущая точка', certainty: 'known_current' },
        known_nearby_nodes: [],
        unknown_exits: [{ label: 'дверь', certainty: 'visible_but_unknown' }],
        must_not_show_hidden_nodes: true
      },
      delivery_state: {
        message_id: 'opening_message_001',
        opening_scene_presented: false,
        awaiting_client_ack: true
      }
    }
  };
}
