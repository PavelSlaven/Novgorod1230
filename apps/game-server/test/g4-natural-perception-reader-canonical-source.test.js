import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalStableCover, readCurrentNaturalPerceptionFacts } from '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';

const gap = { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' };

function endpointBinding(overrides = {}) {
  return { id: 'binding', party_id: 'party:1', status: 'active', g5_site_id: 'site',
    source_slot_key: 'arrival', position_id: 'position:shore', ...overrides };
}

function currentSceneSnapshot(fixture, { origin = 'canonical', endpointBindings = [] } = {}) {
  const facts = fixture.input.currentFacts;
  const scene = facts.scene;
  const canonicalRef = fixture.initialRule?.rule.canonical_g5_ref;
  return {
    world_revision_id: fixture.input.pin.compatible_world_revision_id,
    world_catalog_digest: fixture.input.pin.compatible_world_catalog_digest,
    location: { party_id: 'party:1', owner_id: 'player:1',
      scene_position_id: facts.observer.position_id },
    site: { id: scene.site_id, origin, parent_g4_id: scene.g4_ref.id,
      canonical_g5_ref: origin === 'canonical' ? {
        entity_id: canonicalRef.id, authoring_version: String(canonicalRef.version)
      } : null },
    baseline: { id: scene.baseline_id, scene_template_ref: {
      entity_id: scene.scene_template_ref.id,
      authoring_version: String(scene.scene_template_ref.version)
    } },
    endpoint_bindings: endpointBindings,
    positions: scene.positions,
    g6: scene.g6,
    acoustic_profiles: scene.acoustic_profiles,
    visibility_links: [],
    acoustic_edges: [],
    portals: []
  };
}

async function readFacts(fixture, { origin = 'canonical', endpointBindings = [],
  canonicalReader = true, canonicalResult = null } = {}) {
  const scene = fixture.input.currentFacts.scene;
  const snapshot = currentSceneSnapshot(fixture, { origin, endpointBindings });
  const worldBaseReader = {
    async readPinnedSceneTemplateClosure() {
      return { ok: true, value: fixture.sceneClosure };
    }
  };
  if (canonicalReader) {
    worldBaseReader.readPinnedCanonicalG5SceneBinding = async (ref) => canonicalResult ?? ({
      ok: true,
      value: { id: ref.id, version: ref.version, world_revision_id: ref.world_revision_id,
        parent_id: scene.g4_ref.id, parent_version: scene.g4_ref.version,
        scene_template_id: ref.scene_template_ref.id,
        scene_template_version: ref.scene_template_ref.version }
    });
  }
  const currentSourceState = { ...fixture.currentSourceState, canonical_initial_state: undefined };
  for (const row of currentSourceState.source_observations) {
    row.stable_cover = approvedNaturalStableCover(fixture.naturalProfile.payload);
  }
  return readCurrentNaturalPerceptionFacts({
    transaction: { async query() { return { rows: [structuredClone(snapshot)] }; } },
    partyId: 'party:1', actorId: 'player:1',
    verifiedCatalog: fixture.input.verifiedCatalog, pin: fixture.input.pin,
    worldBaseReader, readCurrentSourceState: async () => structuredClone(currentSourceState)
  });
}

function expectCanonicalCurrentProof(currentFacts) {
  const proof = currentFacts.canonical_source_binding;
  assert.ok(proof, 'expected canonical current-scene proof');
  assert.equal(proof.schema, 'rus.verified_canonical_scene_natural_source.v1');
  assert.equal(proof.verified, true);
  assert.equal(proof.party_id, 'party:1');
  assert.equal(proof.actor_id, 'player:1');
  assert.equal(proof.position_id, 'position:shore');
  assert.equal(proof.g5_site_id, 'site');
  assert.equal(proof.baseline_id, 'baseline');
  assert.equal(proof.source_slot_key, 'arrival');
}

test('canonical no-initial reader supplies exact current-scene proof with or without endpoint', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  for (const endpointBindings of [[], [endpointBinding()]]) {
    const currentFacts = await readFacts(fixture, { endpointBindings });
    expectCanonicalCurrentProof(currentFacts);
  }
});

test('canonical matching endpoint with missing pinned-authoring port fails closed', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  await assert.rejects(readFacts(fixture, {
    endpointBindings: [endpointBinding()], canonicalReader: false
  }), (error) => error.code === gap.code
    && error.details?.reason === 'canonical_scene_source_binding_required');
});

test('canonical matching endpoint still requires exact pinned authoring', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  const scene = fixture.input.currentFacts.scene;
  const ref = fixture.initialRule.rule.canonical_g5_ref;
  const badResults = [
    { ok: false },
    { ok: true, value: { id: ref.id, version: ref.version,
      world_revision_id: fixture.input.pin.compatible_world_revision_id,
      parent_id: 'wrong-parent', parent_version: scene.g4_ref.version,
      scene_template_id: scene.scene_template_ref.id,
      scene_template_version: scene.scene_template_ref.version } }
  ];
  for (const canonicalResult of badResults) {
    await assert.rejects(readFacts(fixture, {
      endpointBindings: [endpointBinding()], canonicalResult
    }), gap);
  }
});

test('canonical proof does not bypass matching endpoint party, site or position checks', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  for (const binding of [
    endpointBinding({ position_id: 'position:inside' }),
    endpointBinding({ party_id: 'party:other' }),
    endpointBinding({ g5_site_id: 'site:other' })
  ]) {
    await assert.rejects(readFacts(fixture, { endpointBindings: [binding] }), gap);
  }
});

test('generated source still requires its exact committed endpoint binding', async () => {
  const fixture = await approvedNaturalPerceptionFixture();
  for (const endpointBindings of [
    [],
    [endpointBinding({ source_slot_key: 'other' })],
    [endpointBinding({ position_id: 'position:inside' })]
  ]) {
    await assert.rejects(readFacts(fixture, { origin: 'generated', endpointBindings }), gap);
  }
});

test('canonical matching endpoint rejects a different authoring parent version', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  const scene = fixture.input.currentFacts.scene;
  const ref = fixture.initialRule.rule.canonical_g5_ref;
  await assert.rejects(readFacts(fixture, {
    endpointBindings: [endpointBinding()],
    canonicalResult: { ok: true, value: { id: ref.id, version: ref.version,
      world_revision_id: fixture.input.pin.compatible_world_revision_id,
      parent_id: scene.g4_ref.id, parent_version: scene.g4_ref.version + 1,
      scene_template_id: scene.scene_template_ref.id,
      scene_template_version: scene.scene_template_ref.version } }
  }), gap);
});
