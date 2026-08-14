import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoHiddenFields,
  createApiClient,
  createUiStore,
  renderAppState,
  renderScreen,
  validateApiEnvelope,
  validatePublicScreen
} from '../src/index.js';

function firstScreen() {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: '<script>bad()</script>Дорога уходит к реке.',
    visible_context: {
      location_label: 'Берег Двины',
      calendar: 'Позднее лето',
      ignored_internal_shape: { value: 'не показывать' }
    },
    action_panel: { suggested_actions: [{ option_id: 'go', label: 'Идти' }] },
    panels: {
      character: {
        visible: true,
        data: { name: 'Иван', role: 'Лодочник', health: 9 }
      },
      map: {
        visible: true,
        data: {
          scene_map: { nodes: [{ label: 'Берег', certainty: 'known' }], links: [] },
          world_signals: [{ approximate_area: 'у ворот', approximate_direction: 'впереди' }]
        }
      }
    }
  };
}

test('public screen contract accepts versioned read models and rejects hidden fields', () => {
  assert.equal(validatePublicScreen(firstScreen()).schema, 'first_game_screen');
  assert.equal(validatePublicScreen({
    ...firstScreen(),
    schema: 'lower_dvina_trace_turn_screen',
    turn_id: 'turn:trace:1',
    turn_number: 1,
    input_panel: { input_contract: 'intent_not_fact' }
  }).schema, 'lower_dvina_trace_turn_screen');
  assert.equal(validatePublicScreen({ ...firstScreen(), panels: { route: { player_label: 'Дорога' } } }).schema, 'first_game_screen');
  assert.throws(() => validatePublicScreen({ ...firstScreen(), hidden_state: {} }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' });
  assert.throws(() => validatePublicScreen({ ...firstScreen(), panels: { route: { factual_route: 'internal' } } }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' });
  for (const leak of ['dependencyPins', 'route', 'routePlan', 'routes', 'candidateSet', 'rawDiagnostic', 'rawTrace', 'trace', 'endpointBindings', 'bindings', 'nested-route', 'layoutX']) {
    assert.throws(() => validatePublicScreen({ ...firstScreen(), wrapper: { [leak]: { secret: 'never public' } } }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' }, leak);
  }
  assert.throws(() => assertNoHiddenFields({ nested: { private_motives: [] } }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' });
});

test('API client uses /api/v1 and validates success envelopes', async () => {
  const calls = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ version: 1, schema: 'rus_api_success', ok: true, data: { status: 'ok' } }) };
    }
  });
  const result = await client.health();
  assert.equal(result.status, 'ok');
  assert.equal(calls[0].url, 'https://example.test/api/v1/health');
  await client.listScenarios();
  assert.equal(calls[1].url, 'https://example.test/api/v1/scenarios');
});

test('invalid API envelopes are blocked before UI state update', () => {
  assert.throws(() => validateApiEnvelope({ ok: true, data: {} }), { code: 'API_ENVELOPE_INVALID' });
  assert.throws(() => validateApiEnvelope({ version: 1, schema: 'rus_api_success', ok: true, data: { write_plan: {} } }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' });
});

test('safe route panels survive API envelope nesting without admitting internal route facts', () => {
  const screen = {
    ...firstScreen(),
    panels: {
      route: {
        version: 1,
        schema: 'presentation_panel',
        kind: 'route',
        visible: true,
        data: {
          movement: {
            status: 'suspended_at_scene',
            message: 'Путь остановлен.',
            requires_new_decision: true,
            options: []
          }
        }
      }
    }
  };
  assert.doesNotThrow(() => validateApiEnvelope({
    version: 1,
    schema: 'rus_api_success',
    ok: true,
    data: { screen }
  }));
  assert.throws(() => validateApiEnvelope({
    version: 1,
    schema: 'rus_api_success',
    ok: true,
    data: {
      screen: {
        ...screen,
        panels: {
          route: { data: { factual_route: 'internal-only' } }
        }
      }
    }
  }), { code: 'PUBLIC_PAYLOAD_HIDDEN_LEAK' });
});

test('UI store keeps screen read model instead of duplicating party state', () => {
  const store = createUiStore();
  store.setScreen(firstScreen());
  const state = store.getState();
  assert.equal(state.partyId, 'party-1');
  assert.equal(state.screen.schema, 'first_game_screen');
  assert.equal('partyState' in state, false);
  assert.equal('worldState' in state, false);
});

test('feature rendering escapes prose and keeps action as intent', () => {
  const html = renderScreen(firstScreen());
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.match(html, /data-turn-form/u);
  assert.match(html, /data-action-id="go"/u);
});

test('landing always renders the Lovable-style shell and Continue only for remembered party', () => {
  const store = createUiStore();
  let html = renderAppState(store.getState());
  assert.match(html, /Хроника/u);
  assert.match(html, /Русь, лета 6738/u);
  assert.match(html, /data-start-new-game/u);
  assert.match(html, /data-theme-toggle/u);
  assert.doesNotMatch(html, /data-continue-party/u);

  store.setRememberedPartyId('party-remembered');
  html = renderAppState(store.getState());
  assert.match(html, /data-continue-party/u);
  assert.doesNotMatch(html, /data-screen-schema/u);
});

test('new-game view keeps free text and scenario inputs as separate branches', () => {
  const store = createUiStore({ rememberedPartyId: 'party-old' });
  store.setScenarios([{
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    title: 'Нижняя Двина: позднее лето',
    description: 'Первый тестовый сценарий.',
    available: true
  }]);
  store.showNewGame();
  const html = renderAppState(store.getState());
  assert.match(html, /data-new-game-form/u);
  assert.match(html, /textarea id="start-text" name="start_text" required/u);
  assert.match(html, /data-scenario-id="lower_dvina_late_summer_open_water_v1"/u);
  assert.doesNotMatch(html, /name="scenario_id"|name="player_name"|Пусто тоже можно/u);
  assert.equal(store.getState().rememberedPartyId, 'party-old');
});

test('game shell has factual context, neutral viewport, independent input and no fake geography', () => {
  const screen = { ...firstScreen(), action_panel: { suggested_actions: [] } };
  const html = renderScreen(screen, { openingStatus: 'acknowledged' });
  assert.match(html, /data-screen-schema="first_game_screen"/u);
  assert.match(html, /scene-viewport/u);
  assert.match(html, /Берег Двины/u);
  assert.match(html, /Позднее лето/u);
  assert.match(html, /data-turn-form/u);
  assert.doesNotMatch(html, /data-action-id/u);
  assert.doesNotMatch(html, /не показывать|река|лес|лодка|layout_x|\bx=|\by=/u);
});

test('opening blocks intent until acknowledgement and exposes retry only on failure', () => {
  const pending = renderScreen(firstScreen(), { openingStatus: 'pending' });
  assert.match(pending, /Подтверждаем вступление/u);
  assert.match(pending, /textarea[^>]+disabled/u);
  const failed = renderScreen(firstScreen(), {
    openingStatus: 'failed', error: { message: 'Сбой подтверждения' }
  });
  assert.match(failed, /data-retry-opening-ack/u);
  assert.match(failed, /Сбой подтверждения/u);
});

test('overlays render allowlisted player-safe fields without JSON dumps or map geometry', () => {
  const character = renderScreen(firstScreen(), {
    openingStatus: 'acknowledged', activeOverlay: 'character'
  });
  assert.match(character, /role="dialog"/u);
  assert.match(character, /Иван/u);
  assert.match(character, /Лодочник/u);
  assert.doesNotMatch(character, /<pre>|ignored_internal_shape/u);

  const map = renderScreen(firstScreen(), {
    openingStatus: 'acknowledged', activeOverlay: 'map'
  });
  assert.match(map, /Берег/u);
  assert.match(map, /у ворот/u);
  assert.match(map, /впереди/u);
  assert.doesNotMatch(map, /from_token|to_token|layout|coordinate/u);
});

test('API-provided labels, context, prose and panel values stay escaped', () => {
  const screen = {
    ...firstScreen(),
    visible_context: { location_label: '<img src=x onerror=bad()>' },
    action_panel: { suggested_actions: [{ option_id: '" autofocus', label: '<b>Идти</b>' }] },
    panels: {
      character: { visible: true, data: { name: '<script>panel()</script>' } }
    }
  };
  const html = renderScreen(screen, {
    openingStatus: 'acknowledged', activeOverlay: 'character'
  });
  assert.doesNotMatch(html, /<script>|<img|<b>/u);
  assert.match(html, /&lt;script&gt;panel\(\)&lt;\/script&gt;/u);
  assert.match(html, /data-action-id="&quot; autofocus"/u);
});

test('theme and overlay are UI-only state and clear does not erase remembered party', () => {
  const store = createUiStore({ rememberedPartyId: 'party-1', theme: 'dark' });
  store.setScreen(firstScreen());
  store.openOverlay('character');
  assert.equal(store.getState().theme, 'dark');
  assert.equal(store.getState().activeOverlay, 'character');
  assert.equal('partyState' in store.getState(), false);
  store.clear();
  assert.equal(store.getState().view, 'landing');
  assert.equal(store.getState().rememberedPartyId, 'party-1');
});
