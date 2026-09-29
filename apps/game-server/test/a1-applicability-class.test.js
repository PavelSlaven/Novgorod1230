import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTargetRuntimeProfiles, readApprovedA1ApplicabilityClass } from
  '../src/internal/target-runtime-profiles.js';
import { assertActionProducedTargetApplicability } from
  '../src/infrastructure/postgres/action-produced-committed-context-loader.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const candidatePath = new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v17/a1-applicability-class.json',
  import.meta.url);
const approved = (overrides = {}) => ({ schema: 'rus.a1_applicability_class.v1',
  status: 'approved', world_revision_id: worldRevisionId,
  rule: { kind: 'all_g5_sites' }, approval: { approved_by: 'reviewer', approved_on: '2026-09-30',
    approved_path: 'data/world-catalogs/novgorod/live-world-runtime-v17/a1-applicability-class.json',
    approved_commit: '0123456789abcdef0123456789abcdef01234567' }, ...overrides });
const generatedV2Pool = { async query() { return { rows: [{ world_revision_id: worldRevisionId,
  parent_g4_id: 'g4v3__gn_nov_g3_xp017_yp026_r2_dry_pine_ridge', canonical_g5_ref: null,
  generated_template_ref: { entity_id: 'm2c_g5_forest__forest_resource_use__pine_ridge',
    authoring_version: '2' } }] }; } };

test('the committed A1 class-rule file is a pending candidate and grants nothing', async () => {
  const file = JSON.parse(await readFile(candidatePath, 'utf8'));
  assert.equal(file.rule.kind, 'all_g5_sites');
  assert.notEqual(file.status, 'approved');
  assert.equal(readApprovedA1ApplicabilityClass(file, worldRevisionId), null);
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId });
  assert.equal(loaded.materialization_profiles.actionProductionProfile
    .target_applicability.class_rule, undefined);
});

test('only an approved file for this world revision yields the class rule', () => {
  assert.deepEqual(readApprovedA1ApplicabilityClass(approved(), worldRevisionId),
    { kind: 'all_g5_sites', world_revision_id: worldRevisionId });
  for (const bad of [approved({ status: 'candidate_pending_independent_data_approval' }),
    approved({ approval: null }), approved({ approval: { approved_by: 'reviewer' } }),
    approved({ world_revision_id: 'other' }), approved({ rule: { kind: 'everywhere' } }),
    approved({ schema: 'other' })]) {
    assert.equal(readApprovedA1ApplicabilityClass(bad, worldRevisionId), null);
  }
});

test('per-place applicability never matches a capacity-v2 generated template, the class rule does', async () => {
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId });
  const { target_applicability: listed } = loaded.materialization_profiles.actionProductionProfile;
  await assert.rejects(() => assertActionProducedTargetApplicability(generatedV2Pool, 'party', 'pos', listed),
    { code: 'M2C_TARGET_A1_APPLICABILITY_DATA_GAP' });
  const withRule = { ...listed, class_rule: { kind: 'all_g5_sites', world_revision_id: worldRevisionId } };
  await assertActionProducedTargetApplicability(generatedV2Pool, 'party', 'pos', withRule);
  const otherRevision = { ...withRule, class_rule: { ...withRule.class_rule, world_revision_id: 'other' } };
  await assert.rejects(() => assertActionProducedTargetApplicability(generatedV2Pool, 'party', 'pos',
    otherRevision), { code: 'M2C_TARGET_A1_APPLICABILITY_DATA_GAP' });
});

test('the loader takes the class rule from an approved file path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'a1-class-'));
  const path = join(dir, 'a1.json');
  await writeFile(path, JSON.stringify(approved()));
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId, a1ApplicabilityClassPath: path });
  assert.deepEqual(loaded.materialization_profiles.actionProductionProfile
    .target_applicability.class_rule, { kind: 'all_g5_sites', world_revision_id: worldRevisionId });
});
