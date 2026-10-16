import { createHash } from 'node:crypto';
import { validateG4NaturalProfile } from '../../../packages/materialization/src/g4-natural-baseline.js';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Builds reviewable rows only; the existing approval/import workflow owns writes. */
export function buildG4NaturalCompiledRecords({ candidate, candidateBytes, approvedCandidateBytes, approval,
  approvedSceneRepins } = {}) {
  if (candidateBytes != null) {
    if (typeof candidateBytes !== 'string'
      || approval?.schema !== 'rus.m2c_nature_successor_data_approval.v1'
      || approval.decision !== 'APPROVE_AUTHORING_DATA_ONLY'
      || typeof approvedCandidateBytes !== 'string'
      || createHash('sha256').update(approvedCandidateBytes).digest('hex') !== approval.candidates?.natural?.sha256
      || canonicalStringify(stripDerivedNatural(JSON.parse(candidateBytes)))
        !== canonicalStringify(JSON.parse(approvedCandidateBytes))) {
      throw new TypeError('Exact independently approved natural successor bytes are required.');
    }
    candidate = JSON.parse(candidateBytes);
  }
  if (!['natural_baseline_authoring_candidate', 'natural_baseline_successor_authoring_candidate'].includes(candidate?.artifact_type)
    || !Array.isArray(candidate.natural_profiles) || !candidate.natural_profiles.length) {
    throw new TypeError('Natural baseline authoring candidate is required.');
  }
  if (candidate.artifact_type === 'natural_baseline_successor_authoring_candidate'
    && (candidateBytes == null || candidate.version !== 2
      || candidate.source_pins?.richness?.sha256 !== approval.provenance?.approved_richness_candidate_sha256)) {
    throw new TypeError('Exact independently approved natural successor bytes are required.');
  }
  const source_pack_digest = digest(candidate); const seen = new Set();
  const sourceSha256 = candidateBytes == null ? null : approval.candidates.natural.sha256;
  return candidate.natural_profiles.map((profile, profileIndex) => {
    const successor = candidate.artifact_type === 'natural_baseline_successor_authoring_candidate';
    const compiled = successor ? deriveNaturalSuccessorProfile(profile, profileIndex, candidate.frequency_weight_policy, sourceSha256) : profile;
    for (const sceneId of approvedSceneRepins?.get(profile.g4_ref.id) ?? []) {
      if (!successor || !compiled.exact_scene_features.canonical_scene_template_refs.includes(`${sceneId}@1`)) {
        throw new TypeError('Exact approved natural scene repin source is required.');
      }
      compiled.exact_scene_features.canonical_scene_template_refs.push(`${sceneId}@2`);
    }
    validateG4NaturalProfile(compiled);
    const key = `${profile.g4_ref.id}@${profile.g4_ref.version}`;
    if (profile.g4_ref.world_revision_id !== candidate.target.world_revision_id || seen.has(key)) {
      throw new TypeError('Natural profiles require unique exact G4 pins in the target world.');
    }
    seen.add(key);
    const payload = { schema: 'rus.g4_natural_baseline_profile.v1',
      profile_id: compiled.profile_id, profile_version: compiled.profile_version,
      g4_ref: structuredClone(compiled.g4_ref),
      exact_scene_features: structuredClone(compiled.exact_scene_features),
      natural_profile: structuredClone(compiled.natural_profile) };
    return { record_id: `profile:${profile.profile_id}`, version: profile.profile_version,
      record_kind: 'profile', family_candidate_ref: null, payload,
      payload_digest: digest(payload), source_pack_digest,
      status: 'approved_authoring_not_runtime_selectable' };
  }).sort((a, b) => a.record_id.localeCompare(b.record_id));
}

/** Approved capacity starts authorize only their exact G4 and scene-version pairs. */
export function deriveApprovedNaturalSceneRepins({ capacityApproval, startBytesByPath,
  sceneTemplateBytes, placementCandidateBytes, placementApproval } = {}) {
  const sha = (bytes) => typeof bytes === 'string'
    ? createHash('sha256').update(bytes).digest('hex') : null;
  if (capacityApproval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || capacityApproval.decision !== 'APPROVE_DATA_ONLY'
    || sha(sceneTemplateBytes) !== capacityApproval.source_pins?.scene_templates?.sha256
    || capacityApproval.approved_successors?.length !== 7) {
    throw new TypeError('Exact approved capacity scene repin sources are required.');
  }
  const scenes = JSON.parse(sceneTemplateBytes);
  const repins = new Map();
  for (const row of capacityApproval.approved_successors) {
    const bytes = startBytesByPath?.get(row.start.path);
    if (sha(bytes) !== row.start.sha256) throw new TypeError('Exact approved capacity start bytes are required.');
    const start = JSON.parse(bytes);
    const g4 = start.initial_placement?.g4_ref;
    const scene = start.initial_placement?.scene_template_ref;
    if (start.scenario_id !== row.scenario_id || !g4?.id || g4.version !== 1
      || !scene?.id || scene.version !== 2
      || scenes.filter((entry) => entry.id === scene.id && entry.version === 2).length !== 1) {
      throw new TypeError('Exact approved capacity scene and G4 refs are required.');
    }
    const refs = repins.get(g4.id) ?? new Set();
    refs.add(scene.id);
    repins.set(g4.id, refs);
  }
  if (placementCandidateBytes != null) {
    if (sha(placementCandidateBytes) !== placementApproval?.approved_exact_candidates?.natural_placement_sha256
      || placementApproval?.decision !== 'APPROVE_DATA_ONLY') {
      throw new TypeError('Exact approved natural placement source is required.');
    }
    const placements = JSON.parse(placementCandidateBytes).placements;
    for (const placement of placements) {
      const scene = placement.scene_template_ref;
      if (scene?.version !== 1 || scenes.filter((entry) => entry.id === scene.id
        && entry.version === 2 && entry.canonical_digest === scene.canonical_digest).length !== 1) {
        throw new TypeError('Exact approved capacity scene pair is required.');
      }
      const refs = repins.get(placement.g4_ref.id) ?? new Set();
      refs.add(scene.id);
      repins.set(placement.g4_ref.id, refs);
    }
  }
  return repins;
}

