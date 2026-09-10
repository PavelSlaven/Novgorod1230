import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLowerDvinaTraceScreenPanels } from '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { loadLowerDvinaTraceScreenPresentation } from '../src/internal/lower-dvina-trace-screen-presentation.js';

const presentation = await loadLowerDvinaTraceScreenPresentation({ materialization_trace: {
  seed_context: { scenario_definition_revision: 33 } } });
function payload() {
  return { party_id: 'party', actor_id: 'player', party_state: { state_version: 2 },
    player_profile: { identity: { name: 'Гость' }, attributes: { strength: { value: 10 } } },
    body_state: { health: 90, energy: 73, satiety: 81 },
    clock: { whole_minutes: '333060', subminute_numerator: '0', subminute_denominator: '1' },
    position: { location_ref: 'trace_ld_v1_loc_wreck_shore', g5_anchor_id: 'anchor' },
    items: [{ item_id: 'tool', template_id: 'unseen-tool', quantity: 1,
      state: { display_name: 'Костяное шило', inventory_profile_snapshot: {
        mass_grams: 30, carry_form: 'compact', external_hand_cost: 1,
        packing_slot_cost: 1, packing_bundle_size: 1 } },
      placement: { holder_character_id: 'player', physical_position: 'hands' } }],
    containers: [], container_placements: [] };
}
const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Берег у воды.',
  visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
  known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
function project(state, screen = { visible_context: visible }) {
  return projectLowerDvinaTraceScreenPanels({ payload: state, screen, presentation });
}
test('screen rebuilds character, carried inventory and calendar without changing visible evidence', () => {
  const state = payload();
  const screen = project(state);
  assert.equal(screen.panels.character.data.energy, 73);
  assert.equal(screen.panels.character.data.name, 'Гость');
  assert.deepEqual(screen.panels.inventory.data.items.map(x => x.label), ['Костяное шило']);
  assert.equal(screen.panels.inventory.data.summary.total_mass_grams, 30);
  assert.equal(screen.panels.inventory.data.summary.hands_used, 1);
  assert.ok(screen.panels.route.visible);
  assert.ok(screen.presentation_context.date_label);
  assert.match(screen.presentation_context.time_label, /^\d{2}:\d{2}$/);
  assert.deepEqual(screen.visible_context, visible);
  assert.deepEqual(JSON.parse(JSON.stringify(screen)), screen);
  state.body_state.energy = 60;
  state.clock.whole_minutes = String(Number(state.clock.whole_minutes) + 1440);
  state.items[0].placement = { location_ref: state.position.location_ref };
  const next = project(state, screen);
  assert.equal(next.panels.character.data.energy, 60);
  assert.deepEqual(next.panels.inventory.data.items, []);
  assert.equal(next.panels.inventory.data.summary.total_mass_grams, 0);
  assert.notEqual(next.presentation_context.date_label, screen.presentation_context.date_label);
  assert.deepEqual(next.visible_context, visible);
  assert.deepEqual(project(JSON.parse(JSON.stringify(state)), screen), next);
});
test('catalog labels resolve exact template and never expose uncarried or hidden items', () => {
  const state = payload();
  delete state.items[0].state.display_name;
  state.items[0].template_id = Object.entries(presentation.itemLabels).find(([, title]) => title === 'хозяйственный нож')[0];
  const hidden = structuredClone(state.items[0]);
  hidden.item_id = 'hidden'; hidden.state.display_name = 'Скрытый предмет';
  hidden.visibility_state = 'hidden'; hidden.placement = { location_ref: 'elsewhere' };
  state.items.push(hidden);
  assert.deepEqual(project(state).panels.inventory.data.items.map(x => x.label), ['хозяйственный нож']);
});
