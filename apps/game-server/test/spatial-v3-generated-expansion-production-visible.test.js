import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';
import { projectSpatialV3GeneratedExpansionVisiblePackage } from
  '../src/composition/production-spatial-v3.js';

test('generated topology commit projects the current source actor in its P16 transaction', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const transaction = { query() {} };
  const request = { party_id: 'party:1', actor_id: 'player:1',
    source_position_id: 'position:inside' };
  const exits = [{ id: 'exit:1' }];
  const result = await projectSpatialV3GeneratedExpansionVisiblePackage({ transaction,
    request, closure: { directional_exits: exits },
    envelopeInput: { party_id: request.party_id, turn_id: 'expansion:1',
      committed_state_version: '2', change_set_id: 'expansion:1',
      package_id: 'visible:expansion:1', idempotency_record_id: 'idem:expansion:1',
      dependency_pins: { pins: [], canonical_digest: 'a'.repeat(64) } },
    readCurrentSources: async (args) => {
      assert.equal(args.transaction, transaction);
      assert.equal(args.positionId, request.source_position_id);
      assert.equal(args.state.journey_location.scene_position_id, request.source_position_id);
      assert.equal(args.directionalExits, exits);
      return { naturalInput: prepareG4NaturalScenePerceptionInput(input),
        entityObservations: [], localEdges: [], directionalExits: [] };
    } });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.envelope.visible_payload.perceived_scene, 'Берег');
  assert.equal(result.envelope.presentation_status, 'pending');
  assert.equal(result.envelope.projection_policy_ref.entity_ref.entity_id,
    'spatial_v3_current_visible_context_v1');
});
