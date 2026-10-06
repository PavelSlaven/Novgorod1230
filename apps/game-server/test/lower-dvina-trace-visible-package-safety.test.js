import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { phase2VisibleContextFromPayload } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { projectVisibleContextForPlayerPackage } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { projectTurnStepModelRequest } from
  '../src/runtime/lower-dvina-trace-turn-step-model-projection.js';
import { request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('player package omits only typed item gaps and leaves model request unchanged', () => {
  const named = { entity_ref: { entity_kind: 'item', entity_id: 'named' },
    display_label: 'сосновое весло' };
  const context = { visible_scene: 'На берегу.', visible_changes: [],
    sensory_details: [], visible_npc: [], visible_objects: [
      { entity_ref: { entity_kind: 'item', entity_id: 'hidden' },
        label_gap: { code: 'player_safe_item_label_required' } },
      named,
      { entity_ref: { entity_kind: 'place', entity_id: 'place' },
        label_gap: { code: 'player_safe_item_label_required' } }
    ], known_context: [], uncertainties: [] };
  const originalContext = structuredClone(context);
  const modelRequest = request({ player_safe_state: {
    items: [{ item_id: 'hidden', name: 'private gap name' },
      { item_id: 'named', name: 'сосновое весло' }],
    current_visible_context: { visible_objects: context.visible_objects }
  } });
  const modelSnapshot = () => JSON.stringify(
    projectTurnStepModelRequest(modelRequest).request);
  const beforeModelSnapshot = modelSnapshot();
  const omitted = [];
  const { visible_context: playerContext, omitted_label_gap_count: count } =
    projectVisibleContextForPlayerPackage(context, {
      onLabelGapsOmitted: (number) => omitted.push(number)
    });
  const afterModelSnapshot = modelSnapshot();

  assert.equal(count, 1);
  assert.deepEqual(omitted, [1]);
  assert.deepEqual(context, originalContext);
  assert.deepEqual(playerContext.visible_objects, [named,
    context.visible_objects[2]]);
  const screenContext = phase2VisibleContextFromPayload({
    schema: 'temporal_visible_package.v1',
    perceived_scene: playerContext.visible_scene,
    perceived_changes: playerContext.visible_changes,
    sensory_details: playerContext.sensory_details,
    visible_npcs: playerContext.visible_npc,
    visible_objects: playerContext.visible_objects,
    known_context: playerContext.known_context,
    uncertainties: playerContext.uncertainties
  });
  assert.deepEqual(screenContext.visible_objects, playerContext.visible_objects);
  assert.equal(beforeModelSnapshot, afterModelSnapshot);
  assert.equal(createHash('sha256').update(beforeModelSnapshot).digest('hex'),
    createHash('sha256').update(afterModelSnapshot).digest('hex'));
});

test('player package leaves absent visible_objects absent', () => {
  const result = projectVisibleContextForPlayerPackage({ visible_scene: 'На берегу.' });

  assert.equal(Object.hasOwn(result.visible_context, 'visible_objects'), false);
  assert.equal(result.omitted_label_gap_count, 0);
});
