import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoHiddenFields,
  createApiClient,
  createUiStore,
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
    action_panel: { suggested_actions: [{ option_id: 'go', label: 'Идти' }] },
    panels: {}
  };
}

test('public screen contract accepts versioned read models and rejects hidden fields', () => {
  assert.equal(validatePublicScreen(firstScreen()).schema, 'first_game_screen');
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
