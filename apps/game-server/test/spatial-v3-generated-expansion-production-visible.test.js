import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';
import { projectSpatialV3GeneratedExpansionVisiblePackage } from
  '../src/composition/production-spatial-v3.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';

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

test('ordered approach visibility uses the committed origin and rejects a different actor position', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const origin = input.currentFacts.observer.position_id;
  const departure = 'position:departure';
  const request = { party_id: 'party:1', actor_id: 'player:1',
    source_position_id: departure, approach_origin_position_id: origin,
    ordered_local_edge_path: [{ edge_id: 'edge:1', from_position_id: origin, to_position_id: departure }] };
  const project = async (committedPositionId) => {
    const transaction = { async query() { return { rows: [] }; } };
    const facts = structuredClone(input.currentFacts);
    facts.observer.position_id = committedPositionId;
    const scene = { world_revision_id: input.pin.compatible_world_revision_id,
      location: { party_id: request.party_id, owner_id: request.actor_id,
        scene_position_id: committedPositionId },
      site: { id: 'site:1', origin: 'generated', parent_g4_id: facts.scene.g4_ref.id },
      baseline: { id: facts.scene.baseline_id },
      positions: facts.scene.positions.map((row) => ({ id: row.id,
        g6_instance_id: row.g6_instance_id, template_slot_key: row.template_slot_key })),
      g6: facts.scene.g6.map((row) => ({ id: row.id,
        intra_g6_visibility_mode: 'default_clear' })),
      visibility_links: [], movement_edges: [], placements: [], modifier_set: { complete: true, rows: [] } };
    const natural = { ...facts, scene: { ...facts.scene, portals: {} },
      ambient_visibility: { g6_instance_id: 'g6:inside', lighting: 'clear', weather: 'clear' } };
    const provider = createSpatialV3CurrentVisibilityProvider({
      pool: { async connect() { return transaction; } }, verifiedCatalog: input.verifiedCatalog,
      pin: input.pin, readCurrentEnvironment: async () => ({}),
      readTargetConditions: async () => ({ stable_cover: 'clear',
        dynamic_occlusion: 'clear', concealment: 'clear' }),
      readScene: async () => scene, readNatural: async () => natural });
    let received;
    const result = await projectSpatialV3GeneratedExpansionVisiblePackage({
      transaction, request, closure: { directional_exits: [] },
      envelopeInput: { party_id: request.party_id, turn_id: 'expansion:1',
        committed_state_version: '2', change_set_id: 'expansion:1',
        package_id: 'visible:expansion:1', idempotency_record_id: 'idem:expansion:1',
        dependency_pins: { pins: [], canonical_digest: 'a'.repeat(64) } },
      readCurrentSources: async (args) => {
        received = { positionId: args.positionId,
          journeyPositionId: args.state.journey_location.scene_position_id };
        return provider.readCurrentSources(args);
      } });
    return { result, received };
  };

  const positive = await project(origin);
  assert.equal(positive.result.ok, true, JSON.stringify(positive.result.errors));
  assert.deepEqual(positive.received, { positionId: origin, journeyPositionId: origin });
  await assert.rejects(project(departure),
    (error) => error.details?.reason === 'current_position_required');
});