function stripDerivedNatural(candidate) {
  const copy = structuredClone(candidate);
  delete copy.frequency_weight_policy;
  for (const profile of copy.natural_profiles) {
    for (const layer of Object.values(profile.natural_profile.layer_applicability)) {
      for (const member of layer.alternatives ?? []) {
        delete member.source_candidate_ref;
        delete member.frequency_category;
      }
    }
    for (const rows of Object.values(profile.natural_profile.season_matrix)) {
      for (const row of Object.values(rows)) {
        delete row.mandatory_member_refs;
        delete row.excluded_candidate_refs;
        delete row.incompatibility;
        for (const member of row.members) {
          delete member.frequency_category;
          delete member.editorial_weight;
          delete member.season_eligibility;
        }
      }
    }
  }
  return copy;
}

/** Derives only type-level layer/season rows; source-state gaps stay in authoring. */
export function deriveNaturalSuccessorProfile(profile, profileIndex, frequencyWeightPolicy, sourceSha256) {
  const compiled = structuredClone(profile);
  if (!frequencyWeightPolicy?.weights || !Number.isSafeInteger(frequencyWeightPolicy.version)
    || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new TypeError('Approved successor frequency weight policy is required.');
  }
  compiled.natural_profile.frequency_weight_policy = structuredClone(frequencyWeightPolicy);
  const layers = compiled.natural_profile.layer_applicability;
  const source = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
  for (const [season, rows] of Object.entries(compiled.natural_profile.season_matrix)) {
    for (const [name, row] of Object.entries(rows)) {
      const layer = layers[name];
      if (classifyNaturalSuccessorRow(name, layer) !== 'derived_layer_season') {
        delete rows[name];
        continue;
      }
      row.incompatibility = { status: 'resolved', member_refs: [] };
      row.source_condition = 'derived_layer_season';
      row.evidence = { layer_ref: `${source}#natural_profiles/${profileIndex}/natural_profile/layer_applicability/${name}`,
        season_window: season, source_candidate_sha256: sourceSha256 };
      const alternatives = new Map((layer.alternatives ?? []).map((member) => [member.id, member]));
      for (const member of row.members) {
        if (member.season_eligibility?.status === 'unresolved_machine_condition') {
          const kind = alternatives.get(member.member_ref)?.kind;
          if (!['flora', 'material', 'fungi', 'fauna'].includes(kind)) {
            throw new TypeError('Only supported natural members can be derived from layer and season.');
          }
          member.eligibility = 'derived_layer_season';
          member.season_eligibility = { ...member.season_eligibility,
            status: 'derived_layer_season', evidence: structuredClone(row.evidence) };
        }
      }
    }
  }
  return compiled;
}

export function classifyNaturalSuccessorRow(name, layer) {
  if (layer?.applicability === 'not_applicable') return 'not_applicable';
  if (name === 'audible_context' && layer?.value?.class?.includes('water')) {
    return 'current_water_source_state_owner_required';
  }
  if (layer?.applicability !== 'present' || !layer.source_refs?.length) {
    return 'm2c_nature_type_reference_required';
  }
  return 'derived_layer_season';
}

export function reportNaturalSuccessorRows(candidate) {
  const counts = { derived_layer_season: 0, not_applicable: 0,
    m2c_nature_type_reference_required: 0, fauna_live_entity_owner_required: 0,
    current_water_source_state_owner_required: 0 };
  for (const profile of candidate.natural_profiles) {
    for (const rows of Object.values(profile.natural_profile.season_matrix)) {
      for (const name of Object.keys(rows)) {
        const status = classifyNaturalSuccessorRow(name, profile.natural_profile.layer_applicability[name]);
        counts[status] = (counts[status] ?? 0) + 1;
      }
    }
  }
  return counts;
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
