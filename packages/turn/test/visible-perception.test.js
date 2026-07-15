import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlayerSensoryDetails } from '../src/stages/visible-projection.js';

test('visible sensory projection exposes only knowledge earned by perception level', () => {
  const details = buildPlayerSensoryDetails({ status: 'evaluated', cycle: { results: [
    { observer_kind: 'player', perceived: true, event_id: 'a', modality: 'sound', perception_level: 'detected', direction_resolution: 'none', identified_semantic_class_id: 'secret-class', identified_source_id: 'secret-source' },
    { observer_kind: 'player', perceived: true, event_id: 'b', modality: 'visual', perception_level: 'identified', direction_resolution: 'direction', identified_semantic_class_id: 'cart', identified_source_id: 'cart-1' },
    { observer_kind: 'npc', perceived: true, event_id: 'c', modality: 'sound', perception_level: 'identified', direction_resolution: 'direction', identified_semantic_class_id: 'player', identified_source_id: 'player-1' }
  ] } });
  assert.deepEqual(details, [
    { event_id: 'a', modality: 'sound', perception_level: 'detected', direction_resolution: 'none' },
    { event_id: 'b', modality: 'visual', perception_level: 'identified', direction_resolution: 'direction', semantic_class_id: 'cart', source_id: 'cart-1' }
  ]);
});
