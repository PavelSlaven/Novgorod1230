import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { movementVisibleObjects } from '../src/runtime/spatial-v3-movement-objects.js';

const edge = (id, label) => ({ edge_id: id, display_label: label });
const context = (objects) => ({ version: 1, schema: 'visible_context_package',
  visible_scene: 'Двор.', visible_changes: [], sensory_details: [], visible_npc: [],
  visible_objects: objects, known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] });

test('a local move shows the passages of the place arrived at, not of the one left', async () => {
  const item = { entity_ref: { entity_kind: 'item', entity_id: 'i1' }, display_label: 'штаны', recognition: 'known' };
  const left = context([...movementVisibleObjects({ edges: [edge('e2', 'тропа влево'), edge('e3', 'тропа вправо')] }), item]);
  const arrived = movementVisibleObjects({ edges: [edge('e1', 'тропа назад')],
    connections: [{ connection_binding_id: 'c1', display_label: 'ручей' }] });
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => structuredClone(left) } });
  const visible = await projector.project({
    consequence: { status: 'resolved', phase3_kind: 'movement',
      position_transition: { owner: '@rus/movement-routes' },
      visible_seed: { destination_movement_objects: arrived,
        movement_display_label: 'Проход 1' } },
    retrieved_state: { actor_id: 'player', party_state: { state_version: 9 }, position: {},
      current_visible_context: left, route_history: [], npcs: [], items: [] },
    body_update: { state_after: {} },
    mode_resolution: { decision_trace: { remaining_intent: null, step_traces: [] } } });
  assert.deepEqual(visible.visible_objects.map((row) => row.display_label), ['штаны', 'тропа назад', 'ручей']);
  assert.deepEqual(visible.visible_changes, []);
});
