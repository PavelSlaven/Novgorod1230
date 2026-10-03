import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const digest = 'a'.repeat(64);
const g5 = { id: 'g5-family', version: 1, world_revision_id: 'target',
  canonical_digest: digest };
const scene = { id: 'scene-family', version: 1, world_revision_id: 'target',
  canonical_digest: digest };
const row = { id: 'quiet-slot', version: 1, world_revision_id: 'target',
  g5_template_id: g5.id, g5_template_version: g5.version,
  scene_template_id: scene.id, scene_template_version: scene.version,
  g6_scene_slot_key: 'outside', ambient_noise: 1, directness: 'analogical',
  confidence: 'low', status: 'approved', provenance_ref: 'source',
  canonical_digest: digest, authoring_status: 'approved',
  authoring_digest: digest, g5_template_status: 'approved',
  g5_template_digest: digest, g5_authoring_status: 'approved',
  g5_authoring_digest: digest, profile_status: 'approved',
  profile_authoring_status: 'approved', profile_digest: digest,
  profile_authoring_digest: digest, scene_template_status: 'approved',
  scene_basis_status: 'approved', scene_basis_digest: digest,
  scene_template_digest: digest, scene_authoring_status: 'approved',
  scene_authoring_digest: digest, acoustic_uniformity: 'uniform',
  world_revision_status: 'approved' };

function reader(rows) {
  const calls = [];
  return { calls, value: createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows };
  } }) };
}

test('G5 acoustic closure pins approved baseline for every returned G6 scene slot', async () => {
  const { calls, value } = reader([row]);
  const result = await value.readPinnedG5AcousticClosure({ g5_template: g5,
    scene_template: scene, world_revision_id: 'target' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.value.rows.map(({ g6_scene_slot_key, ambient_noise }) =>
    ({ g6_scene_slot_key, ambient_noise })), [{ g6_scene_slot_key: 'outside',
    ambient_noise: 1 }]);
  assert.equal(Object.isFrozen(result.value.rows[0]), true);
  assert.deepEqual(calls[0].params, [g5.id, g5.version, 'target', scene.id,
    scene.version, digest, digest]);
});

test('canonical G5 acoustic closure pins the exact approved G5 and its scene baseline', async () => {
  const canonicalG5 = { id: 'canonical-g5', version: 1,
    world_revision_id: 'target', canonical_digest: digest };
  const canonicalRow = { ...row, g5_template_id: null,
    g5_template_version: null, canonical_g5_id: canonicalG5.id,
    canonical_g5_version: canonicalG5.version,
    profile_id: 'canonical-profile', profile_version: 1,
    canonical_g5_status: 'approved', canonical_g5_digest: digest,
    canonical_g5_authoring_status: 'approved',
    canonical_g5_authoring_digest: digest };
  const { calls, value } = reader([canonicalRow]);
  const result = await value.readPinnedCanonicalG5AcousticClosure({
    canonical_g5: canonicalG5, scene_template: scene,
    world_revision_id: 'target' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.value.rows[0].canonical_g5_id, canonicalG5.id);
  assert.equal(result.value.rows[0].authoring_digest, digest);
  assert.deepEqual(calls[0].params, [canonicalG5.id, canonicalG5.version,
    'target', scene.id, scene.version, digest, digest]);
});

test('canonical G5 acoustic closure fails closed for missing rows and foreign revision pins', async () => {
  const canonicalG5 = { id: 'canonical-g5', version: 1,
    world_revision_id: 'target', canonical_digest: digest };
  const missing = reader([]);
  assert.equal((await missing.value.readPinnedCanonicalG5AcousticClosure({
    canonical_g5: canonicalG5, scene_template: scene,
    world_revision_id: 'target' })).ok, false);
  const wrongRevision = reader([row]);
  assert.equal((await wrongRevision.value.readPinnedCanonicalG5AcousticClosure({
    canonical_g5: { ...canonicalG5, world_revision_id: 'other' },
    scene_template: scene, world_revision_id: 'target' })).ok, false);
  assert.equal(wrongRevision.calls.length, 0);
});

test('G5 acoustic closure fails closed for missing, ambiguous, mismatched or invalid baselines', async () => {
  const missing = reader([]);
  assert.equal((await missing.value.readPinnedG5AcousticClosure({
    g5_template: g5, scene_template: scene,
    world_revision_id: 'target' })).ok, false);
  const ambiguous = reader([row, { ...row, g6_scene_slot_key: 'outside' }]);
  assert.equal((await ambiguous.value.readPinnedG5AcousticClosure({
    g5_template: g5, scene_template: scene,
    world_revision_id: 'target' })).ok, false);
  const invalid = reader([{ ...row, ambient_noise: 3 }]);
  assert.equal((await invalid.value.readPinnedG5AcousticClosure({
    g5_template: g5, scene_template: scene,
    world_revision_id: 'target' })).ok, false);
  const wrongRevision = reader([row]);
  assert.equal((await wrongRevision.value.readPinnedG5AcousticClosure({
    g5_template: { ...g5, world_revision_id: 'other' },
    scene_template: scene, world_revision_id: 'target' })).ok, false);
  assert.equal(wrongRevision.calls.length, 0);
});
