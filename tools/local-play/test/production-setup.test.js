import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production setup always runs Stage 3c in local-play mode', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url), 'utf8');
  assert.match(source, /\['scripts\/run-pr17-item-container-stage3c\.mjs', '--mode', 'local-play'\]/u);
  assert.doesNotMatch(source, /stage3cModeForWorldUrl/u);
});

test('local bootstrap reports the M3 gap without manufacturing authority', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  assert.match(source, /LOCAL_PLAY_RUNTIME_CAPABILITIES_V1/u);
  assert.doesNotMatch(source, /installProceduralFinalDevelopmentCatalog/u);
  assert.doesNotMatch(source, /migrateExisting|rematerializeExisting/u);
});

test('local bootstrap matches green catalog-then-v3 activation order', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  const schemaInstall = source.indexOf("['18.sql', '19.sql', '20.sql']");
  const parentRevisionEnsure = source.indexOf(
    'buildCharacterAppearanceParentRevisionEnsureSql({'
  );
  const s1Import = source.indexOf('buildS1AuthoringV6ImportSql({');
  const migration = source.indexOf('runWorldRuntimeCatalogMigration(worldPool)');
  const activation = source.indexOf('buildFirstPlayableV2ActivationBundle({');
  const gate1Parent = source.indexOf('registerGate1ApprovedParentCatalog({');
  const actorEnsure = source.indexOf('ensureActorBaseAttributesRuntimeActive({');
  const appearanceDdl = source.indexOf("infra/world-base/schema/21.sql");
  const appearanceImport = source.indexOf('buildCharacterAppearanceV1ImportSql({');
  assert.ok(schemaInstall >= 0);
  assert.ok(schemaInstall < parentRevisionEnsure);
  assert.ok(parentRevisionEnsure < s1Import);
  assert.ok(s1Import < migration);
  assert.ok(migration < activation,
    'exact catalog fingerprint must reach first-playable before actor/21 DDL');
  assert.ok(activation < gate1Parent,
    'gate1 parent registration stays after current-schema activations');
  assert.ok(gate1Parent < actorEnsure,
    'approved V12-compatible gate1 parent must exist before actor ensure');
  assert.ok(actorEnsure < appearanceDdl,
    'full 21.sql stays after actor ensure for owner-migration fingerprint');
  assert.ok(appearanceDdl < appearanceImport);
  assert.match(source, /release:\s*FIRST_PLAYABLE_V3_RELEASE/u,
    'post-catalog activation must use V3 fingerprint left by catalog migration');
  assert.match(source, /buildLowerDvinaBoundaryV3CurrentSchemaActivationBundle/u);
  assert.match(source, /buildSpatialV3DevelopmentV13ActivationBundle/u);
  assert.doesNotMatch(source, /activateGate1RuntimeCatalog\(\{/u,
    'bootstrap must not swap active runtime catalog pin via full gate1 activate');
  assert.doesNotMatch(source, /buildSpatialV3ProductionV12ActivationBundle/u);
  assert.doesNotMatch(source, /buildLowerDvinaBoundaryV3ActivationBundle\(\{/u);
});

test('local bootstrap materializes appearance parent revision before S1 import', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  const parentRevisionEnsure = source.indexOf(
    'buildCharacterAppearanceParentRevisionEnsureSql({'
  );
  const s1Import = source.indexOf('buildS1AuthoringV6ImportSql({');
  const gate1Parent = source.indexOf('registerGate1ApprovedParentCatalog({');
  const appearanceDdl = source.indexOf("infra/world-base/schema/21.sql");
  const appearanceImport = source.indexOf('buildCharacterAppearanceV1ImportSql({');
  const activation = source.indexOf('buildFirstPlayableV2ActivationBundle({');
  const actorEnsure = source.indexOf('ensureActorBaseAttributesRuntimeActive({');
  assert.ok(parentRevisionEnsure >= 0);
  assert.ok(s1Import >= 0);
  assert.ok(parentRevisionEnsure < s1Import,
    'v4 parent revision row must exist before S1 v5/v6 parent_revision FK');
  assert.ok(parentRevisionEnsure < activation);
  assert.ok(parentRevisionEnsure < gate1Parent,
    'early spatial parent ensure must not replace gate1 domain catalog parent');
  assert.ok(activation < appearanceDdl,
    'full 21.sql must not precede assertExactMigrationTargets');
  assert.ok(actorEnsure < appearanceDdl,
    'full 21.sql stays after actor ensure for owner-migration fingerprint');
  assert.ok(appearanceDdl < appearanceImport);
  assert.ok(s1Import < appearanceImport,
    'full appearance import stays after S1; only parent revision precedes S1');
});
