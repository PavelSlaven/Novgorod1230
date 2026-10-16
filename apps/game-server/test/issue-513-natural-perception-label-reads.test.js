import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { approvedNaturalStableCover } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { createTargetAuthoredStartCatalog } from '../src/internal/target-authored-start-catalog.js';

const labelSources = [
  new URL('../../../data/world-catalogs/novgorod/m2c-place-labels/candidate.json', import.meta.url),
  new URL('../../../data/world-catalogs/novgorod/m2c-place-labels/approval-attestation.json', import.meta.url),
  new URL('../../../data/world-catalogs/novgorod/m2c-natural/candidate.json', import.meta.url),
  new URL('../../../data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json', import.meta.url),
  new URL('../../../data/world-catalogs/novgorod/m2c-natural/nature-successor-data-approval.json', import.meta.url),
];

const pathOf = (value) => value instanceof URL ? fileURLToPath(value)
  : Buffer.isBuffer(value) ? value.toString() : value;

const sourceNames = ['candidate', 'approval', 'natural', 'successor', 'successorApproval'];
const sourcePaths = new Map(sourceNames.map((name, index) => [fileURLToPath(labelSources[index]), name]));
const sourceBytes = Object.fromEntries(sourceNames.map((name, index) =>
  [name, fs.readFileSync(labelSources[index])]));
let isolatedLoaderSequence = 0;

async function isolatedLoader(t) {
  const realRead = fs.readFileSync;
  const values = Object.fromEntries(sourceNames.map((name) => [name, Buffer.from(sourceBytes[name])]));
  const errors = new Map();
  const warnings = [];
  t.mock.method(fs, 'readFileSync', function (path, options) {
    const name = sourcePaths.get(pathOf(path));
    if (!name) return realRead.call(this, path, options);
    if (errors.has(name)) throw errors.get(name);
    const value = values[name];
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? value.toString(encoding) : Buffer.from(value);
  });
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const sequence = ++isolatedLoaderSequence;
  const { loadApprovedPlaceLabels } = await import(
    `../../../data/world-catalogs/novgorod/m2c-place-labels/approved-labels.mjs?issue-513-${sequence}`);
  return {
    load: loadApprovedPlaceLabels,
    warnings,
    replace(name, bytes) { values[name] = Buffer.from(bytes); errors.delete(name); },
    reject(name, code) { errors.set(name, Object.assign(new Error(`Fixture ${code}`), { code })); },
  };
}

