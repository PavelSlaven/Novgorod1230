import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { computeSpatialV3CanonicalDigest } from '../packages/contracts/src/spatial-v3/registry.js';

const root = resolve(import.meta.dirname, '..');
const dir = 'data/world-catalogs/novgorod/m2c-npc/people-d49/d61-candidate';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(resolve(root, `${dir}/${file}`), 'utf8'));
const canonical = (row) => computeSpatialV3CanonicalDigest(row).slice(7);

export async function buildD61Candidate({ check = false } = {}) {
  const [candidateBytes, approval, sourceBase, source] = await Promise.all([
    readFile(resolve(root, `${dir}/candidate-source.json`)),
    json('approval-draft.json'), json('source-base.json'), json('candidate-source.json')
  ]);
  assert.equal(source.status, 'candidate_approval_pending');
  assert.equal(approval.status, 'candidate_approval_pending');
  assert.equal(approval.exact_candidate.path, `${dir}/candidate-source.json`);
  assert.equal(approval.exact_candidate.sha256, sha(candidateBytes));
  assert.equal(approval.resign_required, true);
  assert.equal(approval.import_authorized, false);
  assert.equal(approval.runtime_activation_authorized, false);

  const base = sourceBase.approved_profile_v2;
  const successorSpec = source.successor;
  assert.equal(base.id, successorSpec.id);
  assert.equal(base.version, successorSpec.from_version);
  assert.equal(base.status, 'approved');
  const payload = { ...base.payload, actor_applicability: successorSpec.actor_applicability };
  const maleCategories = new Set(successorSpec.actor_applicability.sex_category.map((id) => id.split('_').at(-1)));
  payload.clothing_variant_requirements = base.payload.clothing_variant_requirements
    .filter((variant) => variant.sex_categories.every((sex) => maleCategories.has(sex)));
  assert.ok(payload.clothing_variant_requirements.length > 0);
  const successor = { ...base, version: successorSpec.version, payload };

  const sourceRows = sourceBase.composition_rows_v2;
  const g4Ids = sourceRows.map((row) => row.g4_id).sort();
  assert.deepEqual(g4Ids, source.composition_g4_ids);
  assert.equal(sourceRows.length, 8);
  assert.ok(sourceRows.every((row) => row.version === successorSpec.from_version));
  const pendingRow = (row) => {
    const { canonical_digest: _old, ...withoutDigest } = row;
    const pending = { ...withoutDigest, status: 'candidate_approval_pending' };
    return { ...pending, canonical_digest: canonical(pending) };
  };
  const compositions = sourceRows.map((row) => {
    let refs = 0;
    const pending = { ...row, payload: { ...row.payload,
      weighted_profile_refs: row.payload.weighted_profile_refs.map((entry) => {
        if (entry.profile_ref.id !== successor.id) return entry;
        assert.equal(entry.profile_ref.version, base.version);
        refs += 1;
        return { ...entry, profile_ref: { ...entry.profile_ref, version: successor.version } };
      }) } };
    assert.equal(refs, 1, `${row.g4_id}: expected one foreign merchant @2 ref`);
    return pendingRow({ ...pending, version: successorSpec.version });
  });

  const baseAuthoring = (row) => ({ entity_kind: row.entity_kind, entity_id: row.id,
    version: row.version, world_revision_id: row.world_revision_id, status: row.status,
    canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref });
  const profiles = [base, pendingRow(successor)];
  const authoring = [baseAuthoring(base), ...[profiles[1], ...compositions].map(baseAuthoring)];
  const files = {
    'spatial_v3_npc_runtime_profiles.json': profiles,
    'spatial_v3_g4_npc_composition_bindings.json': compositions,
    'spatial_v3_authoring_versions.json': authoring
  };
  const bundle = {
    schema: 'rus.m2c_people_d61_candidate_bundle.v1',
    bundle_id: 'novgorod_m2c_people_d61_candidate',
    status: 'candidate_approval_pending',
    non_operational: true,
    import_authorized: false,
    runtime_activation_authorized: false,
    source_candidate: { path: `${dir}/candidate-source.json`, sha256: sha(candidateBytes),
      approval_path: `${dir}/approval-draft.json`, approval_sha256: sha(Buffer.from(`${JSON.stringify(approval, null, 2)}\n`)),
      resign_required: true },
    source_base_path: `${dir}/source-base.json`,
    base_operational_manifest_sha256: sourceBase.base_operational_manifest_sha256,
    datasets: Object.entries(files).map(([file, rows]) => ({ file, row_count: rows.length,
      sha256: sha(Buffer.from(`${JSON.stringify(rows, null, 2)}\n`)) })),
    limits: [
      'Review only; candidate bundle is not referenced by the v17 bootstrap or operational import manifest.',
      'Foreign merchant @2 and its female clothing variants remain unchanged; this bundle contains a pending @3 successor and eight G4 refs.',
      'Do not import or activate until independent approval explicitly authorizes that stage.'
    ]
  };
  const outputs = { ...files, 'bundle.json': bundle };
  for (const [file, value] of Object.entries(outputs)) {
    const path = resolve(root, `${dir}/${file}`);
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    if (check) assert.equal(await readFile(path, 'utf8'), bytes, `${dir}/${file}`);
    else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
  }
  return { out: dir, status: bundle.status, import_authorized: bundle.import_authorized,
    runtime_activation_authorized: bundle.runtime_activation_authorized,
    counts: Object.fromEntries(Object.entries(files).map(([key, rows]) => [key, rows.length])) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(JSON.stringify(await buildD61Candidate({ check: process.argv.includes('--check') })));
