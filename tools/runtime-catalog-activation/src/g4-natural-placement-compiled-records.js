import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Pure compilation; the existing catalog workflow owns import and activation. */
export function buildG4NaturalPlacementCompiledRecords({ candidateBytes, approval } = {}) {
  if (typeof candidateBytes !== 'string'
    || approval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY'
    || createHash('sha256').update(candidateBytes).digest('hex') !== approval.approved_exact_candidates?.natural_placement_sha256) {
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
  return [{ record_id: `profile:${candidate.candidate_id}`, version: candidate.version,
    record_kind: 'profile', family_candidate_ref: null, payload,
    payload_digest: digest(payload), source_pack_digest: digest(candidate),
    status: 'approved_authoring_not_runtime_selectable' }];
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
