import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeOpeningDelivery,
  buildFirstGameScreen,
  createOpeningDeliveryAckPatch,
  findForbiddenFirstScreenFields
} from '../src/world/new-game-pipeline/index.js';
import { buildPartyFirstScreenUiPayload } from '../src/ui/party-screen-adapter.js';

test('first screen uses approved narrator prose without regeneration', () => {
  const input = firstScreenInput();
  input.visible_context_package.public_prose_hint = 'Эту строку нельзя использовать как prose.';

  const screen = buildFirstGameScreen(input);

  assert.equal(screen.main_prose, input.approved_narrator_output.prose);
  assert.deepEqual(
    screen.action_panel.suggested_actions.map((item) => item.label),
    input.approved_narrator_output.action_options.map((item) => item.label)
  );
});

test('party UI adapter maps current DDL active state to ready screen safely', () => {
  const payload = buildPartyFirstScreenUiPayload({
    requestId: 'req_001',
    transactionId: 'tx_001',
    partyState: {
      id: 'party_001',
      status: 'active',
      audit_state: {
        is_ready_for_player: true,
        current_phase: 'awaiting_player_input',
        current_turn_number: 0,
        opening_scene_presented: false
      }
    },
    currentPosition: currentPosition(),
    narratorOutputId: 'opening_message_001',
    approvedNarratorOutput: approvedNarratorOutput(),
    narratorProseAudit: passedNarratorAudit(),
    visibleContextPackage: visibleContextPackage(),
    visibleContextAudit: passedVisibleAudit(),
    partyPublicState: partyPublicState()
  });

  assert.equal(payload.firstGameScreen.screen_status, 'ready');
  assert.equal(payload.firstGameScreen.delivery_state.message_id, 'opening_message_001');
  assert.equal(payload.firstGameScreen.delivery_state.opening_scene_presented, false);
  assert.equal(payload.openingText, approvedNarratorOutput().prose);
});

test('first screen payload is idempotent for same committed snapshots', () => {
  const input = firstScreenInput();

  assert.deepEqual(buildFirstGameScreen(input), buildFirstGameScreen(input));
});

test('first screen excludes raw audit source hidden payloads', () => {
  const input = firstScreenInput({
    party_public_state: {
      ...partyPublicState(),
      public_visible_npcs: [
        {
          label: 'человек у стены',
          npc_instance_id: 'npc_001',
          hidden_state: { private_motives: ['сторожит ларь'] },
          source_trace: ['source_001'],
          audit: { pass: false }
        }
      ],
      public_visible_items: [
        {
          label: 'закрытый ларь',
          item_instance_id: 'item_001',
          closed_container_contents: ['серебро']
        }
      ]
    }
  });

  const screen = buildFirstGameScreen(input);
  const serialized = JSON.stringify(screen);

  assert.deepEqual(findForbiddenFirstScreenFields(screen), []);
  assert.equal(serialized.includes('сторожит ларь'), false);
  assert.equal(serialized.includes('source_001'), false);
  assert.equal(serialized.includes('серебро'), false);
  assert.equal(serialized.includes('npc_instance_id'), false);
  assert.equal(serialized.includes('item_instance_id'), false);
  assert.equal(serialized.includes('container_instance_id'), false);
});

test('delivery ack only changes delivery state', () => {
  const screen = buildFirstGameScreen(firstScreenInput());
  const acknowledged = acknowledgeOpeningDelivery(screen, {
    clientAckId: 'ack_001',
    shownAt: '2026-07-07T15:00:00.000Z'
  });

  const beforeRest = withoutDeliveryState(screen);
  const afterRest = withoutDeliveryState(acknowledged);

  assert.deepEqual(afterRest, beforeRest);
  assert.equal(acknowledged.delivery_state.opening_scene_presented, true);
  assert.equal(acknowledged.delivery_state.awaiting_client_ack, false);
  assert.equal(acknowledged.delivery_state.client_ack_id, 'ack_001');

  const patch = createOpeningDeliveryAckPatch(screen, {
    clientAckId: 'ack_001',
    shownAt: '2026-07-07T15:00:00.000Z'
  });
  assert.deepEqual(Object.keys(patch).sort(), ['delivery_state', 'message_id', 'party_id', 'party_state_patch']);
});

