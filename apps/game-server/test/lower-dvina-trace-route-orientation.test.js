import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { projectLowerDvinaTracePlayerSafeState } from '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { withLowerDvinaTraceCurrentScene } from '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { projectLowerDvinaTraceScreenPanels } from '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { perceivedRoutesForState } from '../src/runtime/lower-dvina-trace-scene-presentation.js';
import { resolveTracePhase3Contracts } from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3MovementCommand } from '../src/runtime/lower-dvina-trace-phase-3-movement-command.js';

const bundle = await loadScenarioBundle(33);
const scenePresentation = bundle.scene_presentation;
const historical = await loadScenarioBundle(9);

test('current initial route reaches safe context and panel without disclosing its destination', () => {
  const state = fixture({ scenarioBundle: historical, materializationBundle: historical }).state;
  for (const loaded of [state, { ...JSON.parse(JSON.stringify(state)),
    party_state: { ...state.party_state, state_version: 1 } }]) {
    const current = withLowerDvinaTraceCurrentScene({ committedState: loaded,
      scenePresentation });
    const safe = projectLowerDvinaTracePlayerSafeState({ committed_state: current,
      actor_id: state.actor_id, scene_presentation: scenePresentation }).player_safe_state;
    assert.equal(safe.available_routes.length, 1);
    assert.equal(safe.available_routes[0].route_ref, 'trace_ld_v1_route_wreck_to_camp');
    assert.equal(safe.available_routes[0].to_ref, undefined);
    assert.equal(safe.available_routes[0].label, 'Приметная тропа за ивняк');
    assert.doesNotMatch(JSON.stringify(current.current_visible_context), /рыбацк|стану|8 минут/u);
    const contracts = resolveTracePhase3Contracts({ state: loaded,
      bundle: { ...historical, scene_presentation: scenePresentation } });
    const command = createTracePhase3MovementCommand({ contracts, inputDigest: 'input' });
    assert.equal(command.availability({ committed_state: loaded }).can_attempt, true);
    assert.equal(command.label, safe.available_routes[0].label);
    assert.doesNotMatch(command.reason_visible_to_actor, /стан/u);
    const screen = projectLowerDvinaTraceScreenPanels({ payload: loaded,
      screen: { visible_context: current.current_visible_context }, presentation: { scenePresentation } });
    assert.equal(screen.panels.route.data.movement.options[0].label, safe.available_routes[0].label);
    assert.deepEqual(loaded.route_knowledge, state.route_knowledge);
  }
});

test('unseen route uses source perception, then remembered destination, with no stale route after movement', () => {
  const presentation = { route_presentations: [{ route_ref: 'route:unseen', from_ref: 'bank',
    to_ref: 'mill', label: 'Дорога к мельнице', perceived_label: 'Тропинка между кустами',
    initial_perception_requirement: 'source_location_perception' }] };
  const initial = { position: { location_ref: 'bank' }, route_knowledge: [] };
  assert.deepEqual(perceivedRoutesForState({ scenePresentation: presentation, state: initial }), [{
    route_ref: 'route:unseen', from_ref: 'bank', label: 'Тропинка между кустами', known: false }]);
  const returned = { ...initial, route_history: [{ route_ref: 'route:unseen' }] };
  assert.equal(perceivedRoutesForState({ scenePresentation: presentation, state: returned })[0].to_ref, 'mill');
  assert.deepEqual(perceivedRoutesForState({ scenePresentation: presentation,
    state: { ...returned, position: { location_ref: 'other' } } }), []);
  delete presentation.route_presentations[0].initial_perception_requirement;
  assert.deepEqual(perceivedRoutesForState({ scenePresentation: presentation, state: initial }), []);
});
