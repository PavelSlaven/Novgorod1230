import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeSpatialV3CanonicalDigest } from '../../../../../packages/contracts/src/spatial-v3/registry.js';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod';
const here = `${base}/live-world-runtime-v17/additional-start-artifacts`;
const observation = `${base}/m2c-npc/activity-observation`;
const importAuthorizationPath = `${here}/owner-import-authorization.json`;
const read = async (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const one = (rows, label) => { assert.equal(rows.length, 1, label); return rows[0]; };
const withDigest = (row) => ({ ...row, canonical_digest: computeSpatialV3CanonicalDigest(row).slice(7) });

export function assertAdditionalStartImportAuthorization(authorization, candidateSha256, ownerRows) {
  const expectedSuccessors = [
    'activity_m2c_npc_fisher_initial_work_observation_v1@1',
    'm2c_npc_fisher_v1@4',
    'm2c_g4_npc_composition_canonical_initial_novgorod_vikhtuy_work_storage_v1@2'
  ];
  if (authorization.approver !== '/root acting D49 lead'
      || authorization.date !== '2026-10-17'
      || authorization.scope !== 'new_isolated_D49_test_databases'
      || authorization.candidate_sha256 !== candidateSha256
      || authorization.runtime_selection !== true
      || authorization.production !== false
      || authorization.existing_databases !== false
      || JSON.stringify(authorization.successors) !== JSON.stringify(expectedSuccessors))
    throw new Error('V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_MISMATCH');
  const selected = [
    ...ownerRows.runtimeProfiles.filter((row) => row.id === 'activity_m2c_npc_fisher_initial_work_observation_v1'
      || row.id === 'm2c_npc_fisher_v1'),
    ...ownerRows.npc.filter((row) => row.id ===
      'm2c_g4_npc_composition_canonical_initial_novgorod_vikhtuy_work_storage_v1')
  ].map(({ id, version }) => `${id}@${version}`).sort();
  if (JSON.stringify(selected) !== JSON.stringify([...expectedSuccessors].sort()))
    throw new Error('V17_ADDITIONAL_START_IMPORT_AUTHORIZATION_ROWS_MISMATCH');
}

export async function assertAdditionalStartImportAuthorizationForRows(ownerRows) {
  const [authorization, approval] = await Promise.all([
    json(importAuthorizationPath), json(`${observation}/approval.json`)
  ]);
  assertAdditionalStartImportAuthorization(authorization, approval.candidate_sha256, ownerRows);
}

function approveDerivedRow(row) {
  const approved = structuredClone(row);
  approved.status = 'approved';
  if (approved.payload?.status === 'candidate_approval_pending') approved.payload.status = 'approved';
  if (approved.payload?.payload?.status === 'candidate_approval_pending') approved.payload.payload.status = 'approved';
  const { canonical_digest: ignoredDigest, ...fields } = approved;
  return withDigest(fields);
}

async function readApprovedActivityObservation() {
  const approval = await json(`${observation}/approval.json`);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval.subject, 'm2c_npc_activity_observation_v1');
  assert.equal(approval.import_authorized, false);
  const candidatePath = `${observation}/candidate.json`;
  const candidateBytes = await read(candidatePath);
  assert.equal(approval.candidate_path, candidatePath);
  assert.equal(sha(candidateBytes), approval.candidate_sha256);
  const manifest = await json(`${observation}/artifact-manifest.json`);
  assert.equal(manifest.candidate_id, approval.subject);
  assert.equal(manifest.artifact_sha256['candidate.json'], approval.candidate_sha256);
  const load = async (file) => {
    const bytes = await read(`${observation}/${file}`);
    assert.equal(sha(bytes), manifest.artifact_sha256[file], file);
    return JSON.parse(bytes);
  };
  const [profiles, compositions, versions] = await Promise.all([
    load('datasets/spatial_v3_npc_runtime_profiles.json'),
    load('datasets/spatial_v3_g4_npc_composition_bindings.json'),
    load('datasets/spatial_v3_authoring_versions.json')
  ]);
  const candidate = JSON.parse(candidateBytes);
  assert.deepEqual(profiles, [candidate.canonical_records.activity_profile,
    candidate.canonical_records.fisher_binding_successor]);
  assert.deepEqual(compositions, [candidate.canonical_records.canonical_composition_successor]);
  assert.deepEqual(versions, Object.values(candidate.canonical_records).map((row) => ({
    entity_kind: row.entity_kind, entity_id: row.id, version: row.version,
    world_revision_id: row.world_revision_id, status: row.status,
    canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref
  })));
  return { candidate, profiles, compositions, versions };
}

