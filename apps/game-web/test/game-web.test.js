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
import { renderConversationPortrait } from
  '../src/features/conversation-portrait/render.js';
import { renderCurrentTask } from
  '../src/features/current-task/render.js';
import { renderLandscape } from '../src/features/landscape/render.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';
import { renderMapPanel, renderSceneMinimap } from
  '../src/features/map/render.js';

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

test('public screen validates exact optional scene affordances', () => {
  const valid = {
    ...firstScreen(),
    panels: {
      journal: {
        visible: true, data: { current_task: '<b>Найти проводника</b>' }
      },
      people: {
        visible: true,
        data: {
          active_interlocutor: {
            entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
            display_label: 'Еремей', role_label: 'рыбак',
            portrait_asset_id: 'lower-dvina-eremey'
          }
        }
      }
    }
  };
  assert.doesNotThrow(() => validatePublicScreen(valid));
  assert.throws(() => validatePublicScreen({
    ...valid,
    panels: {
      ...valid.panels,
      journal: { visible: true, data: { current_task: '   ' } }
    }
  }), { code: 'CURRENT_TASK_INVALID' });
  assert.throws(() => validatePublicScreen({
    ...valid,
    panels: {
      ...valid.panels,
      people: {
        visible: true,
        data: {
          active_interlocutor: {
            ...valid.panels.people.data.active_interlocutor,
            physical_description: 'не должен пройти контракт'
          }
        }
      }
    }
  }), { code: 'ACTIVE_INTERLOCUTOR_INVALID' });
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

test('UI store keeps one exact pending opening identity and clears it after acknowledgement', () => {
  const store = createUiStore();
  store.setScreen(firstScreen(), {
    openingStatus: 'pending',
    clientAckId: 'web:party-1:stable',
    acknowledgedAt: '2026-08-14T12:00:00.000Z'
  });
  assert.deepEqual(store.getState().opening, {
    status: 'pending',
    clientAckId: 'web:party-1:stable',
    acknowledgedAt: '2026-08-14T12:00:00.000Z'
  });

  store.setOpeningAcknowledged();
  assert.deepEqual(store.getState().opening, {
    status: 'acknowledged',
    clientAckId: null,
    acknowledgedAt: null
  });
  assert.equal('partyState' in store.getState(), false);
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
  assert.match(html, /data-scene-weather-canvas/u);
  assert.match(html, /Берег Двины/u);
  assert.match(html, /Позднее лето/u);
  assert.match(html, /data-turn-form/u);
  assert.doesNotMatch(html, /data-action-id/u);
  assert.doesNotMatch(html, /не показывать|река|лес|лодка|layout_x|\bx=|\by=/u);
});

test('current task is explicit, visible-panel-only and escaped without fallbacks', () => {
  const screen = {
    ...firstScreen(),
    objective: 'Не использовать как задачу',
    panels: {
      journal: {
        visible: true,
        data: { current_task: '<img src=x onerror=task()>' }
      }
    }
  };
  const task = renderCurrentTask(screen);
  assert.match(task, /data-current-task/u);
  assert.match(task, /&lt;img src=x onerror=task\(\)&gt;/u);
  assert.doesNotMatch(task, /<img/u);
  assert.equal(renderCurrentTask({
    ...screen,
    panels: { journal: { visible: false, data: { current_task: 'Скрыто' } } }
  }), '');
  assert.equal(renderCurrentTask({ ...screen, panels: {} }), '');
});

test('landscape is deterministic and varies only by closed public inputs', () => {
  const screen = {
    ...firstScreen(),
    visible_context: {
      location_label: 'Берег Двины',
      environment: {
        profile_id: 'env.local_variable',
        facts: ['wet', 'cold', 'exposed', 'unknown-fact']
      },
      weather: 'Дождь',
      day_part: 'dusk',
      timestamp: '1230-01-01T00:00:00Z'
    }
  };
  const first = renderLandscape(screen);
  const second = renderLandscape(structuredClone(screen));
  assert.equal(first, second);
  for (const modifier of [
    'landscape--wet', 'landscape--cold', 'landscape--exposed',
    'landscape--weather-rain', 'landscape--day-dusk'
  ]) assert.match(first, new RegExp(modifier, 'u'));
  assert.match(first, /data-landscape-canvas/u);
  assert.doesNotMatch(first, /profile_id|unknown-fact|timestamp/u);
});

test('public screen rejects unapproved landscape semantic inputs', () => {
  const withContext = (visible_context) => ({ ...firstScreen(), visible_context });
  assert.doesNotThrow(() => validatePublicScreen(withContext({
    environment: {
      profile_id: 'env.land_path',
      node_category: 'spatial.g3.route_site',
      facts: ['cold', 'wet', 'exposed']
    },
    weather: 'Дождь',
    day_part: 'сумерки'
  })));
  for (const visible_context of [{
    environment: { profile_id: 'forest_edge' }
  }, {
    environment: { node_category: 'village_edge' }
  }, {
    environment: { facts: ['snowy'] }
  }, {
    weather: 'storm'
  }, {
    day_part: 'sunset'
  }, {
    location_ref: 'unapproved-internal-id'
  }]) {
    assert.throws(() => validatePublicScreen(withContext(visible_context)), {
      code: 'LANDSCAPE_AFFORDANCE_INVALID'
    });
  }
});

test('landscape without supported cues uses the deterministic daily meadow', () => {
  const emptyScreen = { ...firstScreen(), visible_context: {} };
  const empty = renderLandscape(emptyScreen);
  assert.equal(empty, renderLandscape(structuredClone(emptyScreen)));
  assert.match(empty, /landscape--weather-clear/u);
  assert.match(empty, /landscape--day-day/u);

  const unsupportedScreen = {
    ...firstScreen(),
    visible_context: {
      location_label: '<Стан>',
      environment: { profile_id: 'night-rain', facts: ['very_cold'] },
      sensory_details: ['very wet', 'cold wind'],
      weather_label: 'Сильный дождь', day_part_label: 'Поздняя ночь'
    }
  };
  const unsupported = renderLandscape(unsupportedScreen);
  assert.equal(unsupported,
    renderLandscape(structuredClone(unsupportedScreen)));
  assert.match(unsupported, /&lt;Стан&gt;/u);
  assert.doesNotMatch(unsupported, /<Стан>/u);
  assert.match(unsupported, /landscape--weather-clear/u);
  assert.match(unsupported, /landscape--day-day/u);
  assert.doesNotMatch(unsupported,
    /night-rain|very_cold|Сильный дождь|Поздняя ночь/u);
});

test('landscape preserves exact Phase 2 environment sensory details', () => {
  const screen = {
    ...firstScreen(),
    visible_context: {
      visible_scene: 'Осмотр места крушения завершён.',
      sensory_details: [
        'wet', 'cold', 'exposed',
        'visible:road_bag_missing', 'trace_ld_v1_item_blue_wool_fragment'
      ]
    }
  };
  const first = renderLandscape(screen);
  assert.equal(first, renderLandscape(structuredClone(screen)));
  for (const modifier of [
    'landscape--cold', 'landscape--wet', 'landscape--exposed'
  ]) assert.match(first, new RegExp(modifier, 'u'));
  assert.doesNotMatch(first,
    /road_bag_missing|blue_wool_fragment/u);
  assert.equal(screen.visible_context.environment, undefined,
    'rendering must not add environment knowledge to the public screen');
});

test('conversation portrait uses only the canonical interlocutor field', () => {
  const screen = {
    ...firstScreen(),
    panels: {
      people: {
        visible: true,
        data: {
          active_interlocutor: {
            entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
            display_label: '<b>Еремей</b>', role_label: 'рыбак'
          },
          nearby_people: [{ display_label: 'Ратша' }]
        }
      }
    }
  };
  const portrait = renderConversationPortrait(screen);
  assert.match(portrait, /data-conversation-portrait/u);
  assert.match(portrait, /&lt;b&gt;Еремей&lt;\/b&gt;/u);
  assert.match(portrait, /рыбак/u);
  assert.doesNotMatch(portrait, /Ратша|<b>/u);
  assert.equal(renderConversationPortrait({
    ...screen,
    panels: {
      people: {
        visible: true,
        data: {
          active_interlocutor: {
            ...screen.panels.people.data.active_interlocutor,
            eye_color: 'blue'
          }
        }
      }
    }
  }), '');
});

test('conversation portrait uses an explicit valid spec and rejects malformed appearance', () => {
  const active = {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: 'Еремей',
    portrait_spec_v1: SAMPLE_PORTRAIT_SPEC
  };
  const screen = {
    ...firstScreen(),
    panels: { people: { visible: true, data: { active_interlocutor: active } } }
  };
  assert.doesNotThrow(() => validatePublicScreen(screen));
  const portrait = renderConversationPortrait(screen);
  assert.match(portrait, /data-conversation-portrait-canvas/u);
  assert.doesNotMatch(portrait, /<svg/u);
  assert.throws(() => validatePublicScreen({
    ...screen,
    panels: { people: { visible: true, data: {
      active_interlocutor: {
        ...active,
        portrait_spec_v1: {
          ...SAMPLE_PORTRAIT_SPEC,
          inferred_from_name: true
        }
      }
    } } }
  }), { code: 'ACTIVE_INTERLOCUTOR_INVALID' });
});

test('conversation portrait renders authored asset without requiring a spec', () => {
  const screen = {
    ...firstScreen(),
    panels: { people: { visible: true, data: { active_interlocutor: {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
      display_label: 'Еремей',
      portrait_asset_id: 'lower-dvina-eremey'
    } } } }
  };
  assert.doesNotThrow(() => validatePublicScreen(screen));
  assert.match(renderConversationPortrait(screen),
    /data-conversation-portrait-canvas/u);
  screen.panels.people.data.active_interlocutor.portrait_asset_id = ' ';
  assert.throws(() => validatePublicScreen(screen), {
    code: 'ACTIVE_INTERLOCUTOR_INVALID'
  });
});

test('minimap uses only sorted public nodes and links and keeps text facts', () => {
  const nodes = [{
    token: 'camp', label: 'Стан', certainty: 'known', layout_order: 2
  }, {
    token: 'shore', label: 'Берег', certainty: 'known', layout_order: 1
  }, {
    token: 'shed', label: '<b>Сушильня</b>', certainty: 'uncertain',
    layout_order: 3
  }, {
    token: 'yard', label: 'Двор', certainty: 'known', layout_order: 4
  }];
  const links = [{ from_token: 'camp', to_token: 'shed' },
    { from_token: 'shore', to_token: 'camp' },
    { from_token: 'missing', to_token: 'shore' }];
  const first = renderSceneMinimap({ nodes, links });
  const shuffled = renderSceneMinimap({
    nodes: [nodes[2], nodes[0], nodes[3], nodes[1]],
    links: [links[2], links[1], links[0]]
  });
  assert.equal(first, shuffled);
  assert.equal((first.match(/data-map-node=/gu) ?? []).length, 4);
  assert.equal((first.match(/data-map-link=/gu) ?? []).length, 2);
  assert.match(first, /Расположение условно/u);
  assert.match(first, /&lt;b&gt;Сушильня&lt;\/b&gt;/u);
  assert.doesNotMatch(first, /missing/u);

  const map = renderMapPanel({
    panels: {
      map: {
        visible: true,
        data: {
          scene_map: { nodes, links },
          world_signals: [{
            approximate_area: 'у ворот', approximate_direction: 'впереди'
          }]
        }
      }
    }
  });
  for (const detail of ['Стан', 'known', 'uncertain', 'у ворот', 'впереди']) {
    assert.match(map, new RegExp(detail, 'u'), detail);
  }
  assert.doesNotMatch(renderMapPanel({ panels: { map: {
    visible: false, data: { scene_map: { nodes, links } }
  } } }), /<svg/u);
  assert.doesNotMatch(renderMapPanel({ panels: { map: {
    visible: true, data: {}
  } } }), /<svg/u);
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

test('flow navigation is disabled only while a request or opening acknowledgement is pending', () => {
  const landing = createUiStore({ rememberedPartyId: 'party-1' });
  landing.setLoading();
  let html = renderAppState(landing.getState());
  assert.match(html, /data-start-new-game disabled/u);
  assert.match(html, /data-continue-party disabled/u);

  const newGame = createUiStore();
  newGame.showNewGame();
  newGame.setLoading();
  html = renderAppState(newGame.getState());
  assert.match(html, /data-return-start disabled/u);

  const game = createUiStore();
  game.setScreen(firstScreen());
  game.setLoading();
  html = renderAppState(game.getState());
  assert.match(html, /data-return-start disabled/u);

  const pending = renderScreen(firstScreen(), { openingStatus: 'pending' });
  assert.match(pending, /data-return-start disabled/u);
  const failed = renderScreen(firstScreen(), { openingStatus: 'failed' });
  assert.doesNotMatch(failed, /data-return-start disabled/u);
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

test('inventory and route overlays preserve the complete canonical player-safe details', () => {
  const inventory = renderScreen({
    ...firstScreen(),
    panels: {
      inventory: {
        visible: true,
        data: {
          summary: {
            load_category: 'light', total_mass_grams: 1200,
            at_limit: true, hands_used: 1, hands_total: 2, hands_free: 1
          },
          zones: {
            hands: [{ label: 'Нож', condition: 'sound', access: 'immediate' }],
            worn_quick: [], equipped: [], quick_containers: [],
            primary_container: {
              label: 'Сумка', condition: 'worn', access: 'restricted',
              closure_state: 'closed'
            },
            external_load: []
          },
          warnings: [{ message: 'Груз слишком тяжёл.' }]
        }
      }
    }
  }, { openingStatus: 'acknowledged', activeOverlay: 'inventory' });
  for (const detail of [
    'Лёгкая', '1200', 'На пределе нагрузки', 'Рук всего',
    'Состояние: исправно', 'Доступ: сразу доступно',
    'Состояние: изношено', 'Доступ: ограничен', 'Закрытие: закрыто',
    'Груз слишком тяжёл.'
  ]) assert.match(inventory, new RegExp(detail, 'u'), detail);

  const route = renderScreen({
    ...firstScreen(),
    panels: {
      route: {
        visible: true,
        data: {
          movement: {
            options: [{
              label: 'К воротам', knowledge_state: 'known', readiness: 'ready',
              observed_conditions: ['ворота открыты']
            }, {
              label: 'Слух о дороге', knowledge_state: 'uncertain',
              readiness: 'temporarily_blocked', observed_conditions: []
            }]
          }
        }
      }
    }
  }, { openingStatus: 'acknowledged', activeOverlay: 'route' });
  for (const detail of [
    'Знание: известно', 'Готовность: можно идти', 'Условия: ворота открыты',
    'Знание: сведения неточны', 'Готовность: временно недоступно'
  ]) assert.match(route, new RegExp(detail, 'u'), detail);
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
