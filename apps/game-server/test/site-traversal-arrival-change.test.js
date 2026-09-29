import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

const destination = (overrides = {}) => ({ schema: 'visible_context_package', version: 1,
  visible_scene: 'Берег у воды', visible_changes: [], sensory_details: ['Тихо.'], visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [], ...overrides });
const traversal = (context) => ({ position_transition: { owner: '@rus/turn/spatial-v3-site-connection-traversal' },
  visible_seed: { destination_visible_context: context } });

test('arriving over a site connection is a visible change for the narrator, once, and only that', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('a site traversal is projected from its destination') } });
  const result = await projector.project({ consequence: traversal(destination()) });
  assert.deepEqual(result.visible_changes, ['Берег у воды']);
  assert.equal(result.visible_scene, 'Берег у воды');
  assert.deepEqual(result.sensory_details, ['Тихо.']);
  const already = await projector.project({ consequence: traversal(destination({ visible_changes: ['Берег у воды'] })) });
  assert.deepEqual(already.visible_changes, ['Берег у воды']);
  const extra = await projector.project({ consequence: traversal(destination({ visible_changes: [{ change_kind: 'environment_state' }] })) });
  assert.equal(extra.visible_changes.at(-1), 'Берег у воды');
});
