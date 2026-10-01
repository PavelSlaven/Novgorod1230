import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../packages/contracts/src/spatial-v3/registry.js';

const root = resolve(import.meta.dirname, '../..');
const catalog = 'data/world-catalogs/novgorod';
const dir = `${catalog}/m2c-npc/people-d49/d61-candidate`;
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const source = read(`${dir}/candidate-source.json`);
const approval = read(`${dir}/approval-draft.json`);
const sourceBase = read(`${dir}/source-base.json`);
const bundle = read(`${dir}/bundle.json`);
const profiles = read(`${dir}/spatial_v3_npc_runtime_profiles.json`);
const compositions = read(`${dir}/spatial_v3_g4_npc_composition_bindings.json`);
const authoring = read(`${dir}/spatial_v3_authoring_versions.json`);

test('D61 successor exists only as a pending local candidate; approved @2 stays intact', () => {
  const sourceBytes = readFileSync(resolve(root, `${dir}/candidate-source.json`));
  assert.equal(approval.exact_candidate.path, `${dir}/candidate-source.json`);
  assert.equal(approval.exact_candidate.sha256, sha(sourceBytes));
  assert.equal(approval.status, 'candidate_approval_pending');
  assert.equal(approval.resign_required, true);
  assert.equal(approval.import_authorized, false);
  assert.equal(approval.runtime_activation_authorized, false);
  assert.equal(bundle.source_candidate.path, `${dir}/candidate-source.json`);
  assert.equal(bundle.source_candidate.approval_path, `${dir}/approval-draft.json`);
  assert.equal(bundle.source_candidate.resign_required, true);
  assert.equal(bundle.status, 'candidate_approval_pending');
  assert.equal(bundle.non_operational, true);
  assert.equal(bundle.import_authorized, false);
  assert.equal(bundle.runtime_activation_authorized, false);

  const base = sourceBase.approved_profile_v2;
  const operationalProfiles = read(`${catalog}/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_npc_runtime_profiles.json`);
  assert.deepEqual(operationalProfiles.find((row) => row.id === base.id && row.version === 2), base);
  const oldProfile = profiles.find((row) => row.id === base.id && row.version === 2);
  const successor = profiles.find((row) => row.id === base.id && row.version === 3);
  assert.deepEqual(oldProfile, base);
  assert.equal(successor.status, 'candidate_approval_pending');
  assert.deepEqual(successor.payload.actor_applicability.sex_category, ['nov_1200_1250_sex_category_male']);
  assert.ok(successor.payload.clothing_variant_requirements.every((variant) =>
    variant.sex_categories.every((sex) => sex === 'male')));
  assert.ok(base.payload.clothing_variant_requirements.some((variant) =>
    variant.sex_categories.includes('female')));
  const { canonical_digest: _newDigest, ...successorWithoutDigest } = successor;
  assert.equal(successor.canonical_digest, computeSpatialV3CanonicalDigest(successorWithoutDigest).slice(7));
});

test('eight D61 composition successors preserve @2 and remain isolated from operations', () => {
  assert.equal(source.successor.id, 'm2c_npc_foreign_merchant_v1');
  assert.equal(source.successor.from_version, 2);
  assert.equal(source.successor.version, 3);
  const operationalCompositions = read(`${catalog}/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_g4_npc_composition_bindings.json`);
  const operationalForeignMerchantRows = operationalCompositions.filter((row) =>
    row.payload.weighted_profile_refs.some((entry) => entry.profile_ref.id === source.successor.id));
  assert.deepEqual(sourceBase.composition_rows_v2, operationalForeignMerchantRows);
  assert.ok(operationalForeignMerchantRows.every((row) => row.version === source.successor.from_version));
  assert.deepEqual(operationalForeignMerchantRows.map((row) => row.g4_id).sort(), source.composition_g4_ids);
  assert.deepEqual(compositions.map((row) => row.g4_id).sort(), source.composition_g4_ids);
  assert.equal(compositions.length, 8);
  assert.ok(compositions.every((row) => row.version === source.successor.from_version + 1));
  assert.deepEqual(compositions.map((row) => row.g4_id).sort(), operationalForeignMerchantRows.map((row) => row.g4_id).sort());
  assert.ok(compositions.every((row) => row.status === 'candidate_approval_pending'
    && row.payload.weighted_profile_refs.some((entry) => entry.profile_ref.id === source.successor.id
      && entry.profile_ref.version === 3)));
  assert.equal(authoring.length, 10);
  assert.ok(authoring.filter((row) => row.entity_id === source.successor.id && row.version === 3)
    .every((row) => row.status === 'candidate_approval_pending'));
  for (const composition of compositions) {
    const version = authoring.find((row) => row.entity_id === composition.id && row.version === composition.version);
    assert.ok(version);
    assert.equal(version.canonical_digest, composition.canonical_digest);
    assert.equal(version.status, composition.status);
  }

  const manifestText = readFileSync(resolve(root, `${catalog}/m2c-open-capacity-v2-import-manifest.json`), 'utf8');
  const bootstrapText = readFileSync(resolve(root, 'scripts/bootstrap-live-world-v17.mjs'), 'utf8');
  assert.equal(sha(manifestText), sourceBase.base_operational_manifest_sha256);
  assert.equal(manifestText.includes('d61-candidate'), false);
  assert.equal(bootstrapText.includes('d61-candidate'), false);
  assert.equal(bundle.base_operational_manifest_sha256, sourceBase.base_operational_manifest_sha256);
  assert.ok(bundle.limits.some((line) => line.includes('not referenced by the v17 bootstrap')));
});
