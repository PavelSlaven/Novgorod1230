import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Pure compilation; the existing catalog workflow owns import and activation. */
export function buildG4NaturalPlacementCompiledRecords({ candidateBytes, approval,
  naturalRecords, presentationRecords, sourceCandidateBytes, approvedStartBytes,
  capacityApproval, sceneTemplateBytes } = {}) {
  const approved = typeof candidateBytes === 'string'
    && createHash('sha256').update(candidateBytes).digest('hex')
      === approval?.approved_exact_candidates?.natural_placement_sha256;
  const derived = !approved && typeof candidateBytes === 'string'
    && typeof sourceCandidateBytes === 'string' && typeof approvedStartBytes === 'string'
    && typeof sceneTemplateBytes === 'string'
    && candidateBytes === deriveApprovedNaturalPlacementV2Successor({ sourceCandidateBytes,
      approvedStartBytes, capacityApproval, sceneTemplateBytes, approval });
  if (typeof candidateBytes !== 'string'
    || approval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY'
    || (!approved && !derived)) {
    throw new TypeError('Exact independently approved natural placement bytes are required.');
  }
  const candidate = JSON.parse(candidateBytes);
  if (candidate.artifact_type !== 'natural_perception_placement_authoring_candidate'
    || !candidate.candidate_id || !Number.isSafeInteger(candidate.version) || candidate.version < 1
    || !Array.isArray(candidate.placements) || !candidate.placements.length) {
    throw new TypeError('Natural perception placement candidate is required.');
  }
  const payload = { schema: 'rus.g4_natural_placement_catalog.v1',
    id: candidate.candidate_id, version: candidate.version,
    source_candidate_sha256: createHash('sha256').update(candidateBytes).digest('hex'),
    world_revision_id: candidate.world_revision_id,
    condition_policies: structuredClone(candidate.condition_policies),
    acoustic_source_rules: structuredClone(candidate.acoustic_source_rules),
    placements: candidate.placements.map(({ status: _status, ...row }) => structuredClone(row)) };
  if (naturalRecords || presentationRecords) {
    if (naturalRecords?.length !== 32 || presentationRecords?.length !== 32) {
      throw new TypeError('Complete compiled natural successors are required.');
    }
    payload.version = candidate.version + 1;
    for (const placement of payload.placements) {
      const natural = naturalRecords.find((row) => row.payload.profile_id === placement.natural_profile_ref.id);
      const presentation = presentationRecords.find((row) => row.payload.id === placement.presentation_profile_ref.id);
      if (!natural || !presentation || natural.version !== payload.version || presentation.version !== payload.version
        || natural.payload.g4_ref.id !== placement.g4_ref.id
        || presentation.payload.g4_ref.id !== placement.g4_ref.id
        || presentation.payload.natural_profile_ref.payload_digest !== natural.payload_digest) {
        throw new TypeError('Exact compiled natural successor placement refs are required.');
      }
      placement.natural_profile_ref = { id: natural.payload.profile_id,
        version: natural.version, payload_digest: natural.payload_digest };
      placement.presentation_profile_ref = { id: presentation.payload.id, version: presentation.version };
      for (const layer of presentation.payload.layers) {
        if (layer.channel !== 'none') continue;
        for (const group of ['visual_layers', 'unplaced_visual_layers', 'acoustic_layers']) {
          placement[group] = placement[group].filter((name) => name !== layer.layer);
        }
        if (!placement.unprojected_layers.includes(layer.layer)) placement.unprojected_layers.push(layer.layer);
      }
    }
  }
  return [{ record_id: `profile:${candidate.candidate_id}`, version: payload.version,
    record_kind: 'profile', family_candidate_ref: null, payload,
    payload_digest: digest(payload), source_pack_digest: digest(candidate),
    status: 'approved_authoring_not_runtime_selectable' }];
}
export function deriveApprovedNaturalPlacementV2Successor({ sourceCandidateBytes,
  approvedStartBytes, capacityApproval, sceneTemplateBytes, approval } = {}) {
  const sha = (bytes) => typeof bytes === 'string'
    ? createHash('sha256').update(bytes).digest('hex') : null;
  if (approval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY'
    || sha(sourceCandidateBytes) !== approval.approved_exact_candidates?.natural_placement_sha256
    || capacityApproval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || capacityApproval.decision !== 'APPROVE_DATA_ONLY'
    || sha(sceneTemplateBytes) !== capacityApproval.source_pins?.scene_templates?.sha256) {
    throw new TypeError('Exact approved placement, start and scene bytes are required.');
  }
  const start = JSON.parse(approvedStartBytes);
  const rule = start.initial_perception_rule;
  if (capacityApproval.approved_successors?.filter((row) => row.scenario_id === start.scenario_id
    && row.start?.sha256 === sha(approvedStartBytes)).length !== 1
    || rule?.placement_candidate?.sha256 !== sha(sourceCandidateBytes)
    || rule.scene_template_ref?.version !== 2) {
    throw new TypeError('Exact approved forest start is required.');
  }
  const scenes = JSON.parse(sceneTemplateBytes);
  if (scenes.filter((row) => row.id === rule.scene_template_ref.id
    && row.version === 2 && row.canonical_digest === rule.scene_template_ref.canonical_digest).length !== 1) {
    throw new TypeError('Exact approved scene template is required.');
  }
  const source = JSON.parse(sourceCandidateBytes);
  const placements = source.placements.filter((row) => row.id === rule.placement_candidate.placement_ref.id);
  if (placements.length !== 1 || placements[0].scene_template_ref?.id !== rule.scene_template_ref.id
    || placements[0].scene_template_ref.version !== 1
    || placements[0].scene_template_ref.canonical_digest !== rule.scene_template_ref.canonical_digest) {
    throw new TypeError('Exact approved source placement is required.');
  }
  placements[0].scene_template_ref.version = 2;
  return `${JSON.stringify(source, null, 2)}\n`;
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