test('place-label sources are shared across perception providers and authored-start caller in one process', async (t) => {
  const realRead = fs.readFileSync;
  const labelPaths = new Set(labelSources.map(fileURLToPath));
  const reads = new Map([...labelPaths].map((path) => [path, 0]));
  t.mock.method(fs, 'readFileSync', function (path, options) {
    const resolved = pathOf(path);
    if (labelPaths.has(resolved)) reads.set(resolved, reads.get(resolved) + 1);
    return realRead.call(this, path, options);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });

  const fixture = await approvedNaturalPerceptionFixture();
  const { input, sceneClosure } = fixture;
  const currentSourceState = structuredClone(fixture.currentSourceState);
  const expectedStableCover = approvedNaturalStableCover(fixture.naturalProfile.payload);
  for (const row of currentSourceState.source_observations) row.stable_cover = expectedStableCover;
  const g4Id = input.currentFacts.scene.g4_ref.id;
  const sceneTemplate = sceneClosure.header;
  const snapshot = {
    world_revision_id: input.pin.compatible_world_revision_id,
    world_catalog_digest: input.pin.compatible_world_catalog_digest,
    location: { party_id: 'party:1', owner_id: 'player:1', scene_position_id: 'position:inside' },
    site: { id: 'site', parent_g4_id: g4Id, origin: 'authored' },
    baseline: { id: 'baseline', scene_template_ref: {
      entity_id: sceneTemplate.id, authoring_version: sceneTemplate.version,
      canonical_digest: sceneTemplate.canonical_digest } },
    endpoint_bindings: input.currentFacts.source_bindings,
    positions: input.currentFacts.scene.positions,
    g6: input.currentFacts.scene.g6,
    acoustic_profiles: input.currentFacts.scene.acoustic_profiles,
    visibility_links: [], acoustic_edges: [], portals: [],
  };
  const transaction = { async query() { return { rows: [snapshot] }; } };
  const pool = { async connect() { return { ...transaction, release() {} }; } };
  const scene = {
    world_revision_id: snapshot.world_revision_id,
    location: { party_id: 'party:1', owner_id: 'player:1', scene_position_id: 'position:inside' },
    site: { id: 'site', parent_g4_id: g4Id, origin: 'authored' },
    baseline: { id: 'baseline' },
    positions: [{ id: 'position:inside', g6_instance_id: 'g6:inside' }],
    g6: [{ id: 'g6:inside', intra_g6_visibility_mode: 'clear' }],
    visibility_links: [], placements: [], movement_edges: [],
    modifier_set: { complete: true, rows: [] },
  };
  const worldBaseReader = { async readPinnedSceneTemplateClosure() {
    return { ok: true, value: sceneClosure };
  } };
  const makeProvider = () => createSpatialV3CurrentVisibilityProvider({
    pool, verifiedCatalog: input.verifiedCatalog, pin: input.pin, worldBaseReader,
    readCurrentSourceState: async () => currentSourceState, readScene: async () => scene,
    // Deliberately use the provider's real default natural reader.
    readTargetConditions: async () => ({ stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear' }),
  });
  const provider = makeProvider();
  const secondProvider = makeProvider();

  // The DB boundary is a fixed reader fixture. This test claims only label file I/O and projection reuse.
  const exitSource = JSON.parse(realRead(new URL(
    '../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url), 'utf8'));
  const exitLabel = exitSource.labels.find((row) => row.g4_ref.id === g4Id);
  assert.ok(exitLabel, 'fixture must contain an exit at the approved G4');
  const exit = { id: exitLabel.directional_exit_ref.id,
    version: exitLabel.directional_exit_ref.version,
    canonical_digest: exitLabel.directional_exit_ref.canonical_digest,
    direction_context_id: exitLabel.direction_context_ref.id };
  const context = { partyId: 'party:1', actorId: 'player:1', position: { id: 'position:inside' },
    site: scene.site, directional_exits: [exit] };
  const first = await provider.readExitDisclosure(context);
  const second = await provider.readExitDisclosure(context);
  const third = await secondProvider.readExitDisclosure(context);

  const candidate = JSON.parse(realRead(labelSources[0], 'utf8'));
  const start = candidate.labels.find((row) => row.canonical_g5_ref);
  assert.ok(start, 'fixture must contain an approved canonical place label');
  const profile = { scenario_id: 'issue-513-start', manifest_digest: 'b'.repeat(64),
    public_metadata: { title: 'Issue 513 fixture' }, actor_catalog: {},
    canonical_start: { policy_profile_pins: [], start: {
      world_pin: { world_revision_id: 'world', world_catalog_digest: 'c'.repeat(64) },
      initial_placement: { canonical_g5_ref: start.canonical_g5_ref },
      initial_environment_inputs: { calendar_date: { year: 1230, month: 1, day: 1 } },
    } } };
  const authoredStart = createTargetAuthoredStartCatalog({ runtime: { profile }, release: {
    scenario_binding_id: profile.scenario_id, world_revision_id: 'world',
    world_catalog_digest: 'c'.repeat(64),
    scenario_profile_exact_pins: { phase_1a_manifest_digest: profile.manifest_digest,
      scenario_definition_revision: 1 },
  } });

  assert.equal(first.length, 1, 'real provider must project the approved visible exit');
  assert.deepEqual(second, first, 'repeated perception must keep the same projection');
  assert.deepEqual(third, first, 'a second provider must project the same approved visible exit');
  assert.equal(authoredStart.listPublic()[0].title, start.display_label,
    'the real authored-start caller must resolve the same approved place label');
  assert.deepEqual([...reads.values()], Array(labelSources.length).fill(1),
    'both real caller paths and separate providers must share one process snapshot of the five sources');
});

test('invalid approval stays rejected after a warm result and recovers when restored', async (t) => {
  const fixture = await isolatedLoader(t);
  const first = fixture.load();
  assert.ok(first instanceof Map, 'baseline approval fixture must load');
  const approval = JSON.parse(sourceBytes.approval);
  approval.decision = 'REJECT';
  fixture.replace('approval', JSON.stringify(approval));
  assert.equal(fixture.load(), null, 'a wrong approval decision must reject the changed source');
  assert.equal(fixture.load(), null, 'a rejected approval must not become a cached success');
  fixture.replace('approval', sourceBytes.approval);
  assert.ok(fixture.load() instanceof Map, 'restoring the approved bytes must recover');
});

for (const failure of ['ENOENT', 'SyntaxError']) {
  test(`required approval ${failure} stays null after a warm result and recovers`, async (t) => {
    const fixture = await isolatedLoader(t);
    assert.ok(fixture.load() instanceof Map, 'baseline approval fixture must load');
    if (failure === 'ENOENT') fixture.reject('approval', 'ENOENT');
    else fixture.replace('approval', '{ malformed approval');
    assert.equal(fixture.load(), null, `${failure} in required approval must return null`);
    assert.equal(fixture.load(), null, `${failure} must not become a cached success`);
    fixture.replace('approval', sourceBytes.approval);
    assert.ok(fixture.load() instanceof Map, 'restoring the approved bytes must recover');
  });
}

test('successor lineage diagnostic is logged once across repeated direct loader calls', async (t) => {
  const fixture = await isolatedLoader(t);
  fixture.replace('successorApproval', '{}');
  const first = fixture.load();
  const second = fixture.load();
  assert.ok(first instanceof Map);
  assert.ok(second instanceof Map);
  assert.deepEqual(first.diagnostics, [{ code: 'natural_successor_lineage_unverified' }]);
  assert.deepEqual(second.diagnostics, first.diagnostics);
  assert.equal(fixture.warnings.filter((message) =>
    message.includes('PLACE_LABEL_SUCCESSOR_LINEAGE_UNVERIFIED')).length, 1,
  'the successor warning must be emitted once per process');
});
