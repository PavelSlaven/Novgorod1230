import assert from 'node:assert/strict';
import test from 'node:test';
import { isOrdinaryDiscoveryInScope } from '../src/turn-step-admission.js';
import { createOrdinaryMaterializationDiscoveryOwner } from '../src/index.js';

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

test('unresolved ordinary discovery returns one player-safe no-result', async () => {
  const resolve = createOrdinaryMaterializationDiscoveryOwner({
    loadDiscoveryContext: async () => null,
    ordinaryMaterializationModel: async () => {
      throw new Error('model must not run without discovery context');
    },
    verifyStageBCutover: () => {},
    inputDigest: () => 'unused',
    buildSeedRequest: () => ({}),
    buildPresenceRequest: () => ({}),
    sealAtomicWritePlan: () => ({})
  });
  const result = await resolve({ working_projection: { revision: 7 } });

  assert.deepEqual(result, {
    working_projection: { revision: 7 },
    write_fragments: [],
    summary: 'ordinary discovery unavailable',
    duration_minutes: 0,
    consequence_fragment: { visible_seed: { ordinary_presence_seed: {
      kind: 'ordinary_presence_seed', resolution: 'no_change'
    } } },
    player_response_boundary: true
  });
});
