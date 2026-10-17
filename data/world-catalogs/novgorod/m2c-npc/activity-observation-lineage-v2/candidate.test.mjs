import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../../../../packages/contracts/src/spatial-v3/registry.js';
import { resolvePlacePeople } from '../../../../../packages/materialization/src/place-people-first-arrival.js';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod';
const here = `${base}/m2c-npc/activity-observation-lineage-v2`;
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ref = (row) => ({ id: row.id, version: row.version });

test('Fisher @5 preserves @4 observation and all three distinct regional scopes', async () => {
  const [candidate, manifest, previous, predecessorRows, oldRegions, newRegions] = await Promise.all([
    json(`${here}/candidate.json`), json(`${here}/artifact-manifest.json`),
    json(`${base}/m2c-npc/activity-observation/candidate.json`),
    json(`${base}/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_npc_runtime_profiles.json`),
    json(`${base}/m2c-npc/datasets/spatial_v3_npc_regional_context_profiles.json`),
    json(`${base}/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_npc_regional_context_profiles.json`)
  ]);
  const fisher = candidate.canonical_records.fisher_binding_successor;
  const composition = candidate.canonical_records.canonical_composition_successor;
  const old = previous.canonical_records.fisher_binding_successor;
  const predecessor = predecessorRows.find((row) => row.id === fisher.id && row.version === 3);
  assert.ok(predecessor);
  assert.equal(fisher.version, 5);
  assert.equal(composition.version, 3);
  assert.deepEqual(fisher.payload.activity_profile_ref, old.payload.activity_profile_ref);
  assert.deepEqual(fisher.payload.runtime_profile_refs, old.payload.runtime_profile_refs);
  assert.deepEqual(composition.payload.weighted_profile_refs.map(({ profile_ref }) => profile_ref), [
    { id: fisher.id, version: 5 }, { id: 'm2c_npc_local_trader_v1', version: 1 },
    { id: 'm2c_npc_household_servant_v1', version: 1 }
  ]);
  const refs = fisher.payload.regional_context_refs.map(ref);
  assert.deepEqual(refs, [
    { id: 'm2c_npc_regional_novgorod_land_v1', version: 1 },
    ...predecessor.payload.regional_context_refs.map(ref)
  ]);
  const withoutRegional = (row) => {
    const copy = structuredClone(row);
    delete copy.canonical_digest;
    delete copy.version;
    delete copy.provenance_ref;
    delete copy.payload.regional_context_refs;
    return copy;
  };
  assert.deepEqual(withoutRegional(fisher), withoutRegional(old));
  for (const row of [fisher, composition]) {
    const { canonical_digest: ignored, ...fields } = row;
    assert.equal(row.canonical_digest, computeSpatialV3CanonicalDigest(fields).slice(7));
  }
  for (const [path, digest] of Object.entries(manifest.input_sha256))
    assert.equal(sha(await read(path)), digest, path);
  for (const [path, digest] of Object.entries(manifest.artifact_sha256))
    assert.equal(sha(await read(`${here}/${path}`)), digest, path);
  const g4 = candidate.lineage.g4_ref;
  const region = (id, version) => [...oldRegions, ...newRegions]
    .find((row) => row.id === id && row.version === version);
  const applicable = refs.map(({ id, version }) => {
    const row = region(id, version);
    assert.ok(row, `${id}@${version}`);
    return row.payload.applicability.filter((entry) => entry.g4_ref?.id === g4.id
      && entry.g4_ref.version === g4.version);
  });
  const template = candidate.canonical_records.canonical_composition_successor.payload
    .canonical_source_generation_template_ref;
  assert.equal(template.version, 1);
  assert.deepEqual(applicable.map((entries) => entries.some((entry) =>
    entry.generation_template_ref?.id === template.id
      && entry.generation_template_ref.version === 1)), [true, false, false]);
  assert.deepEqual(applicable.map((entries) => entries.some((entry) =>
    entry.generation_template_ref?.id === template.id
      && entry.generation_template_ref.version === 2)), [false, true, false]);
  assert.deepEqual(applicable.map((entries) => entries.some((entry) =>
    entry.canonical_g5_ref == null && entry.generation_template_ref == null)), [false, false, true]);
  const selected = resolvePlacePeople({
    wanted: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_fisher', profile_id: fisher.id,
      place_family_id: 'pf_riverbank', group_id: 'pf_riverbank.shore_worker' }],
    candidates: [predecessor, old, fisher].map((row) => ({
      id: row.id, version: row.version, role_ref: row.role_ref, occupation_ref: row.occupation_ref
    })),
    bundle: { roles: [{ role_id: fisher.role_ref }], occupations: [{ occupation_id: fisher.occupation_ref }] },
    capacity: 1
  });
  assert.deepEqual(selected.gaps, []);
  assert.deepEqual(selected.people[0].profile_ref, { id: fisher.id, version: 5 });
});
