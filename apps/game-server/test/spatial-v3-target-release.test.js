import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSpatialV3TargetProductionRelease,
  SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from '../src/composition/production-spatial-v3-release-v17.js';
import { createSpatialV3ProductionRelease } from '../src/composition/production-spatial-v3-release-v16.js';
import { deriveActivatedReleaseFromReadback } from '../src/composition/production-v2-activation-state.js';
import { createSpatialV3ProductionCompositionRoot } from '../src/composition/production-spatial-v3.js';
import { createTargetAuthoredStartCatalog } from '../src/internal/target-authored-start-catalog.js';
import { resolveSpatialV3ProductionBindingsModule } from '../src/runtime/load-spatial-v3-bindings.js';
import { readServerConfig, assertModularStartupConfig } from '../src/config.js';
import { createLowerDvinaTracePublicRuntime } from '../src/runtime/lower-dvina-trace-public-runtime.js';
import { loadTargetAuthoredStartRuntimes } from '../src/infrastructure/postgres/target-authored-start-runtime.js';

test('v17 requires issued exact approvals before querying runtime data', async () => {
  let queries = 0;
  const worldPool = { async query() { queries += 1; return { rows: [] }; } };
  for (const itemApproval of [null, { request: {
    compatible_world_pin_manifest_digest: 'a'.repeat(64)
  } }]) {
    await assert.rejects(createSpatialV3TargetProductionRelease({ worldPool, itemApproval }),
      { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  }
  assert.equal(queries, 0);
});

test('v17 cannot derive active status from an item pin alone; historical v16 stays available', () => {
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.scenario_binding_id, undefined);
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.scenario_profile_exact_pins, undefined);
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.parent_release_exact_pins, undefined);
  assert.throws(() => deriveActivatedReleaseFromReadback(SPATIAL_V3_TARGET_PRODUCTION_RELEASE, {
    activation_event_id: 'item-event',
    compatible_world_revision_id: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.world_revision_id,
    compatible_world_catalog_digest: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.world_catalog_digest,
    runtime_contract_digest: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.runtime_catalog_contract_digest
  }), { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  const historical = createSpatialV3ProductionRelease('a'.repeat(64));
  assert.equal(historical.release_id, 'spatial-v3-production-v16');
  assert.equal(historical.world_revision_id, 'novgorod_spatial_v3_production_v6_candidate_001');
  assert.equal(historical.production_activation, false);
});

test('target selection is explicit and the official root rejects absent operator approvals before database access', async () => {
  assert.equal(resolveSpatialV3ProductionBindingsModule({}, {}), 'builtin:spatial-v3-production-v16');
  const config = readServerConfig({ RUS_SPATIAL_V3_BINDINGS_MODULE: 'builtin:spatial-v3-production-v17',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: 'a'.repeat(64) });
  assert.equal(assertModularStartupConfig(config), config);
  let queries = 0; let closes = 0;
  const pool = { async query() { queries += 1; throw new Error('unexpected query'); } };
  await assert.rejects(createSpatialV3ProductionCompositionRoot({ env: {}, config,
    pools: { worldPool: pool, partyPool: pool, async close() { closes += 1; } } }),
  { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  assert.equal(queries, 0);
  assert.equal(closes, 1);
});

test('target initial runtime binding resolves only against exact approved start pins', () => {
  const naturalPin = { key: 'natural-rule', revision: 1, digest: 'a'.repeat(64) };
  const profile = { scenario_id: 'target-scenario', manifest_digest: 'b'.repeat(64),
    public_metadata: { title: 'Target' }, actor_catalog: {},
    canonical_start: { policy_profile_pins: [naturalPin], start: {
      world_pin: { world_revision_id: 'target-world', world_catalog_digest: 'c'.repeat(64) },
      initial_perception_rule: { id: naturalPin.key, version: naturalPin.revision },
      initial_environment_inputs: { calendar_date: { year: 1230, month: 1, day: 1 } }
    } } };
  const release = { scenario_binding_id: profile.scenario_id,
    world_revision_id: profile.canonical_start.start.world_pin.world_revision_id,
    world_catalog_digest: profile.canonical_start.start.world_pin.world_catalog_digest,
    scenario_profile_exact_pins: { phase_1a_manifest_digest: profile.manifest_digest,
      scenario_definition_revision: 1 } };
  const catalog = createTargetAuthoredStartCatalog({ runtime: { profile }, release });
  const binding = catalog.resolveRuntimeBinding(catalog.runtime_binding);
  assert.equal(binding.snapshot_schema, 'rus.authored_start_initial_party_snapshot.v3');
  assert.deepEqual(binding.initial_natural_perception_rule_pin, naturalPin);
  assert.equal(catalog.resolveRuntimeBinding({ ...catalog.runtime_binding, revision: 2 }), null);
  assert.equal(catalog.resolveRuntimeBinding({ catalog_id: 'historical', revision: 1 }), null);
});

test('target current-owner start does not require a historical initial perception rule pin', () => {
  const profile = { scenario_id: 'current-owner', manifest_digest: 'b'.repeat(64),
    public_metadata: { title: 'Current owner' }, actor_catalog: {},
    canonical_start: { policy_profile_pins: [], start: {
      world_pin: { world_revision_id: 'world', world_catalog_digest: 'c'.repeat(64) },
      initial_environment_inputs: { calendar_date: { year: 1230, month: 7, day: 1 } }
    } } };
  const catalog = createTargetAuthoredStartCatalog({ runtime: { profile }, release: {
    scenario_binding_id: profile.scenario_id, world_revision_id: 'world',
    world_catalog_digest: 'c'.repeat(64),
    scenario_profile_exact_pins: { phase_1a_manifest_digest: profile.manifest_digest,
      scenario_definition_revision: 1 } } });
  const binding = catalog.resolveRuntimeBinding(catalog.runtime_binding);
  assert.equal(Object.hasOwn(binding, 'initial_natural_perception_rule_pin'), false);
});

test('target catalog lists and selects each exact loaded start', async () => {
  const makeRuntime = (id) => ({ profile: {
    scenario_id: id, manifest_digest: id, public_metadata: { title: id }, actor_catalog: {},
    canonical_start: { policy_profile_pins: [{ key: 'rule', revision: 1, digest: id }],
      start: { candidate_id: id, world_pin: { world_revision_id: 'world', world_catalog_digest: 'digest' },
        initial_perception_rule: { id: 'rule', version: 1 },
        initial_environment_inputs: { calendar_date: { year: 1230, month: 7, day: 1 } } } }
  } });
  const starts = [makeRuntime('forest'), { ...makeRuntime('river'), bindingRevision: 2 }];
  const pins = Object.fromEntries(starts.map(({ profile }) => [profile.scenario_id,
    { scenario_definition_revision: 1, phase_1a_manifest_digest: profile.manifest_digest }]));
  const catalog = createTargetAuthoredStartCatalog({ runtime: { starts }, release: {
    scenario_binding_id: 'forest', scenario_binding_ids: ['forest', 'river'],
    scenario_profile_exact_pins_by_id: pins, world_revision_id: 'world',
    world_catalog_digest: 'digest', production_activation: true,
    runtime_selectable_in_canonical_production: true } });
  assert.deepEqual(catalog.listPublic().map(({ scenario_id }) => scenario_id), ['forest', 'river']);
  assert.equal(catalog.hasScenario('river'), true);
  assert.equal((await catalog.loadPublication('river')).binding.scenario_id, 'river');
  assert.equal((await catalog.loadPublication('river')).binding.runtime_binding.revision, 2);
  assert.equal(catalog.resolveRuntimeBinding({ catalog_id: 'novgorod_live_world_runtime_v17', revision: 2 }).scenario_id, 'river');
  assert.equal(catalog.hasScenario('unknown'), false);
  let selected = null;
  const marker = new Error('selected authored publication reached materialization');
  const runtime = createLowerDvinaTracePublicRuntime({ release: { release_id: 'target-test',
    world_revision_id: 'world', world_catalog_digest: 'digest' },
    runtimeCatalogPin: { catalog_revision_id: 'target-test' }, authoredStartCatalog: catalog,
    partyRepository: { async assertNewGameCreationIdentity() {}, async loadSession() {
      throw Object.assign(new Error('missing'), { code: 'PARTY_NOT_FOUND' }); } },
    traceStartAdapter: { async loadInternal() { return null; }, async loadVisible() {},
      assertExecutionSupport() {}, async materialize(request) { selected = request.scenario_id; throw marker; } } });
  assert.deepEqual((await runtime.listScenarios()).scenarios.map(({ scenario_id }) => scenario_id),
    ['forest', 'river']);
  await assert.rejects(runtime.startNewGame({ scenario_id: 'river', request_id: 'river-request' }),
    (error) => error === marker);
  assert.equal(selected, 'river');
});

test('target manifest rejects incomplete and duplicate binding revisions before database reads', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'novgorod-start-manifest-'));
  const dir = join(rootDir, 'data/world-catalogs/novgorod/live-world-runtime-v17');
  let queries = 0;
  const options = { rootDir, worldPool: { async query() { queries += 1; } },
    itemPin: { activation_event_id: 'item' }, actorBinding: { pin: { activation_event_id: 'actor' } } };
  try {
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'target-starts-manifest.v1.json');
    await writeFile(path, JSON.stringify({ schema: 'rus.live_world_runtime.target_starts_manifest.v1',
      version: 1, status: 'approved', starts: [{ binding_revision: 1 }] }));
    await assert.rejects(loadTargetAuthoredStartRuntimes(options),
      { code: 'SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED' });
    await writeFile(path, JSON.stringify({ schema: 'rus.live_world_runtime.target_starts_manifest.v1',
      version: 1, status: 'approved', starts: [{ binding_revision: 1 }, { binding_revision: 1 }] }));
    await assert.rejects(loadTargetAuthoredStartRuntimes(options),
      { code: 'SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED' });
    await writeFile(join(dir, 'start.json'), '{}');
    const artifact = { path: 'data/world-catalogs/novgorod/live-world-runtime-v17/start.json',
      sha256: '0'.repeat(64) };
    await writeFile(path, JSON.stringify({ schema: 'rus.live_world_runtime.target_starts_manifest.v1',
      version: 1, status: 'approved', starts: [{ binding_revision: 1,
        start: artifact, transfer: artifact, basis: artifact, approval: artifact }] }));
    await assert.rejects(loadTargetAuthoredStartRuntimes(options),
      { code: 'SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED' });
    assert.equal(queries, 0);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
