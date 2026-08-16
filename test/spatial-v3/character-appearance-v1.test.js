import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCharacterAppearanceV1ImportSql } from '../../tools/spatial-v3/character-appearance-v1-importer.mjs';
import { validateCharacterAppearanceV1 } from '../../tools/spatial-v3/character-appearance-v1-validator.mjs';
import { CHARACTER_APPEARANCE_V4_RELEASE } from
  '../../tools/runtime-catalog-activation/src/character-appearance-v4-activation.js';

test('character appearance world v4 candidate is sealed, normalized and inactive', async () => {
  const validation = await validateCharacterAppearanceV1();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.pass, true);
  assert.equal(validation.world_revision_id, 'novgorod_spatial_v3_production_v4_candidate_001');
  assert.equal(validation.actor_component_count, 42);
  assert.equal(validation.garment_binding_count, 20);
  assert.equal(validation.production_activation, false);
});

test('character appearance world v4 importer is transactional and idempotent by exact readback', async () => {
  const sql = await buildCharacterAppearanceV1ImportSql({ rollback: true });
  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /region_demographic_profile_entries/u);
  assert.match(sql, /item_template_category_bindings/u);
  assert.match(sql, /CHARACTER_APPEARANCE_IMPORT_READBACK_MISMATCH/u);
  assert.match(sql, /ROLLBACK;\s*$/u);
});

test('production-v9 activation pins the exact post-migration-21 world v4 tuple', () => {
  assert.equal(CHARACTER_APPEARANCE_V4_RELEASE.releaseId,
    'spatial-v3-production-v9');
  assert.equal(CHARACTER_APPEARANCE_V4_RELEASE.worldRevision,
    'novgorod_spatial_v3_production_v4_candidate_001');
  assert.equal(CHARACTER_APPEARANCE_V4_RELEASE.worldSchemaFingerprint,
    'd5bb566dd7d22d34d06fcff0c3db961294c619753ce93557c4e91adae6375541');
  assert.equal(CHARACTER_APPEARANCE_V4_RELEASE.candidateDirectory,
    'spatial-v3-production-v4');
  assert.equal(CHARACTER_APPEARANCE_V4_RELEASE.bindingsFile,
    'spatial-v3-production-v9-bindings.js');
});
