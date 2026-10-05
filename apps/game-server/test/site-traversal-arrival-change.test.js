import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

// Current-position facts recorded by lead-r3b h7's spatial owner.
const destinationFacts = [
  'Поверхность покрыта илистым и глинистым грунтом.',
  'Местность низкая и ровная.',
  'Виден речной проток.',
  'Видна кромка берега.',
  'Видны отдельные деревья.',
  'Виден нижний ярус растительности.',
  'Землю покрывают трава, осоки и кустарник.',
  'У воды видна растительность.',
  'На поверхности видны остатки трав и осок, обломки кустарниковых ветвей.'
];
const destination = (overrides = {}) => ({ schema: 'visible_context_package', version: 1,
  visible_scene: 'Окрестности.', visible_changes: [], sensory_details: destinationFacts, visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [], ...overrides });
const traversal = (context) => ({ position_transition: { owner: '@rus/turn/spatial-v3-site-connection-traversal' },
  visible_seed: { destination_visible_context: context } });

test('site arrival reports a grounded change with destination perception', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('a site traversal is projected from its destination') } });
  const result = await projector.project({ consequence: traversal(destination()) });
  assert.deepEqual(result.visible_changes,
    ['Вы пришли туда, где поверхность покрыта илистым и глинистым грунтом.']);
  assert.equal(result.visible_scene, 'Окрестности.');
  assert.deepEqual(result.sensory_details, destinationFacts);
  const changed = await projector.project({ consequence: traversal(destination({
    sensory_details: ['Виден речной проток.'] })) });
  assert.deepEqual(changed.sensory_details, ['Виден речной проток.']);
  assert.deepEqual(changed.visible_changes,
    ['Вы пришли туда, где виден речной проток.']);
  await assert.rejects(projector.project({ consequence: traversal(destination({
    sensory_details: []
  })) }), { code: 'TRACE_SITE_TRAVERSAL_DESTINATION_PERCEPTION_MISSING' });
});
