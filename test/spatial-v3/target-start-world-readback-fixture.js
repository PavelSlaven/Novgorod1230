import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const npcManifest = 'data/world-catalogs/novgorod/m2c-npc-canonical-import-manifest.json';
const acousticManifest = 'data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json';

/** Import approved M2c authoring into a disposable target DB and read exact start dependencies. */
export async function loadTargetStartWorldReadback({ pool, start } = {}) {
  assert.ok(pool?.query, 'PostgreSQL pool is required');
  const placement = start?.initial_placement;
  const revision = start?.world_pin?.world_revision_id;
  assert.ok(placement && typeof revision === 'string', 'approved target start pins are required');

  const schemaState = await pool.query(`SELECT
    to_regclass('world_base.spatial_v3_g6_acoustic_baselines') IS NOT NULL AS acoustic,
    to_regclass('world_base.spatial_v3_g4_npc_composition_bindings') IS NOT NULL AS npc`);
  if (!schemaState.rows[0]?.acoustic || !schemaState.rows[0]?.npc) {
    for (const part of [21, 22, 23, 24]) {
      await pool.query(await readFile(`infra/world-base/schema/${part}.sql`, 'utf8'));
    }
  }

  for (const manifestPath of [npcManifest, acousticManifest]) {
    const validation = await validateAuthoringBundle({ root: process.cwd(), manifestPath });
    assert.equal(validation.ok, true, `${manifestPath}: ${JSON.stringify(validation.errors)}`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.status, 'approved', `${manifestPath} must be approved`);
    await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath }));
  }

  const reader = createSpatialV3WorldBaseReader({ query: pool.query.bind(pool) });
  const [g5Result, sceneResult, g4Result] = await Promise.all([
    reader.readPinnedCanonicalG5SceneBinding({ ...placement.canonical_g5_ref,
      world_revision_id: revision }),
    reader.readPinnedSceneTemplateClosure({ ...placement.scene_template_ref,
      world_revision_id: revision }),
    pool.query(`SELECT n.id,n.version,n.world_revision_id,n.spatial_level,n.status,
        n.canonical_digest,av.status AS authoring_status,
        av.canonical_digest AS authoring_digest
      FROM world_base.spatial_v3_nodes n
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind='spatial_node' AND av.entity_id=n.id
       AND av.version=n.version AND av.world_revision_id=n.world_revision_id
      WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
        AND n.spatial_level='G4' AND n.status='approved'
        AND av.status='approved' AND av.canonical_digest=n.canonical_digest
      LIMIT 2`, [placement.g4_ref.id, placement.g4_ref.version, revision])
  ]);
  assert.equal(g5Result.ok, true, JSON.stringify(g5Result.error));
  assert.equal(sceneResult.ok, true, JSON.stringify(sceneResult.error));
  assert.equal(g5Result.value.parent_id, placement.g4_ref.id);
  assert.equal(g5Result.value.parent_version, placement.g4_ref.version);
  assert.equal(g5Result.value.scene_template_id, placement.scene_template_ref.id);
  assert.equal(g5Result.value.materialization_profile_id,
    placement.scene_materialization_profile_ref.id);
  assert.equal(g4Result.rows.length, 1, 'exact approved G4 and authoring pin exist');
  const g4 = g4Result.rows[0];
  const canonicalG5 = g5Result.value;
  const sceneTemplate = sceneResult.value.header;

  const [npcResult, acousticResult] = await Promise.all([
    reader.readPinnedG4NpcCompositionClosure({ g4, canonical_g5: canonicalG5 }),
    reader.readPinnedCanonicalG5AcousticClosure({ canonical_g5: canonicalG5,
      scene_template: sceneTemplate, world_revision_id: revision })
  ]);
  assert.equal(npcResult.ok, true, JSON.stringify(npcResult.error));
  assert.equal(acousticResult.ok, true, JSON.stringify(acousticResult.error));
  assert.ok(acousticResult.value.rows.length > 0, 'approved acoustic baseline covers scene G6 slots');

  const natural = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/m2c-natural/candidate.json', 'utf8'));
  const presentation = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/m2c-natural-presentation/candidate.json', 'utf8'));
  const placementCandidate = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/m2c-natural-placement/candidate.json', 'utf8'));
  const naturalProfile = natural.natural_profiles.find((row) =>
    row.g4_ref.id === placement.g4_ref.id && row.g4_ref.version === placement.g4_ref.version
      && row.g4_ref.world_revision_id === revision);
  const presentationProfile = presentation.presentation_profiles.find((row) =>
    row.g4_ref.id === placement.g4_ref.id && row.g4_ref.version === placement.g4_ref.version
      && row.g4_ref.world_revision_id === revision);
  assert.ok(naturalProfile && presentationProfile,
    'exact target G4 natural and presentation authoring rows exist');
  const compiledRecordIds = [
    `profile:${naturalProfile.profile_id}`,
    `profile:${presentationProfile.id}`,
    `profile:${placementCandidate.candidate_id}`,
    `profile:${start.initial_perception_rule.id}`
  ];
  const naturalCompiledRecords = await pool.query(`SELECT record_id,version,record_kind,
      family_candidate_ref,payload,payload_digest,source_pack_digest,status
    FROM world_base.procedural_scene_compiled_records
    WHERE record_id=ANY($1::text[]) ORDER BY record_id,version`, [compiledRecordIds]);
  assert.deepEqual(naturalCompiledRecords.rows.map(({ record_id: id }) => id).sort(),
    compiledRecordIds.slice().sort(),
    'target runtime catalog import contains exact natural, presentation, placement and initial-rule rows');
  assert.ok(naturalCompiledRecords.rows.every((row) => row.version === 1
    && row.record_kind === 'profile'
    && row.status === 'approved_authoring_not_runtime_selectable'
    && /^[a-f0-9]{64}$/u.test(row.payload_digest)
    && /^[a-f0-9]{64}$/u.test(row.source_pack_digest)),
  'compiled rows have exact approved authoring status and valid digests');

  return Object.freeze({
    world_base_reference_snapshot: Object.freeze({
      version: 1,
      schema: 'world_base_reference_snapshot',
      readonly_checksum: 'actual-postgres-readback',
      allowed_region_ids: Object.freeze([]), allowed_graph_node_ids: Object.freeze([]),
      allowed_graph_edge_ids: Object.freeze([]), allowed_place_template_ids: Object.freeze([]),
      allowed_npc_candidate_ids: Object.freeze([]), allowed_item_profile_ids: Object.freeze([]),
      allowed_container_profile_ids: Object.freeze([]), allowed_property_rule_ids: Object.freeze([]),
      allowed_source_ids: Object.freeze([]),
      canonical_g5_scene_bindings: Object.freeze([canonicalG5]),
      scene_template_closures: Object.freeze([sceneResult.value])
    }),
    canonical_npc_closure: npcResult.value,
    canonical_acoustic_rows: acousticResult.value.rows,
    natural_compiled_records: Object.freeze(naturalCompiledRecords.rows),
    worldBaseReader: reader
  });
}