function firstScreenInput(overrides = {}) {
  return {
    version: 1,
    schema: 'first_game_screen_input',
    request_id: 'req_001',
    party_start_committed: partyStartCommitted(),
    approved_narrator_output: approvedNarratorOutput(),
    narrator_prose_audit: passedNarratorAudit(),
    visible_context_package: visibleContextPackage(),
    visible_context_audit: passedVisibleAudit(),
    party_public_state: partyPublicState(),
    ...overrides
  };
}

function partyStartCommitted() {
  return {
    version: 1,
    schema: 'party_start_committed',
    request_id: 'req_001',
    commit_status: 'committed',
    party_id: 'party_001',
    transaction_id: 'tx_001',
    party_state: {
      status: 'ready',
      is_ready_for_player: true,
      current_phase: 'awaiting_player_input',
      current_turn_number: 0
    },
    current_position: currentPosition(),
    player_output_ref: {
      narrator_output_id: 'opening_message_001',
      player_visible_message_ready: true,
      opening_scene_presented: false
    }
  };
}

function currentPosition() {
  return {
    region_id: 'region_novgorod_land',
    place_id: 'place_001',
    location_id: 'location_001',
    minilocation_id: 'minilocation_001',
    anchor_id: 'anchor_001',
    last_route_id: null
  };
}

function approvedNarratorOutput() {
  return {
    version: 1,
    schema: 'narrator_starting_prose',
    prose_status: 'drafted',
    prose: 'Темно и холодно. Рядом виден закрытый ларь, а у стены стоит человек.',
    action_options: [
      { label: 'Осмотреть ларь.', action_kind: 'inspect', target_ref: { container_instance_id: 'container_001' } },
      { label: 'Заговорить с человеком.', action_kind: 'ask', target_ref: { npc_instance_id: 'npc_001' } }
    ],
    used_visible_context_refs: ['visible_ref_001'],
    self_constraints_check: {}
  };
}

function passedNarratorAudit() {
  return {
    version: 1,
    schema: 'narrator_prose_audit',
    pass: true,
    commit_permission: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  };
}

function visibleContextPackage() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_context_status: 'formed'
  };
}

function passedVisibleAudit() {
  return {
    version: 1,
    schema: 'visible_context_audit',
    pass: true
  };
}

function partyPublicState() {
  return {
    version: 1,
    schema: 'party_public_state',
    public_position_label: 'у закрытого ларя в тёмном углу',
    public_time_label: 'глубокая ночь',
    public_light_label: 'темно, видимость ограничена',
    public_weather_label: 'холодно',
    public_character_label: 'Ты',
    public_body_state_summary: ['ощущается холод'],
    public_inventory_summary: [],
    public_warning_badges: ['видимость ограничена'],
    public_visible_npcs: [{ label: 'человек у стены', attention_mode: 'ask', risk_hint: 'low', certainty: 'visible' }],
    public_visible_items: [],
    public_visible_containers: [{ label: 'закрытый ларь', attention_mode: 'inspect', risk_hint: 'medium', certainty: 'visible' }],
    public_visible_exits: [{ label: 'тёмный проход', attention_mode: 'inspect', risk_hint: 'unknown', certainty: 'visible_but_destination_unknown' }],
    public_attention_targets: [{ label: 'можно прислушаться к темноте', attention_mode: 'listen', certainty: 'uncertain' }],
    public_context_hints: [{ label: 'чужие вещи лучше не трогать без причины', certainty: 'known' }],
    public_visible_map: {
      known_current_node: { label: 'текущая точка', certainty: 'known_current' },
      known_nearby_nodes: [],
      unknown_exits: [{ label: 'тёмный проход', certainty: 'visible_but_unknown' }]
    }
  };
}

function withoutDeliveryState(screen) {
  const clone = structuredClone(screen);
  delete clone.delivery_state;
  return clone;
}
