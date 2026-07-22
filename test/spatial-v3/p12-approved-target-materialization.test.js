import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { promisify } from 'node:util';
import { materializeP12ApprovedTarget } from '../../tools/spatial-v3/materialize-p12-approved-target.mjs';
import { classifyP12DependencyEntityId, compileP12V11PhysicalRows, validateApprovedPhysicalSourceRows, validateP12ApprovedProjectionSource } from '../../tools/spatial-v3/p12-v1_1-physical-projection.mjs';

const checkedInRoot = join(process.cwd(), 'data/world-catalogs/novgorod/spatial-v3');
const approvedSourceRoot = join(checkedInRoot, 'source-approval/p12_novgorod_source_approval_001/data');
const sourceRecords = async (file) => JSON.parse(await readFile(join(approvedSourceRoot, file), 'utf8')).records;
const execFile = promisify(execFileCallback);
const approvalZip = join(checkedInRoot, 'target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip');
const approvedV11 = async () => ({ ok: true, materialization_authorized: false, p28_activation: 'not_authorized', errors: [] });
const targetRecords = async (file) => JSON.parse((await execFile('tar', ['-xOf', approvalZip, `P12_TARGET_MATERIALIZATION_APPROVAL_V1_1/target/${file}.json`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout).records;
const projectionFixture = async () => {
  const [approvedSourcePairs, connectionBindings, entryBindings, directRouteBindings, routeContextLinks, legacyMappings, retainedNodes, canonicalG5, sourceProfiles, sourceCandidates, assignments, families] = await Promise.all([
    sourceRecords('physical-exit-source-pairs.json'), targetRecords('canonical-g5-connection-bindings'), targetRecords('g4-entry-endpoint-bindings'),
    targetRecords('direct-route-source-bindings'), targetRecords('route-context-links'), sourceRecords('legacy-edge-mapping-bindings.json'),
    readFile(join(checkedInRoot, 'target-materialization-approval/dependency-closure/v1/datasets/spatial_v3_nodes.json'), 'utf8').then(JSON.parse),
    sourceRecords('canonical-g5-inventory.json'), sourceRecords('scene-materialization-profiles.json'), sourceRecords('scene-materialization-candidates.json'),
    sourceRecords('scene-profile-assignments.json'), sourceRecords('approved-scene-profile-families.json')
  ]);
  const retainedHierarchyTargets = retainedNodes.filter((row) => ['G2', 'G3'].includes(row.spatial_level)).map((row) => row.id);
  return { approvedSourcePairs, connectionBindings, entryBindings, directRouteBindings, routeContextLinks, legacyMappings, retainedHierarchyTargets, canonicalG5, sourceProfiles, sourceCandidates, assignments, families };
};

test('P12 approved target authoring bundle is reproducible from the immutable approved packages', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'p12-approved-target-'));
  try {
    const outputManifest = join(temporary, 'manifest.json');
    await materializeP12ApprovedTarget({ root: process.cwd(), manifestPath: outputManifest, validateTargetApproval: approvedV11 });
    const expectedManifest = await readFile(join(checkedInRoot, 'manifest.json'));
    const actualManifest = await readFile(outputManifest);
    assert.deepEqual(actualManifest, expectedManifest);
    const manifest = JSON.parse(actualManifest);
    for (const dataset of manifest.datasets) {
      assert.deepEqual(
        await readFile(join(temporary, dataset.file)),
        await readFile(join(checkedInRoot, dataset.file)),
        dataset.table
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('P12 source-pair projection preserves every approved physical source identity', async () => {
  const result = await compileP12V11PhysicalRows({ root: process.cwd() });
  const rows = result.rows.get('spatial_v3_approved_physical_source_pairs');
  const sourcePairs = await sourceRecords('physical-exit-source-pairs.json');
  assert.equal(rows.length, 358);
  assert.deepEqual(
    new Set(rows.map((row) => `${row.id}@${row.version}`)),
    new Set(sourcePairs.map((row) => `${row.physical_exit_pair_id}@${row.version}`))
  );
  assert.ok(rows.every((row) => row.status === 'approved' && /^[a-f0-9]{64}$/u.test(row.source_payload_sha256)));
});

test('P12 target compilation has exact disjoint coverage of all 600 approved edge mappings', async () => {
  const physical = await sourceRecords('physical-exit-source-pairs.json');
  const mappings = await sourceRecords('legacy-edge-mapping-bindings.json');
  const countByKind = (records) => Object.fromEntries(
    [...Map.groupBy(records, (row) => row.target_mapping_kind)].map(([kind, rows]) => [kind, rows.length])
  );
  assert.deepEqual(countByKind(physical), {
    cross_g4_world_route_source: 43,
    corridor_to_host_route_context_source: 32,
    world_route_segment_context_source: 24,
    host_entry_site_connection_source: 32,
    intra_g4_site_connection_source: 227
  });
  assert.equal(new Set(physical.map((row) => row.physical_exit_pair_id)).size, 358);
  assert.deepEqual(countByKind(mappings), {
    retained_hierarchy_dependency: 47,
    canonical_g5_parent_dependency: 195,
    cross_g4_world_route_source: 43,
    corridor_to_host_route_context_source: 32,
    world_route_segment_context_source: 24,
    host_entry_site_connection_source: 32,
    intra_g4_site_connection_source: 227
  });
  assert.equal(mappings.length, 600);
  assert.equal(47 + 195 + physical.length, 600);

  const compiled = await compileP12V11PhysicalRows({ root: process.cwd() });
  assert.equal(compiled.rows.get('spatial_v3_world_routes').length, 43 * 2);
  assert.equal(compiled.rows.get('spatial_v3_g4_directional_exits').length, 43 * 2);
  assert.equal(compiled.rows.get('spatial_v3_topological_direction_contexts').length, 43 * 2);
});

test('P12 target compilation preserves the 195 G5/profile/candidate bijection and all 17 approved families', async () => {
  const [g5, profiles, candidates, assignments, families] = await Promise.all([
    sourceRecords('canonical-g5-inventory.json'),
    sourceRecords('scene-materialization-profiles.json'),
    sourceRecords('scene-materialization-candidates.json'),
    sourceRecords('scene-profile-assignments.json'),
    sourceRecords('approved-scene-profile-families.json')
  ]);
  assert.equal(g5.length, 195);
  assert.equal(profiles.length, 195);
  assert.equal(candidates.length, 195);
  assert.equal(assignments.length, 195);
  assert.equal(families.length, 17);
  assert.deepEqual(new Set(profiles.map((row) => row.source_ref.replace(/@1$/u, ''))), new Set(g5.map((row) => row.id)));
  assert.deepEqual(new Set(candidates.map((row) => row.profile_id)), new Set(profiles.map((row) => row.id)));
  assert.deepEqual(new Set(assignments.map((row) => row.source_profile_family_id)), new Set(families.map((row) => row.profile_id)));
});

test('P12 compiler rejects missing, duplicate, misclassified and unknown source-pair partition rows', async () => {
  const valid = await projectionFixture();
  assert.deepEqual(validateP12ApprovedProjectionSource(valid), []);
  const mutations = [
    (fixture) => fixture.approvedSourcePairs.pop(),
    (fixture) => fixture.approvedSourcePairs.push(structuredClone(fixture.approvedSourcePairs[0])),
    (fixture) => fixture.connectionBindings.push(structuredClone(fixture.connectionBindings[0])),
    (fixture) => { fixture.approvedSourcePairs.find((row) => row.target_mapping_kind === 'cross_g4_world_route_source').target_mapping_kind = 'intra_g4_site_connection_source'; },
    (fixture) => { fixture.directRouteBindings[0].source_pair_ref = 'pepv3__not_approved@1'; },
    (fixture) => { fixture.approvedSourcePairs[0].directions[1].to = structuredClone(fixture.approvedSourcePairs[0].source_to); }
  ];
  for (const mutate of mutations) {
    const fixture = structuredClone(valid); mutate(fixture);
    assert.notDeepEqual(validateP12ApprovedProjectionSource(fixture), []);
  }
});

test('P12 compiler rejects source-pair registry payload drift', async () => {
  const sourcePairs = await sourceRecords('physical-exit-source-pairs.json');
  const compiled = await compileP12V11PhysicalRows({ root: process.cwd() });
  const rows = structuredClone(compiled.rows.get('spatial_v3_approved_physical_source_pairs'));
  assert.deepEqual(validateApprovedPhysicalSourceRows(sourcePairs, rows), []);
  rows[0].source_payload_sha256 = '0'.repeat(64);
  assert.deepEqual(validateApprovedPhysicalSourceRows(sourcePairs, rows), [{
    code: 'P12_APPROVED_SOURCE_PAIR_PAYLOAD_DRIFT',
    subject_ref: `${rows[0].id}@${rows[0].version}`
  }]);
});

test('P12 dependency compilation types every traversal profile and fails closed on unknown compiled IDs', async () => {
  const compiled = await compileP12V11PhysicalRows({ root: process.cwd() });
  const traversalVersions = compiled.rows.get('spatial_v3_authoring_versions').filter((row) => row.entity_id.startsWith('g4traversal__'));
  const traversalEdges = compiled.rows.get('spatial_v3_authoring_dependency_edges').filter((row) => row.source_entity_id.startsWith('g4traversal__'));
  assert.equal(traversalVersions.length, 32);
  assert.equal(traversalEdges.length, 32);
  assert.ok(traversalVersions.every((row) => row.entity_kind === 'g4_traversal_profile'));
  assert.ok(traversalEdges.every((row) => row.source_entity_kind === 'g4_traversal_profile'));
  assert.throws(() => classifyP12DependencyEntityId('g4traversal_broken'), /P12_V11_UNKNOWN_COMPILED_DEPENDENCY_ID/);
});

test('P12 approved target regeneration fails closed when V1.1 ZIP approval drifts', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'p12-invalid-approval-'));
  try {
    await assert.rejects(
      materializeP12ApprovedTarget({
        root: process.cwd(),
        manifestPath: join(temporary, 'manifest.json'),
        validateTargetApproval: async () => ({
          ok: false,
          materialization_authorized: false,
          p28_activation: 'not_authorized',
          errors: [{ code: 'P12_V11_ZIP_DIGEST_MISMATCH' }]
        })
      }),
      /P12_TARGET_APPROVAL_INVALID:P12_V11_ZIP_DIGEST_MISMATCH/
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
