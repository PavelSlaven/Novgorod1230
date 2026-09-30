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

const fresh = ({ canonical_digest: _old, ...row }) => digest(row);

/**
 * D49 people successor rows (candidate: m2c-npc/people-d49/candidate.json): three npc_binding profiles cloned from the
 * approved household-servant profile, one clothing profile, one canonical regional context and version-3 successors of
 * the fisher and servant profiles. Every value comes from the candidate or from existing approved rows.
 */
function peopleD49Rows(candidate, v1Profiles, v1Regional, v2Bindings, subjectApplicability) {
  const profile = (id) => v1Profiles.find((row) => row.id === id);
  const template = profile(candidate.template_profile);
  const clothingTemplate = profile(candidate.clothing_profile.template);
  const context = candidate.regional_context;
  const contextRef = (row) => ({ version: row.version, weight_basis: 'editorial_equal_choice_not_historical_frequency',
    gameplay_weight: 1, id: row.id });
  const clothing = fresh({ ...clothingTemplate, id: candidate.clothing_profile.id, version: candidate.clothing_profile.version,
    provenance_ref: candidate.provenance_ref,
    payload: { ...clothingTemplate.payload, id: candidate.clothing_profile.id, version: candidate.clothing_profile.version,
      allowed_role_refs: candidate.profiles.map((row) => row.role_ref).sort(),
      allowed_occupation_refs: candidate.profiles.map((row) => row.occupation_ref).sort() },
    });
  const regionalTemplate = v1Regional.find((row) => row.id === context.template);
  const regional = fresh({ ...regionalTemplate, id: context.id, version: context.version, provenance_ref: candidate.provenance_ref,
    payload: { ...regionalTemplate.payload, id: context.id, version: context.version,
      allowed_role_refs: [...new Set([...candidate.profiles.map((row) => row.role_ref), ...context.extra_role_refs])].sort(),
      allowed_occupation_refs: [...new Set([...candidate.profiles.map((row) => row.occupation_ref),
        ...context.extra_occupation_refs])].sort(),
      applicability: context.g4_ids.map((id) => ({ g4_ref: { world_revision_id: candidate.world_revision_id, id, version: 1 } })) },
    });
  const ctxRef = contextRef(regional);
  const profiles = candidate.profiles.map((spec) => {
    const activity = profile(spec.activity_profile_ref.id);
    const sex = spec.sex_category.map((id) => id.split('_').at(-1));
    const applicability = subjectApplicability.filter((entry) => [spec.role_ref, spec.occupation_ref].includes(entry.subject_id)
      && JSON.stringify(entry.actor_applicability.sex_category) === JSON.stringify(spec.sex_category)).map((entry) => entry.actor_applicability);
    assert.equal(applicability.length, 1, `${spec.id}: exactly one game-base subject_applicability with this sex`);
    const [{ sex_basis: sexBasis, confidence: sexConfidence }] = applicability;
    const refs = [...template.payload.runtime_profile_refs
      .filter((ref) => ref.id !== template.payload.activity_profile_ref.id && ref.id !== template.payload.clothing_profile_ref.id),
    spec.activity_profile_ref, { id: clothing.id, version: clothing.version }].sort((a, b) => a.id.localeCompare(b.id));
    return fresh({ ...template, id: spec.id, version: spec.version, role_ref: spec.role_ref, occupation_ref: spec.occupation_ref,
      provenance_ref: candidate.provenance_ref, 
      payload: { ...template.payload, profile_id: spec.id, actor_profile_rule_ref: spec.id, role_ref: spec.role_ref,
        occupation_ref: spec.occupation_ref, activity_profile_ref: spec.activity_profile_ref,
        clothing_profile_ref: { id: clothing.id, version: clothing.version }, runtime_profile_refs: refs,
        regional_context_refs: [ctxRef],
        actor_applicability: { sex_category: spec.sex_category, sex_basis: sexBasis, confidence: sexConfidence,
          source_refs: spec.source_refs },
        clothing_variant_requirements: template.payload.clothing_variant_requirements
          .filter((variant) => variant.sex_categories.every((category) => sex.includes(category))),
        observable_activity: { value: activity.payload.payload.editorial_reconstruction.task_focus,
          source_ref: activity.payload.record_id } } });
  });
  const successors = candidate.profile_successors.map((spec) => {
    const base = v2Bindings.find((row) => row.id === spec.id && row.version === spec.from_version);
    return fresh({ ...base, version: spec.version, 
      payload: { ...base.payload, regional_context_refs: [...base.payload.regional_context_refs, ctxRef] } });
  });
  return { profiles: [...profiles, clothing, ...successors], regional };
}

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
  const v1Regional = await json(`${catalog}/m2c-npc/datasets/spatial_v3_npc_regional_context_profiles.json`);
  const npcRegionalV2 = v1Regional
    .map((row) => {
      const next = { ...row, version: 2, payload: { ...row.payload, version: 2,
        applicability: row.payload.applicability.map((item) => item.generation_template_ref
          ? { ...item, generation_template_ref: { ...item.generation_template_ref, version: 2 } }
          : item) } };
      delete next.canonical_digest;
      return digest(next);
    });
  const v1Profiles = await json(`${catalog}/m2c-npc/datasets/spatial_v3_npc_runtime_profiles.json`);
  const npcBindingsV2 = v1Profiles
    .filter((row) => row.profile_kind === 'npc_binding')
    .map((row) => {
      const next = { ...row, version: 2, payload: { ...row.payload,
        regional_context_refs: row.payload.regional_context_refs.map((ref) =>
          ({ ...ref, version: 2 })) } };
      delete next.canonical_digest;
      return digest(next);
    });
  const peopleCandidatePath = `${catalog}/m2c-npc/people-d49/candidate.json`;
  const peopleBytes = await readFile(resolve(root, peopleCandidatePath));
  const people = JSON.parse(peopleBytes);
  const peopleApprovalPath = `${catalog}/m2c-npc/people-d49/approval.json`;
  const peopleApproval = await json(peopleApprovalPath);
  assert.ok(['APPROVE', 'APPROVE_WITH_LIMITS'].includes(peopleApproval.verdict));
  assert.ok(peopleApproval.approved_by);
  assert.equal(peopleApproval.exact_candidate.sha256, sha(peopleBytes));
  const { subject_applicability: subjectApplicability } = await json(
    `${catalog}/game-base-v1/occupations-activities/npc_runtime_profiles/npc_runtime_profiles.json`);
  const peopleRows = peopleD49Rows(people, v1Profiles, v1Regional, npcBindingsV2, subjectApplicability);
  const npcBindings = [...npcBindingsV2, ...peopleRows.profiles];
  const npcRegional = [...npcRegionalV2, peopleRows.regional];
  const overrides = new Map(people.g4_overrides.map((entry) => [entry.g4_id, entry]));
  const npcCompositions = (await json(`${catalog}/m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json`))
    .map((row) => {
      const floor = overrides.get(row.g4_id);
      if (floor) assert.equal(floor.count_weights.length, floor.max_count - floor.min_count + 1);
      const next = { ...row, version: 2, generation_template_version: 2,
        ...(floor ? { min_count: floor.min_count, max_count: floor.max_count } : {}),
        payload: { ...row.payload, ...(floor ? { count_weights: floor.count_weights } : {}),
          weighted_profile_refs: row.payload.weighted_profile_refs
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
      entity_id: row.id, version: row.version, world_revision_id: row.world_revision_id,
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
  sourceRecord.push({ id: people.provenance_ref, title: 'M2c D49 people: profiles, canonical regional context, G4 lower bound',
    source_type: 'project_note', file_reference: peopleCandidatePath, page_or_section: `candidate_sha256:${sha(peopleBytes)}`,
    summary: people.decision, limitations: 'Gameplay authoring; no historical frequency, origin or language claim. Awaits independent approval (people-d49/approval.json).',
    status: 'approved', confidence: 'low', checked_by: peopleApproval.approved_by });
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
