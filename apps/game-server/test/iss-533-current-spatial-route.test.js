import assert from 'node:assert/strict';
import test from 'node:test';

import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';

const visibleContext = (visibleScene, visibleObjects = []) => ({
  version: 1,
  schema: 'visible_context_package',
  visible_scene: visibleScene,
  visible_changes: [],
  sensory_details: [],
  visible_npc: [],
  visible_objects: visibleObjects,
  known_context: [],
  uncertainties: [],
  allowed_tensions: [],
  do_not_imply: []
});

const movementObject = (entityId, displayLabel, entityKind = 'scene_movement_edge') => ({
  entity_ref: { entity_kind: entityKind, entity_id: entityId },
  display_label: displayLabel
});

const payload = (routes = []) => ({
  actor_id: 'player-1',
  position: { location_ref: 'g5-current', position_id: 'position-current' },
  routes,
  available_routes: [],
  items: [],
  containers: [],
  container_placements: [],
  npcs: [],
  conversation_sessions: []
});

const project = ({ state = payload(), screen, currentVisibleContext } = {}) =>
  projectLowerDvinaTraceScreenPanels({
    payload: state,
    screen,
    ...(currentVisibleContext === undefined ? {} : { currentVisibleContext })
  });

const routeOptions = (screen) => screen.panels.route.data.movement.options;

test('route panel uses fresh place and exits when the saved screen is stale', () => {
  const screen = {
    visible_context: visibleContext('Прежнее место', [
      movementObject('old-edge', 'Старый проход')
    ]),
    panels: {}
  };
  const fresh = visibleContext('Текущее место', [
    movementObject('current-edge', 'Нынешний проход')
  ]);

  const result = project({ screen, currentVisibleContext: fresh });

  assert.equal(result.panels.route.data.current_place, 'Текущее место');
  assert.deepEqual(routeOptions(result), [
    { label: 'Нынешний проход', knowledge_state: 'known' }
  ]);
  assert.equal(JSON.stringify(result.panels.route).includes('Старый проход'), false);
});

test('an explicitly fresh empty scene does not fall back to saved exits', () => {
  const screen = {
    visible_context: visibleContext('Прежнее место', [
      movementObject('old-exit', 'Старый выход', 'g4_directional_exit')
    ]),
    panels: {}
  };

  const result = project({
    screen,
    currentVisibleContext: visibleContext('Текущее пустое место')
  });

  assert.equal(result.panels.route.data.current_place, 'Текущее пустое место');
  assert.deepEqual(routeOptions(result), []);
});

test('known routes from the player-safe projection remain alongside fresh Spatial exits', () => {
  const screen = {
    visible_context: visibleContext('Прежнее место', [
      movementObject('old-edge', 'Старый проход')
    ]),
    panels: {}
  };
  const knownRoute = {
    route_ref: 'route:known',
    from_ref: 'g5-current',
    to_ref: 'g5-destination',
    label: 'Знакомая дорога',
    known: true
  };

  const result = project({
    state: payload([knownRoute]),
    screen,
    currentVisibleContext: visibleContext('Текущее место', [
      movementObject('current-edge', 'Нынешний проход')
    ])
  });

  assert.deepEqual(routeOptions(result), [
    { label: 'Знакомая дорога', knowledge_state: 'known' },
    { label: 'Нынешний проход', knowledge_state: 'known' }
  ]);
});

test('without an explicit fresh context the saved screen remains the fallback', () => {
  const screen = {
    visible_context: visibleContext('Место сохранённого экрана', [
      movementObject('saved-edge', 'Сохранённый выход')
    ]),
    panels: {}
  };

  const result = project({ screen });

  assert.equal(result.panels.route.data.current_place, 'Место сохранённого экрана');
  assert.deepEqual(routeOptions(result), [
    { label: 'Сохранённый выход', knowledge_state: 'known' }
  ]);
});

test('projection preserves inputs and returns the same result for the same inputs', () => {
  const state = payload([{
    route_ref: 'route:known',
    from_ref: 'g5-current',
    to_ref: 'g5-destination',
    label: 'Знакомая дорога',
    known: true
  }]);
  const screen = {
    visible_context: visibleContext('Прежнее место', [
      movementObject('old-edge', 'Старый проход')
    ]),
    panels: { route: { visible: true, data: { retained: ['package-field'] } } }
  };
  const fresh = visibleContext('Текущее место', [
    movementObject('current-edge', 'Нынешний проход')
  ]);
  const before = structuredClone({ state, screen, fresh });

  const first = project({ state, screen, currentVisibleContext: fresh });
  const second = project({ state, screen, currentVisibleContext: fresh });

  assert.deepEqual({ state, screen, fresh }, before);
  assert.deepEqual(second, first);
});
