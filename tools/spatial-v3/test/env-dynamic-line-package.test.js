import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const candidate = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/environment-dynamic';
const read = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('m2c-lines-v1 carries exact source-pinned environment candidates and bounded approval metadata', async () => {
  const manifest = await read(`${candidate}/source-manifest.json`);
  assert.equal(manifest.schema, 'rus.m2c_lines_v1.environment_dynamic_source_manifest.v1');
  assert.equal(manifest.status, 'candidate_pending_authoring_attestation');
  assert.equal(manifest.data_approval.import_authorized, false);
  assert.equal(manifest.data_approval.activation_authorized, false);
  assert.equal(manifest.source_package_digest, 'ac311478d111d6fcd4ede09791301beced3fb884624a450da65900a5af96e38b');
  assert.equal(manifest.source_package_manifest_sha256, '0f3eb04f7d0b9f7723e891b7c74cde79cd0a77519d1e6b73368760fceb78dff0');
  assert.equal(manifest.source_pins_sha256, '7709010288425d0971205fad91b7146a5b1377522edb13237391aef57f0a1034');
  assert.equal(sha256(await readFile(resolve(root, `${candidate}/source-pins.json`))), manifest.source_pins_sha256);

  const artifacts = new Map(manifest.artifacts.map((entry) => [entry.target_path, entry]));
  assert.equal(artifacts.size, 4);
  for (const [file, sourceSha] of [
    ['dynamic_environment_rule_sets.candidate.json', 'dd83b475a7b3ffed738c87249d1abf5ad83a02e9762e77ee4d569318c0eb105e'],
    ['spatial_v3_transition_environment_profiles_v2.candidate.json', '42f1029af6c0a346853f98a8ac33e2f0d80b1df926874bd381378ff604633ced'],
    ['dynamic_environment_rule_set_storage_refs.json', 'e9028953c47dfeeb18bd0f89d0bd1e1fffcb6eae6763faf842e5d95400870a87'],
    ['environment_class_and_permanent_basis_candidates.json', '80c00b56c27e115a1ca88d90478ff9c985d74b9aafb357fe10b49d515ac2bec7']
  ]) {
    const targetPath = `${candidate}/datasets/${file}`;
    const entry = artifacts.get(targetPath);
    assert.ok(entry, `${file} is part of the source-pinned package`);
    assert.equal(entry.source_sha256, sourceSha);
    assert.equal(sha256(await readFile(resolve(root, targetPath))), sourceSha, `${file} preserves approved source bytes`);
  }

  const rulesets = await read(`${candidate}/datasets/dynamic_environment_rule_sets.candidate.json`);
  const profiles = await read(`${candidate}/datasets/spatial_v3_transition_environment_profiles_v2.candidate.json`);
  const storageRefs = await read(`${candidate}/datasets/dynamic_environment_rule_set_storage_refs.json`);
  const vocab = await read(`${candidate}/datasets/environment_class_and_permanent_basis_candidates.json`);
  assert.equal(rulesets.length, 8);
  assert.equal(profiles.length, 8);
  assert.equal(storageRefs.length, 8);
  assert.deepEqual([vocab.environment_classes.length, vocab.permanent_cost_bases.length], [8, 8]);

  for (const profile of profiles) {
    assert.equal(profile.version, 2);
    assert.equal(profile.status, 'candidate');
    const ref = profile.dynamic_environment_rule_set_ref.entity_ref;
    const ruleset = rulesets.find((row) => row.id === ref.entity_id);
    assert.ok(ruleset, `${profile.id} has a matching ruleset`);
    assert.equal(ruleset.version, 1);
    assert.equal(ruleset.status, 'candidate');
    assert.equal(ruleset.subject_transition_environment_profile_ref.entity_ref.entity_id, profile.id);
    assert.equal(ruleset.subject_transition_environment_profile_ref.authoring_version, 'v2');
    assert.equal(ruleset.rules.length, 24);
    assert.equal(new Set(ruleset.rules.map((row) => `${row.weather_state_id}|${row.light_state_id}`)).size, 24);
    assert.equal(storageRefs.find((row) => row.transition_environment_profile.id === profile.id)
      .storage_columns.dynamic_environment_rule_set_id, ruleset.id);
  }

  assert.equal(manifest.constraints.light_effect, 'metadata_only');
  assert.equal(manifest.constraints.hazard_gap_activation, 'active_unresolved_applicable_condition_only');
  assert.equal(manifest.constraints.terrain_selector_execution, 'not_proven');
});
