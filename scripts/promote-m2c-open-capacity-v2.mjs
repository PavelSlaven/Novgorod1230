import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { computeSpatialV3CanonicalDigest } from '../packages/contracts/src/spatial-v3/registry.js';

const root = resolve(import.meta.dirname, '..');
const catalog = 'data/world-catalogs/novgorod';
const source = `${catalog}/m2c-scene-movement-edges`;
const base = `${catalog}/spatial-v3/candidates/m2c-g4-expansion-v1/datasets`;
const out = `${source}/open-capacity-v2-import`;
const manifestPath = `${catalog}/m2c-open-capacity-v2-import-manifest.json`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(resolve(root, path)));
const version = (row, field = 'scene_template_version') => ({ ...row, [field]: 2 });
const digest = (row) => ({ ...row, canonical_digest: computeSpatialV3CanonicalDigest(row).slice(7) });

export async function promoteM2cOpenCapacity({ check = false } = {}) {
  const candidatePath = `${source}/open-capacity-v2-candidate.json`;
  const candidateBytes = await readFile(resolve(root, candidatePath));
  const approval = await json(`${source}/open-capacity-v2-data-approval.json`);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval.exact_candidate.sha256, sha(candidateBytes));
  const candidate = JSON.parse(candidateBytes);
  assert.equal(candidate.scene_position_templates.length, 51);
  assert.equal(candidate.scene_movement_edge_templates.length, 68);
  const sourceManifestPath = `${catalog}/m2c-acoustic-import-manifest.json`;
  const sourceManifest = await json(sourceManifestPath);
  const old = async (table) => json(`${base}/${table}.json`);
  const scenes = (await old('spatial_v3_scene_templates')).map((row) => version(row, 'version'));
  const g6 = (await old('spatial_v3_g6_template_slots')).map((row) => version(row));
  const endpoints = (await old('spatial_v3_scene_endpoint_slots')).map((row) => version(row));
  const profiles = (await old('spatial_v3_scene_materialization_profiles')).map((row) => ({
    ...version(row, 'version'),
    source_entity_version: row.source_kind === 'g5_generation_template' ? 2 : row.source_entity_version,
  }));
  const profileKeys = new Set(profiles.map((row) => row.id));
  const candidates = (await old('spatial_v3_scene_materialization_candidates'))
    .filter((row) => profileKeys.has(row.profile_id))
    .map((row) => ({ ...row, profile_version: 2, scene_template_version: 2 }));
  const generated = (await old('spatial_v3_g5_generation_templates')).map((row) => ({
    ...row, version: 2, scene_materialization_profile_version: 2,
  }));
  const limits = (await old('spatial_v3_expansion_profile_template_limits'))
    .map((row) => version(row, 'template_version'));
  const slotTemplates = (await old('spatial_v3_expansion_slot_templates'))
    .map((row) => version(row, 'template_version'));
  const successors = (await old('spatial_v3_g5_successor_frontier_rules'))
    .map((row) => version(row, 'g5_template_version'));
  const npcRegional = (await json(`${catalog}/m2c-npc/datasets/spatial_v3_npc_regional_context_profiles.json`))
    .map((row) => {
      const next = { ...row, version: 2, payload: { ...row.payload, version: 2,
        applicability: row.payload.applicability.map((item) => item.generation_template_ref
          ? { ...item, generation_template_ref: { ...item.generation_template_ref, version: 2 } }
          : item) } };
      delete next.canonical_digest;
      return digest(next);
    });
  const npcBindings = (await json(`${catalog}/m2c-npc/datasets/spatial_v3_npc_runtime_profiles.json`))
    .filter((row) => row.profile_kind === 'npc_binding')
    .map((row) => {
      const next = { ...row, version: 2, payload: { ...row.payload,
        regional_context_refs: row.payload.regional_context_refs.map((ref) =>
          ({ ...ref, version: 2 })) } };
      delete next.canonical_digest;
      return digest(next);
    });
  const npcCompositions = (await json(`${catalog}/m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json`))
    .map((row) => {
      const next = { ...row, version: 2, generation_template_version: 2,
        payload: { ...row.payload, weighted_profile_refs: row.payload.weighted_profile_refs
          .map((entry) => ({ ...entry, profile_ref: { ...entry.profile_ref, version: 2 } })) } };
      delete next.canonical_digest;
      return digest(next);
    });
  const acoustics = (await json(`${catalog}/m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json`))
    .map((row) => {
      const next = { ...row, version: 2, scene_template_version: 2 };
      if (typeof next.g5_template_id === 'string') next.g5_template_version = 2;
      delete next.canonical_digest;
      return digest(next);
    });
  const movement = (await json(`${source}/local-movement-eligibility-v1/datasets/spatial_v3_local_movement_eligibility_profiles.json`))
    .map((row) => {
      const next = { ...row, version: 2, scene_template_version: 2 };
      delete next.canonical_digest;
      return digest(next);
    });
  const authoring = [
    ...scenes.map((row) => ({ entity_kind: 'scene_template', entity_id: row.id, version: 2,
      world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
    ...profiles.map((row) => ({ entity_kind: 'scene_materialization_profile', entity_id: row.id,
      version: 2, world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
    ...generated.map((row) => ({ entity_kind: 'g5_generation_template', entity_id: row.id,
      version: 2, world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
    ...npcCompositions.map((row) => ({ entity_kind: row.entity_kind, entity_id: row.id,
      version: 2, world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
    ...[...npcBindings, ...npcRegional].map((row) => ({ entity_kind: row.entity_kind,
      entity_id: row.id, version: 2, world_revision_id: row.world_revision_id,
      status: row.status, canonical_digest: row.canonical_digest,
      provenance_ref: row.provenance_ref })),
    ...acoustics.map((row) => ({ entity_kind: row.entity_kind, entity_id: row.id,
      version: 2, world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
    ...movement.map((row) => ({ entity_kind: row.entity_kind, entity_id: row.id,
      version: 2, world_revision_id: row.world_revision_id, status: row.status,
      canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref })),
  ];
  const replacements = new Map([
    ['spatial_v3_scene_templates', scenes],
    ['spatial_v3_g6_template_slots', g6],
    ['spatial_v3_scene_position_templates', candidate.scene_position_templates],
    ['spatial_v3_scene_endpoint_slots', endpoints],
    ['spatial_v3_scene_movement_edge_templates', candidate.scene_movement_edge_templates],
    ['spatial_v3_scene_materialization_profiles', profiles],
    ['spatial_v3_scene_materialization_candidates', candidates],
    ['spatial_v3_g5_generation_templates', generated],
    ['spatial_v3_expansion_profile_template_limits', limits],
    ['spatial_v3_expansion_slot_templates', slotTemplates],
    ['spatial_v3_g5_successor_frontier_rules', successors],
    ['spatial_v3_g4_npc_composition_bindings', npcCompositions],
    ['spatial_v3_npc_runtime_profiles', npcBindings],
    ['spatial_v3_npc_regional_context_profiles', npcRegional],
    ['spatial_v3_g6_acoustic_baselines', acoustics],
    ['spatial_v3_local_movement_eligibility_profiles', movement],
    ['spatial_v3_authoring_versions', authoring],
  ]);
  const provenance = 'm2c_open_capacity_v2_approved';
  const sourceRecord = [...await json(`${source}/local-movement-eligibility-v1/datasets/source_records.json`),
    ...(await json(`${catalog}/m2c-npc/datasets/source_records.json`)).filter((row) =>
      row.id === 'm2c_npc_editorial_001'),
    { id: provenance, title: 'M2c open capacity successor',
    source_type: 'project_note', file_reference: candidatePath,
    page_or_section: `candidate_sha256:${sha(candidateBytes)}`,
    summary: 'Approved open G6 positions and nonportal local edges with mechanical capacity successor.',
    limitations: 'No historical occupancy claim or committed scene migration.',
    status: 'approved', confidence: 'high', checked_by: approval.reviewer }];
  replacements.set('source_records', sourceRecord);
  const sourceEntry = new Map(sourceManifest.datasets.map((row) => [row.table, row]));
  const manifest = { ...sourceManifest, bundle_id: 'novgorod_m2c_open_capacity_v2_import',
    provenance_ref: `${source}/open-capacity-v2-data-approval.json`, datasets: [] };
  const shared = new Set(['spatial_v3_nodes', 'spatial_v3_regional_scene_template_bases',
    'spatial_v3_scene_applicability_rules']);
  const order = sourceManifest.datasets.map((row) => row.table)
    .filter((table) => replacements.has(table) || shared.has(table));
  order.push('spatial_v3_g4_npc_composition_bindings');
  order.push('spatial_v3_npc_runtime_profiles', 'spatial_v3_npc_regional_context_profiles');
  order.push('spatial_v3_local_movement_eligibility_profiles');
  const registry = await json('data/contracts/spatial-v3/world-base-import-registry.v1.json');
  const rank = new Map(registry.dependency_order.flat().map((table, index) => [table, index]));
  order.sort((left, right) => rank.get(left) - rank.get(right));
  for (const table of order) {
    const prior = sourceEntry.get(table);
    const additions = replacements.get(table);
    if (!additions) { manifest.datasets.push({ ...prior,
      depends_on: prior.depends_on.filter((dependency) => order.includes(dependency)) }); continue; }
    const rows = additions;
    const path = `${out}/${table}.json`;
    const bytes = `${JSON.stringify(rows, null, 2)}\n`;
    if (check) assert.equal(await readFile(resolve(root, path), 'utf8'), bytes, path);
    else { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), bytes); }
    manifest.datasets.push({ table, file: `${source.slice(catalog.length + 1)}/open-capacity-v2-import/${table}.json`,
      sha256: sha(bytes), status: 'approved', provenance_ref: provenance, delete_policy: 'forbid',
      depends_on: (prior?.depends_on ?? ['spatial_v3_authoring_versions'])
        .filter((dependency) => order.includes(dependency)) });
  }
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (check) assert.equal(await readFile(resolve(root, manifestPath), 'utf8'), bytes);
  else await writeFile(resolve(root, manifestPath), bytes);
  return { manifestPath, counts: Object.fromEntries([...replacements].map(([key, value]) => [key, value.length])) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(JSON.stringify(await promoteM2cOpenCapacity({ check: process.argv.includes('--check') })));
