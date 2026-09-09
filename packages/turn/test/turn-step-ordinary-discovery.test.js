import assert from 'node:assert/strict';
import test from 'node:test';
import { isOrdinaryDiscoveryInScope } from '../src/turn-step-admission.js';

test('ordinary discovery admits an unseen nested player-visible object', () => {
  const target = 'visible-cloak-unseen';
  assert.equal(isOrdinaryDiscoveryInScope({
    operation: { op: 'request_discovery', discovery_kind: 'inspect',
      target_refs: [target], query: 'осмотреть видимую ткань' },
    playerSafeState: {
      ordinary_resolution: { discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false },
      current_visible_context: { visible_objects: [{ entity_ref: {
        entity_kind: 'item', entity_id: target
      } }] }
    }
  }), true);
});
