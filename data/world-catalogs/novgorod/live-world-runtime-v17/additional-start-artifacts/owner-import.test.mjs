import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../../../../packages/contracts/src/spatial-v3/registry.js';
import { buildAdditionalStartOwnerRows } from './owner-import.mjs';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod';
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const one = (rows, label) => { assert.equal(rows.length, 1, label); return rows[0]; };

test('owner rows import approved observation profiles and select composition successor', async () => {
  const approval = await json(`${base}/m2c-npc/activity-observation/approval.json`);
  assert.equal(sha(await read(approval.candidate_path)), approval.candidate_sha256);
  const candidate = await json(approval.candidate_path);
  const rows = await buildAdditionalStartOwnerRows();
  assert.equal(rows.runtimeProfiles.length, 2);
  const activity = one(rows.runtimeProfiles.filter((row) => row.profile_kind === 'activity'), 'activity profile');
  const fisher = one(rows.runtimeProfiles.filter((row) => row.id === 'm2c_npc_fisher_v1'), 'Fisher @4');
  assert.equal(activity.id, candidate.canonical_records.activity_profile.id);
  assert.equal(activity.status, 'approved');
  assert.equal(activity.payload.status, 'approved');
  assert.equal(activity.payload.payload.status, 'approved');
  assert.equal(fisher.version, 4);
  assert.deepEqual(fisher.payload.activity_profile_ref,
    { id: activity.id, version: activity.version });
  assert.equal(fisher.status, 'approved');

  const compositionRef = candidate.lineage.composition_successor;
  const composition = one(rows.npc.filter((row) => row.id === compositionRef.id), 'selected composition');
  assert.equal(composition.version, compositionRef.version);
  assert.equal(composition.status, 'approved');
  assert.deepEqual(composition.payload.weighted_profile_refs.map(({ profile_ref }) => profile_ref), [
    { id: 'm2c_npc_fisher_v1', version: 4 },
    { id: 'm2c_npc_local_trader_v1', version: 1 },
    { id: 'm2c_npc_household_servant_v1', version: 1 }
  ]);
  assert.deepEqual(rows.authoring.filter(({ entity_id }) =>
    [activity.id, fisher.id, composition.id].includes(entity_id)).map(({ status, canonical_digest }) =>
    ({ status, canonical_digest })), [activity, fisher, composition].map((row) => ({
    status: 'approved', canonical_digest: computeSpatialV3CanonicalDigest(
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'canonical_digest'))).slice(7)
  })));
  assert.equal(rows.npc.filter((row) => row.id === composition.id).length, 1);
});
