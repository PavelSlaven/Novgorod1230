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

test('ordinary discovery rejects multi-target requests even when all items are visible', () => {
  const playerSafeState = {
    ordinary_resolution: { discovery_available: true,
      container_resolution_available: false, scene_seed_available: false },
    current_visible_context: { visible_objects: [
      { entity_ref: { entity_kind: 'item', entity_id: 'visible-cloak' } },
      { entity_ref: { entity_kind: 'item', entity_id: 'visible-shirt' } }
    ] }
  };
  const operation = { op: 'request_discovery', discovery_kind: 'inspect',
    target_refs: ['visible-cloak', 'visible-shirt'],
    query: 'осмотреть одежду' };

  assert.equal(isOrdinaryDiscoveryInScope({ operation, playerSafeState }), false);
  assert.equal(isOrdinaryDiscoveryInScope({ operation: { ...operation,
    target_refs: ['visible-cloak', 'hidden-shirt'] }, playerSafeState }), false);
  assert.equal(isOrdinaryDiscoveryInScope({ operation: { ...operation,
    discovery_kind: 'search' }, playerSafeState }), false);
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
  const result = await resolve({ operation: { query: 'осмотреть чужой мешок' },
    working_projection: { revision: 7 } });

  assert.deepEqual(result, {
    working_projection: { revision: 7 },
    write_fragments: [],
    summary: 'ordinary discovery unavailable',
    duration_minutes: 0,
    consequence_fragment: { visible_seed: { ordinary_presence_seed: {
      kind: 'ordinary_presence_seed', resolution: 'no_change',
      query: 'осмотреть чужой мешок'
    } } },
    player_response_boundary: true
  });
});

test('multi-item ordinary inspection returns no-result before context or model',
  async () => {
    const resolve = createOrdinaryMaterializationDiscoveryOwner({
      loadDiscoveryContext: async () => {
        throw new Error('multi-item inspection must not bind one item context');
      },
      ordinaryMaterializationModel: async () => {
        throw new Error('multi-item inspection must not invoke the model');
      },
      verifyStageBCutover: () => {}, inputDigest: () => 'unused',
      buildSeedRequest: () => ({}), buildPresenceRequest: () => ({}),
      sealAtomicWritePlan: () => ({})
    });
    const result = await resolve({
      operation: { target_refs: ['visible-bowl', 'visible-cup'],
        query: 'осмотреть посуду' },
      working_projection: { revision: 9 }
    });

    assert.equal(result.consequence_fragment.visible_seed
      .ordinary_presence_seed.resolution, 'no_change');
    assert.deepEqual(result.write_fragments, []);
    assert.equal(Object.hasOwn(result,
      'ordinary_materialization_atomic_write_plan'), false);
  });
