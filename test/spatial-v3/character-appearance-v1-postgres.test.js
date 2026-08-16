import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import { loadApprovedActorProfileCatalog } from '@rus/runtime-catalog';
import { buildLowerDvinaBoundaryV1ImportSql } from '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from '../../tools/spatial-v3/character-appearance-v1-importer.mjs';

const container = `character-appearance-${randomUUID().slice(0, 12)}`;
const docker = (args, input, timeout = 60_000) => spawnSync('docker', args, { input, encoding: 'utf8', timeout });

test('world migration 21 and character appearance v4 import replay in isolated PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', container]);
  });
  assert.equal(docker([
    'run', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=appearance', '-e', 'POSTGRES_USER=appearance',
    '-e', 'POSTGRES_DB=world', 'postgres:16-alpine'
  ]).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    ready = docker([
      'exec', container, 'psql', '-qAt', '-U', 'appearance', '-d', 'world',
      '-c', 'SELECT 1'
    ]).status === 0;
    if (ready) break;
  }
  assert.equal(ready, true);
  const psql = (sql, timeout) => docker([
    'exec', '-i', container, 'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'appearance', '-d', 'world'
  ], sql, timeout);
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  const parts = [...entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)].map((match) => match[1]);
  for (const part of parts) {
    const applied = psql(await readFile(`infra/world-base/schema/${part}`, 'utf8'), 120_000);
    assert.equal(applied.status, 0, applied.stderr);
  }

  const parent = psql(await buildLowerDvinaBoundaryV1ImportSql(), 180_000);
  assert.equal(parent.status, 0, parent.stderr);
  const dependencies = psql(externalGarmentDependencies());
  assert.equal(dependencies.status, 0, dependencies.stderr);
  const sql = await buildCharacterAppearanceV1ImportSql();
  const imported = psql(sql, 180_000);
  assert.equal(imported.status, 0, imported.stderr);
  const readback = psql(`
    SELECT count(*) FROM world_base.region_demographic_profile_entries;
    SELECT count(*) FROM world_base.region_appearance_profile_entries;
    SELECT count(*) FROM world_base.item_template_category_bindings
      WHERE binding_kind IN ('garment_kind','equipment_slot','neckline','sleeve_form','outer_form','visible_fabric','trim','main_visible_color','secondary_visible_color','headwear_kind');
    SELECT demographic_option_id IS NULL FROM world_base.region_demographic_profiles
      WHERE id = 'novgorod_1200_1250_demographic_profile_v1';
  `);
  assert.match(readback.stdout, /\b6\b/u);
  assert.match(readback.stdout, /\b36\b/u);
  assert.match(readback.stdout, /\b20\b/u);
  assert.match(readback.stdout, /\bt\b/u);
  const replay = psql(sql, 180_000);
  assert.equal(replay.status, 0, replay.stderr);

  const port = Number(docker(['port', container, '5432']).stdout
    .match(/:(\d+)\s*$/u)?.[1]);
  pool = new pg.Pool({
    host: '127.0.0.1', port, user: 'appearance', password: 'appearance',
    database: 'world', max: 2
  });
  const manifest = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/manifest.json',
    'utf8'
  ));
  const runtimeCatalog = await loadApprovedActorProfileCatalog({
    worldBaseReader: { read: (statement, params) => pool.query(statement, params) },
    worldPin: {
      world_revision_id: manifest.world_revision_id,
      world_catalog_digest: manifest.catalog_digest
    },
    regionId: 'region_novgorod_land',
    effectiveDate: '1230-06-01'
  });
  assert.equal(runtimeCatalog.records_by_table.region_demographic_profiles.length, 1);
  assert.equal(runtimeCatalog.records_by_table.region_appearance_profiles.length, 1);
  assert.equal(runtimeCatalog.records_by_table.region_demographic_profile_entries.length, 6);
  assert.equal(runtimeCatalog.records_by_table.region_appearance_profile_entries.length, 36);

  const incompleteDemographic = psql(`
    BEGIN;
    INSERT INTO world_base.region_demographic_profiles
      (id, region_id, demographic_option_id, weight, status)
    VALUES ('invalid_normalized_demographic', 'region_novgorod_land', NULL, 1, 'approved');
    INSERT INTO world_base.region_demographic_profile_entries
      (id, demographic_profile_id, facet, option_id, weight, status)
    VALUES ('invalid_normalized_demographic:sex', 'invalid_normalized_demographic',
      'sex_category', 'nov_1200_1250_sex_category_male', 1, 'approved');
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(incompleteDemographic.status, 0);
  assert.match(incompleteDemographic.stderr, /normalized demographic profile is incomplete/u);

  const incompleteAppearance = psql(`
    BEGIN;
    INSERT INTO world_base.region_appearance_profiles
      (id, region_id, appearance_option_id, weight, status)
    VALUES ('invalid_normalized_appearance', 'region_novgorod_land', NULL, 1, 'approved');
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(incompleteAppearance.status, 0);
  assert.match(incompleteAppearance.stderr, /normalized appearance profile is incomplete/u);

  const mixedLegacyDemographic = psql(`
    BEGIN;
    INSERT INTO world_base.region_demographic_profiles
      (id, region_id, demographic_option_id, weight, status)
    VALUES ('invalid_mixed_demographic', 'region_novgorod_land',
      'nov_1200_1250_sex_category_male', 1, 'approved');
    INSERT INTO world_base.region_demographic_profile_entries
      (id, demographic_profile_id, facet, option_id, weight, status)
    VALUES ('invalid_mixed_demographic:sex', 'invalid_mixed_demographic',
      'sex_category', 'nov_1200_1250_sex_category_male', 1, 'approved');
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(mixedLegacyDemographic.status, 0);
  assert.match(mixedLegacyDemographic.stderr, /mixes legacy and normalized formats/u);

  const removeRequiredFacet = psql(`
    BEGIN;
    DELETE FROM world_base.region_demographic_profile_entries
    WHERE demographic_profile_id = 'novgorod_1200_1250_demographic_profile_v1'
      AND facet = 'age_category';
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(removeRequiredFacet.status, 0);
  assert.match(removeRequiredFacet.stderr, /normalized demographic profile is incomplete/u);

  const downgradeRequiredFacet = psql(`
    BEGIN;
    UPDATE world_base.region_appearance_profile_entries
    SET status = 'deprecated'
    WHERE appearance_profile_id = 'novgorod_1200_1250_appearance_profile_v1'
      AND facet = 'eye_color';
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(downgradeRequiredFacet.status, 0);
  assert.match(downgradeRequiredFacet.stderr, /normalized appearance profile is incomplete/u);

  const mixCompleteNormalizedProfile = psql(`
    BEGIN;
    UPDATE world_base.region_demographic_profiles
    SET demographic_option_id = 'nov_1200_1250_sex_category_male'
    WHERE id = 'novgorod_1200_1250_demographic_profile_v1';
    SET CONSTRAINTS ALL IMMEDIATE;
  `);
  assert.notEqual(mixCompleteNormalizedProfile.status, 0);
  assert.match(mixCompleteNormalizedProfile.stderr, /mixes legacy and normalized formats/u);
});

function externalGarmentDependencies() {
  const digest = 'b'.repeat(64);
  const category = (id, label) => `
    INSERT INTO world_base.universal_categories
      (id, domain, stable_code, facet, preferred_label, definition, scope_note,
       inclusion_rules, exclusion_rules, title, status)
    VALUES ('${id}', 'item', '${id}', 'object_type', '${label}', '${label}',
      'Approved item-catalog dependency.', 'Exact approved template only.',
      'No fallback.', '${label}', 'approved') ON CONFLICT DO NOTHING;`;
  return `
    INSERT INTO world_base.regions (id, canonical_name, status, confidence)
    VALUES ('region_novgorod_land', 'Новгородская земля', 'approved', 'high')
    ON CONFLICT DO NOTHING;
    INSERT INTO world_base.source_records (id, title, source_type, status, confidence)
    VALUES ('src_character_appearance_external_items', 'Approved item/container 120 dependency',
      'project_note', 'approved', 'high') ON CONFLICT DO NOTHING;
    INSERT INTO world_base.world_revisions (id, title, catalog_digest, status)
    VALUES ('world_revision_novgorod_1230_item_container_approved_001',
      'Approved item/container catalogue', '${digest}', 'approved')
    ON CONFLICT DO NOTHING;
    ${category('cat_item_object_linen_shirt_v1', 'linen shirt')}
    ${category('cat_item_object_wool_outer_garment_v1', 'wool outer garment')}
    INSERT INTO world_base.item_templates
      (id, region_id, title, status, confidence, world_revision_id, category_id, source_id)
    VALUES
      ('item_tpl_nov_linen_shirt_v1', 'region_novgorod_land', 'нижняя рубаха',
       'approved', 'high', 'world_revision_novgorod_1230_item_container_approved_001',
       'cat_item_object_linen_shirt_v1', 'src_character_appearance_external_items'),
      ('item_tpl_nov_wool_outer_garment_v1', 'region_novgorod_land', 'шерстяная верхняя одежда',
       'approved', 'high', 'world_revision_novgorod_1230_item_container_approved_001',
       'cat_item_object_wool_outer_garment_v1', 'src_character_appearance_external_items')
    ON CONFLICT DO NOTHING;
  `;
}
