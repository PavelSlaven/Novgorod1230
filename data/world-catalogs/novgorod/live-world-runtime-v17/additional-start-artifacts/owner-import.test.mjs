import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../../../../packages/contracts/src/spatial-v3/registry.js';
import { assertAdditionalStartImportAuthorization, buildAdditionalStartOwnerRows } from './owner-import.mjs';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod';
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const one = (rows, label) => { assert.equal(rows.length, 1, label); return rows[0]; };

test('owner rows import approved activity and Fisher lineage successors', async () => {
  const approval = await json(`${base}/m2c-npc/activity-observation/approval.json`);
  assert.equal(sha(await read(approval.candidate_path)), approval.candidate_sha256);
  const candidate = await json(approval.candidate_path);
  const lineageApproval = await json(`${base}/m2c-npc/activity-observation-lineage-v2/approval.json`);
  assert.equal(sha(await read(lineageApproval.candidate_path)), lineageApproval.candidate_sha256);
  const lineageCandidate = await json(lineageApproval.candidate_path);
  const rows = await buildAdditionalStartOwnerRows();
  const importAuthorization = await json(`${base}/live-world-runtime-v17/additional-start-artifacts/owner-import-authorization.json`);
  const lineageAuthorization = await json(`${base}/live-world-runtime-v17/additional-start-artifacts/owner-import-authorization-v2.json`);
  assert.doesNotThrow(() => assertAdditionalStartImportAuthorization(
    importAuthorization, approval.candidate_sha256));
  assert.doesNotThrow(() => assertAdditionalStartImportAuthorization(
    lineageAuthorization, lineageApproval.candidate_sha256));
  assert.throws(() => assertAdditionalStartImportAuthorization(
    importAuthorization, '0'.repeat(64)), /V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_MISMATCH/u);
  assert.throws(() => assertAdditionalStartImportAuthorization(
    { ...importAuthorization, scope: 'production' }, approval.candidate_sha256),
  /V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_MISMATCH/u);
  assert.throws(() => assertAdditionalStartImportAuthorization(
    null, approval.candidate_sha256), /V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_MISMATCH/u);
  assert.throws(() => assertAdditionalStartImportAuthorization(
    { ...lineageAuthorization, production: true }, lineageApproval.candidate_sha256),
  /V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_MISMATCH/u);
  assert.equal(rows.runtimeProfiles.length, 3);
  const activity = one(rows.runtimeProfiles.filter((row) => row.profile_kind === 'activity'), 'activity profile');
  const fisher4 = one(rows.runtimeProfiles.filter((row) => row.id === 'm2c_npc_fisher_v1'
    && row.version === 4), 'Fisher @4');
  const fisher5 = one(rows.runtimeProfiles.filter((row) => row.id === 'm2c_npc_fisher_v1'
    && row.version === 5), 'Fisher @5');
  assert.equal(activity.id, candidate.canonical_records.activity_profile.id);
  assert.equal(activity.status, 'approved');
  assert.equal(activity.payload.status, 'approved');
  assert.equal(activity.payload.payload.status, 'approved');
  for (const fisher of [fisher4, fisher5]) {
    assert.deepEqual(fisher.payload.activity_profile_ref,
      { id: activity.id, version: activity.version });
    assert.equal(fisher.status, 'approved');
  }

  const compositionRef = lineageCandidate.lineage.composition_successor;
  const composition = one(rows.npc.filter((row) => row.id === compositionRef.id), 'selected composition');
  assert.equal(composition.version, compositionRef.version);
  assert.equal(composition.status, 'approved');
  assert.deepEqual(composition.payload.weighted_profile_refs.map(({ profile_ref }) => profile_ref), [
    { id: 'm2c_npc_fisher_v1', version: 5 },
    { id: 'm2c_npc_local_trader_v1', version: 1 },
    { id: 'm2c_npc_household_servant_v1', version: 1 }
  ]);
  for (const row of [activity, fisher4, fisher5, composition]) {
    const authored = one(rows.authoring.filter((entry) => entry.entity_kind === row.entity_kind
      && entry.entity_id === row.id && entry.version === row.version), `${row.id}@${row.version}`);
    assert.equal(authored.status, 'approved');
    assert.equal(authored.canonical_digest, computeSpatialV3CanonicalDigest(
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'canonical_digest'))).slice(7));
  }
  assert.equal(rows.npc.filter((row) => row.id === composition.id).length, 1);
});

test('authorized lineage binds newest Fisher to all regional scopes', async () => {
  const { runtimeProfiles } = await buildAdditionalStartOwnerRows();
  const fisher = runtimeProfiles.filter((row) => row.id === 'm2c_npc_fisher_v1')
    .sort((a, b) => b.version - a.version)[0];
  assert.equal(fisher.version, 5);
  const candidate = await json(`${base}/m2c-npc/activity-observation-lineage-v2/candidate.json`);
  assert.deepEqual(fisher.payload.regional_context_refs.map(({ id, version }) => ({ id, version })), [
    { id: 'm2c_npc_regional_novgorod_land_v1', version: 1 },
    { id: 'm2c_npc_regional_novgorod_land_v1', version: 2 },
    { id: 'm2c_npc_regional_novgorod_land_d2_v1', version: 1 }
  ]);
  assert.deepEqual(fisher.payload.regional_context_refs,
    candidate.canonical_records.fisher_binding_successor.payload.regional_context_refs);
});
