import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const digest = 'a'.repeat(64);
const g4 = { id: 'g4', version: 1, world_revision_id: 'target', canonical_digest: digest };
const canonical_g5 = { id: 'g5a', version: 1 };
// One joined row: the binding version, its profile, and the authoring digests of both.
const row = (id, version, profileVersion, overrides = {}) => ({ binding_id: id, binding_version: version,
  parent_g4_id: 'g4', parent_g4_version: 1, from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1,
  to_canonical_g5_id: `to_${id}`, to_canonical_g5_version: 1, connection_profile_id: 'prof',
  connection_profile_version: profileVersion, from_scene_endpoint_slot_key: 'departure',
  to_scene_endpoint_slot_key: 'arrival', binding_status: 'approved', profile_id: 'prof', profile_version: profileVersion,
  profile_scope: 'site_connection', passage_type_id: 'passage.local', profile_status: 'approved',
  availability_condition_set_ref: profileVersion === 1 ? 'availability.local_state_conditional@1' : null,
  profile_digest: digest, profile_authoring_digest: digest, ...overrides });
const readerWith = (rows) => {
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows };
  } });
  return { reader, calls };
};

test('the highest approved version whose profile has no condition wins, per binding id', async () => {
  const { reader, calls } = readerWith([row('b1', 1, 1), row('b1', 2, 2), row('b2', 1, 1), row('b2', 2, 2)]);
  const result = await reader.readApprovedCanonicalG5Connections({ g4, canonical_g5 });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.value.map(({ binding }) => [binding.id, binding.version, binding.to_canonical_g5_id]),
    [['b1', 2, 'to_b1'], ['b2', 2, 'to_b2']]);
  assert.equal(result.value[0].profile.availability_condition_set_ref, null);
  assert.equal(result.value[0].profile.id, 'prof');
  assert.equal(result.value[0].profile.canonical_digest, digest, 'the traversal owner needs the profile digest');
  assert.deepEqual(calls[0].params, ['g4', 1, 'target', 'g5a', 1]);
  assert.match(calls[0].sql, /spatial_v3_canonical_g5_connection_bindings/u);
  assert.equal(Object.isFrozen(result.value), true);
});

test('a binding with only conditional profile versions is a typed gap, never a silent skip', async () => {
  const { reader } = readerWith([row('b1', 1, 1), row('b2', 1, 1), row('b2', 2, 2)]);
  const result = await reader.readApprovedCanonicalG5Connections({ g4, canonical_g5 });
  assert.equal(result.ok, false);
  assert.equal(result.error.diagnostics.reason, 'canonical_connection_profile_unusable');
});

test('unapproved rows, digest drift and inexact pins are refused; no rows is an empty list', async () => {
  assert.equal((await readerWith([row('b1', 2, 2, { profile_status: 'retired' })]).reader
    .readApprovedCanonicalG5Connections({ g4, canonical_g5 })).ok, false);
  assert.equal((await readerWith([row('b1', 2, 2, { profile_authoring_digest: 'b'.repeat(64) })]).reader
    .readApprovedCanonicalG5Connections({ g4, canonical_g5 })).ok, false);
  assert.equal((await readerWith([row('b1', 2, 2, { profile_scope: 'world_route_segment' })]).reader
    .readApprovedCanonicalG5Connections({ g4, canonical_g5 })).ok, false);
  const inexact = readerWith([]);
  assert.equal((await inexact.reader.readApprovedCanonicalG5Connections({ g4: { id: 'g4' }, canonical_g5 })).ok, false);
  assert.equal(inexact.calls.length, 0);
  const empty = await readerWith([]).reader.readApprovedCanonicalG5Connections({ g4, canonical_g5 });
  assert.deepEqual([empty.ok, empty.value], [true, []]);
});

test('a place named without a scene pin is read at the release scene generation, a pinned one as pinned', async () => {
  const seen = [];
  const readerAt = (generatedTemplateVersion) => createSpatialV3WorldBaseReader({ generatedTemplateVersion,
    query: async (sql, params) => { seen.push(params); return { rows: [] }; } });
  const place = { id: 'g5a', version: 1, world_revision_id: 'target' };
  await readerAt(2).readPinnedCanonicalG5SceneBinding(place);
  await readerAt(1).readPinnedCanonicalG5SceneBinding(place);
  await readerAt(2).readPinnedCanonicalG5SceneBinding({ ...place, scene_template_ref: { id: 's', version: 1 } });
  await readerAt(2).readPinnedCanonicalG5SceneBinding({ ...place, scene_materialization_profile_ref: { id: 'p', version: 1 } });
  assert.deepEqual(seen.map((params) => params[7]), [2, 1, null, null]);
});