export async function buildAdditionalStartOwnerRows() {
  const approval = await json(`${here}/owner-coverage-data-approval.json`);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  const candidateBytes = await read(approval.candidate_path);
  assert.equal(sha(candidateBytes), approval.candidate_sha256);
  const candidate = JSON.parse(candidateBytes);
  assert.equal(candidate.starts.length, 6);
  const compositionPath = `${base}/m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json`;
  const acousticPath = `${base}/m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json`;
  const [compositionBytes, acousticBytes] = await Promise.all([read(compositionPath), read(acousticPath)]);
  assert.equal(sha(compositionBytes), approval.reviewed_source_sha256.m2c_npc_g4_compositions);
  assert.equal(sha(acousticBytes), approval.reviewed_source_sha256.m2c_acoustic_approved_baselines);
  const compositions = JSON.parse(compositionBytes);
  const acoustics = JSON.parse(acousticBytes);
  const sourceRecords = [
    one((await json(`${base}/m2c-npc/canonical-initial/datasets/source_records.json`))
      .filter((row) => row.id === 'm2c_npc_canonical_initial_editorial_001'), 'NPC provenance'),
    one((await json(`${base}/m2c-acoustic/approved/source_records.json`))
      .filter((row) => row.id === 'm2c_canonical_acoustic_editorial_001'), 'acoustic provenance')
  ];
  const npc = candidate.starts.map((start) => {
    const source = one(compositions.filter((row) => row.id === start.npc.source_composition_ref.id
      && row.version === start.npc.source_composition_ref.version), start.scenario_id);
    assert.equal(source.g4_id, start.g4_ref.id);
    assert.deepEqual([source.min_count, source.max_count], start.npc.source_count_range);
    assert.deepEqual(source.payload.weighted_profile_refs, start.npc.source_profile_refs);
    assert.deepEqual(source.payload.placement_policy.position_slot_order,
      start.npc.source_position_slot_order);
    const semantic = approval.semantic_npc_approval.find((row) => row.scenario_id === start.scenario_id);
    if (semantic) {
      assert.equal(start.npc.coverage, 'semantic_candidate_required');
      assert.deepEqual(semantic.count_range, [source.min_count, source.max_count]);
      assert.deepEqual(semantic.profile_ids,
        source.payload.weighted_profile_refs.map((row) => row.profile_ref.id));
      assert.deepEqual(semantic.position_slot_order, source.payload.placement_policy.position_slot_order);
    } else assert.equal(start.npc.coverage, 'mechanical_scene_match_pending_canonical_binding');
    const { canonical_digest: ignoredDigest, ...fields } = source;
    return withDigest({ ...fields,
      id: `m2c_g4_npc_composition_canonical_initial_${start.scenario_id}`,
      generation_template_id: null, generation_template_version: null,
      canonical_g5_id: start.canonical_g5_ref.id,
      canonical_g5_version: start.canonical_g5_ref.version,
      payload: { ...source.payload, canonical_initial_snapshot_only: true,
        canonical_source_generation_template_ref: start.npc.generation_template_ref },
      directness: semantic ? 'approved_gameplay_composition_transfer' : 'mechanical_gameplay_composition_reuse',
      provenance_ref: 'm2c_npc_canonical_initial_editorial_001' });
  });
  const activityObservation = await readApprovedActivityObservation();
  const selectedStart = one(candidate.starts.filter((start) =>
    start.scenario_id === activityObservation.candidate.lineage.active_composition.scenario_id),
  'activity observation scenario');
  const selectedComposition = one(activityObservation.compositions.filter((row) =>
    row.id === activityObservation.candidate.lineage.composition_successor.id
      && row.version === activityObservation.candidate.lineage.composition_successor.version),
  'approved activity observation composition');
  assert.equal(selectedComposition.g4_id, selectedStart.g4_ref.id);
  assert.equal(selectedComposition.g4_version, selectedStart.g4_ref.version);
  assert.equal(selectedComposition.canonical_g5_id, selectedStart.canonical_g5_ref.id);
  assert.equal(selectedComposition.canonical_g5_version, selectedStart.canonical_g5_ref.version);
  const compositionIndex = npc.findIndex((row) => row.id === selectedComposition.id);
  assert.notEqual(compositionIndex, -1, 'activity observation composition identity');
  npc[compositionIndex] = approveDerivedRow(selectedComposition);
  const runtimeProfiles = activityObservation.profiles.map(approveDerivedRow);
  assert.equal(runtimeProfiles.length, 2);
  const acoustic = candidate.starts.filter((start) => start.acoustic.coverage !== 'exact_approved')
    .map((start) => {
      const semantic = approval.semantic_acoustic_approval.scenario_id === start.scenario_id;
      const source = semantic ? null : one(acoustics.filter((row) => row.id ===
        start.acoustic.generated_source_row_refs[0]?.id), start.scenario_id);
      if (semantic) assert.equal(start.acoustic.coverage, 'semantic_candidate_required');
      else assert.equal(start.acoustic.coverage,
        'mechanical_scene_and_ambient_match_pending_canonical_binding');
      return withDigest({ entity_kind: 'g6_acoustic_baseline',
        id: `m2c_acoustic_canonical__${start.canonical_g5_ref.id}__main`, version: 1,
        world_revision_id: source?.world_revision_id ?? npc[0].world_revision_id,
        canonical_g5_id: start.canonical_g5_ref.id,
        canonical_g5_version: start.canonical_g5_ref.version,
        scene_template_id: start.scene_template_ref.id,
        scene_template_version: start.scene_template_ref.version,
        g6_scene_slot_key: 'main',
        ambient_noise: semantic ? approval.semantic_acoustic_approval.ambient_noise : source.ambient_noise,
        directness: semantic ? 'approved_gameplay_acoustic_baseline' : 'mechanical_acoustic_baseline_reuse',
        confidence: 'low', status: 'approved',
        provenance_ref: 'm2c_canonical_acoustic_editorial_001' });
    });
  const capacityApproval = await json(`${base}/live-world-runtime-v17/capacity-v2-start-successors/data-approval.json`);
  assert.equal(capacityApproval.decision, 'APPROVE_DATA_ONLY');
  for (const source of ['capacity_candidate', 'capacity_approval', 'scene_templates']
    .map((key) => capacityApproval.source_pins[key]))
    assert.equal(sha(await read(source.path)), source.sha256, source.path);
  const capacityManifest = await json(`${base}/m2c-open-capacity-v2-import-manifest.json`);
  const acousticManifest = await json(`${base}/m2c-acoustic-import-manifest.json`);
  const dataset = async (manifest, table) => {
    const entry = one(manifest.datasets.filter((row) => row.table === table), table);
    const path = `${base}/${entry.file}`;
    const bytes = await read(path);
    assert.equal(sha(bytes), entry.sha256, path);
    return JSON.parse(bytes);
  };
  const [oldScenes, newScenes, oldSlots, newSlots] = await Promise.all([
    dataset(acousticManifest, 'spatial_v3_scene_templates'),
    dataset(capacityManifest, 'spatial_v3_scene_templates'),
    dataset(acousticManifest, 'spatial_v3_g6_template_slots'),
    dataset(capacityManifest, 'spatial_v3_g6_template_slots')
  ]);
  const acousticSuccessors = acoustic.map((row) => {
    const oldScene = one(oldScenes.filter((scene) => scene.id === row.scene_template_id && scene.version === 1), row.id);
    const newScene = one(newScenes.filter((scene) => scene.id === row.scene_template_id && scene.version === 2), row.id);
    assert.deepEqual(newScene, { ...oldScene, version: 2 });
    const oldSlot = one(oldSlots.filter((slot) => slot.scene_template_id === row.scene_template_id
      && slot.scene_template_version === 1 && slot.scene_slot_key === row.g6_scene_slot_key), row.id);
    const newSlot = one(newSlots.filter((slot) => slot.scene_template_id === row.scene_template_id
      && slot.scene_template_version === 2 && slot.scene_slot_key === row.g6_scene_slot_key), row.id);
    assert.deepEqual(newSlot, { ...oldSlot, scene_template_version: 2 });
    const { canonical_digest: ignoredDigest, ...fields } = row;
    return withDigest({ ...fields, version: 2, scene_template_version: 2 });
  });
  acoustic.push(...acousticSuccessors);
  assert.equal(approval.semantic_npc_approval.length, 4);
  assert.equal(npc.length, 6);
  assert.equal(acoustic.length, 4);
  const authoring = [...runtimeProfiles, ...npc, ...acoustic].map((row) => ({ entity_kind: row.entity_kind,
    entity_id: row.id, version: row.version, world_revision_id: row.world_revision_id,
    status: row.status, canonical_digest: row.canonical_digest,
    provenance_ref: row.provenance_ref }));
  return { sourceRecords, authoring, npc, runtimeProfiles, acoustic };
}
