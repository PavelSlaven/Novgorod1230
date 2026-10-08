import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';

const exitRows = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g4_directional_exits.json',
  import.meta.url)));
const physicalBoundary = { id: 'physical-boundary-exit', version: 1,
  direction_context_id: 'physical-boundary-direction', exit_kind: 'physical_boundary',
  exit_canonical_g5_id: null, canonical_digest: 'f'.repeat(64) };

async function fixture({ canonicalG5 = null, sourceCanonicalG5 = null,
  origin = 'canonical', rows = exitRows } = {}) {
  const { input } = await approvedNaturalPerceptionFixture();
  const g4 = input.currentFacts.scene.g4_ref.id;
  const directionalExits = rows.filter((row) => row.g4_id === g4);
  const siteAt = (positionId) => {
    const currentG5 = positionId === 'position:source' ? sourceCanonicalG5 : canonicalG5;
    return { id: positionId === 'position:source' ? 'site:source' : 'site:destination',
      origin, parent_g4_id: g4, ...(currentG5 == null ? {} : {
        canonical_g5_ref: { entity_id: currentG5, authoring_version: 1 } }) };
  };
  const worldBaseReader = {
    async readG4ExpansionBinding() { return { ok: true, value: { g4: input.currentFacts.scene.g4_ref } }; },
    async readApprovedG4DirectionalExits() { return { ok: true, value: directionalExits }; },
    async readApprovedCanonicalG5Connections() { return { ok: true, value: [] }; }
  };
  const pool = { async connect() { return { async query() {}, release() {} }; } };
  const provider = createSpatialV3CurrentVisibilityProvider({ pool,
    verifiedCatalog: input.verifiedCatalog, pin: input.pin, worldBaseReader,
    readScene: async ({ observedPositionId }) => ({
      world_revision_id: input.pin.compatible_world_revision_id,
      location: { party_id: 'party:1', owner_id: 'player:1',
        scene_position_id: observedPositionId },
      site: siteAt(observedPositionId), baseline: { id: 'baseline' },
      positions: input.currentFacts.scene.positions.map((row) => ({
        id: row.id, g6_instance_id: row.g6_instance_id })),
      g6: input.currentFacts.scene.g6.map((row) => ({ id: row.id,
        intra_g6_visibility_mode: 'open' })), visibility_links: [], movement_edges: [],
      placements: [], modifier_set: { complete: true, rows: [] }
    }),
    readNatural: async ({ observedPositionId }) => {
      const currentSite = siteAt(observedPositionId);
      return { ...structuredClone(input.currentFacts),
      scene: { ...structuredClone(input.currentFacts.scene), site_id: currentSite.id, portals: {} },
      source_bindings: input.currentFacts.source_bindings.map((row) => ({ ...row,
        g5_site_id: currentSite.id })),
      observer: { ...input.currentFacts.observer, position_id: observedPositionId },
      ambient_visibility: { g6_instance_id: 'g6:inside', lighting: 'clear',
        weather: 'clear', stable_cover: 'clear' }
      };
    },
    readTargetConditions: async () => ({ stable_cover: 'clear',
      dynamic_occlusion: 'clear', concealment: 'clear' }),
    readCurrentSourceState: async () => input.currentSourceState,
    readCurrentEnvironment: async () => input.currentFacts.current_environment
  });
  return { provider, directionalExits };
}

async function readAt(provider, { sourcePositionId = 'position:source',
  observedPositionId = 'position:shore', directionalExits } = {}) {
  const transaction = { async query() {} };
  const state = { party_id: 'party:1', actor_id: 'player:1',
    journey_location: { scene_position_id: observedPositionId } };
  return provider.readCurrentSources({ transaction, partyId: 'party:1', actorId: 'player:1',
    positionId: observedPositionId, observedPositionId, siteId: 'site:destination', state,
    directionalExits, sourcePositionId });
}

const ids = (sources) => sources.directionalExits.map((row) => row.directional_exit_id);

test('destination disclosure keeps only exits for the actually observed canonical G5', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const sameG4 = exitRows.filter((row) => row.g4_id === input.currentFacts.scene.g4_ref.id);
  const sourceG5 = sameG4[0].exit_canonical_g5_id;
  const ownG5 = sameG4.find((row) => row.exit_canonical_g5_id !== sourceG5).exit_canonical_g5_id;
  const own = sameG4.find((row) => row.exit_canonical_g5_id === ownG5);
  const foreign = sameG4.find((row) => row.exit_canonical_g5_id === sourceG5);
  assert.ok(own);
  assert.ok(foreign);
  const { provider } = await fixture({ canonicalG5: ownG5, sourceCanonicalG5: sourceG5 });
  const supplied = [own, foreign];
  const before = structuredClone(supplied);
  const sources = await readAt(provider, { sourcePositionId: 'position:source',
    observedPositionId: 'position:shore', directionalExits: supplied });
  assert.deepEqual(sources.naturalInput.observer.position_id, 'position:shore',
    'the visibility owner must read the observed destination, not the committed source');
  assert.deepEqual(ids(sources), [own.id]);
  assert.deepEqual(supplied, before, 'provider must not mutate G4-wide input');
});

test('destination disclosure handles empty, generated, and boundary-only exit sets fail-closed', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const sameG4 = exitRows.filter((row) => row.g4_id === input.currentFacts.scene.g4_ref.id);
  const ownG5 = sameG4[0].exit_canonical_g5_id;
  const foreign = sameG4.find((row) => row.exit_canonical_g5_id !== ownG5);
  assert.ok(foreign);
  const empty = await fixture({ canonicalG5: ownG5 });
  assert.deepEqual(ids(await readAt(empty.provider, { directionalExits: [] })), []);

  const generated = await fixture({ origin: 'generated', rows: [foreign] });
  assert.deepEqual(ids(await readAt(generated.provider, { directionalExits: [foreign] })), []);

  const boundary = await fixture({ canonicalG5: ownG5, rows: [foreign] });
  const mixedNonApplicable = [foreign, physicalBoundary];
  assert.deepEqual(ids(await readAt(boundary.provider,
    { directionalExits: mixedNonApplicable })), []);
});

test('destination prepare and commit-recheck calls share the same observed-place exit scope', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const sameG4 = exitRows.filter((row) => row.g4_id === input.currentFacts.scene.g4_ref.id);
  const sourceG5 = sameG4[0].exit_canonical_g5_id;
  const ownG5 = sameG4.find((row) => row.exit_canonical_g5_id !== sourceG5).exit_canonical_g5_id;
  const own = sameG4.find((row) => row.exit_canonical_g5_id === ownG5);
  const foreign = sameG4.find((row) => row.exit_canonical_g5_id === sourceG5);
  const { provider } = await fixture({ canonicalG5: ownG5, sourceCanonicalG5: sourceG5 });
  const directionalExits = [own, foreign];
  const preparation = await readAt(provider, { directionalExits });
  const commitRecheck = await readAt(provider, { directionalExits });
  assert.deepEqual(ids(preparation), [own.id]);
  assert.deepEqual(ids(commitRecheck), [own.id]);
  assert.deepEqual(ids(commitRecheck), ids(preparation));
});
