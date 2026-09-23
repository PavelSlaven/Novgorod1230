import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Reviewable rows only. Approval of authoring does not authorize import or activation. */
export function buildG4NaturalPresentationCompiledRecords({ candidateBytes, approval } = {}) {
  if (typeof candidateBytes !== 'string'
    || approval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY'
    || createHash('sha256').update(candidateBytes).digest('hex') !== approval.approved_exact_candidates?.natural_presentation_sha256) {
    throw new TypeError('Exact independently approved natural presentation bytes are required.');
  }
  const candidate = JSON.parse(candidateBytes);
  if (candidate.artifact_type !== 'natural_presentation_authoring_candidate'
    || !candidate.candidate_id || !Number.isSafeInteger(candidate.version) || candidate.version < 1
    || !Array.isArray(candidate.presentation_profiles) || !candidate.presentation_profiles.length) {
    throw new TypeError('Natural presentation authoring candidate is required.');
  }
  const source_pack_digest = digest(candidate); const seen = new Set();
  return candidate.presentation_profiles.map(({ status: _status, ...profile }) => {
    if (typeof profile.id !== 'string' || !profile.id || seen.has(profile.id)
      || !Number.isSafeInteger(profile.version) || profile.version < 1) {
      throw new TypeError('Unique versioned natural presentation profiles are required.');
    }
    seen.add(profile.id);
    const payload = { schema: 'rus.g4_natural_presentation_profile.v1', ...structuredClone(profile) };
    return { record_id: `profile:${profile.id}`, version: profile.version,
      record_kind: 'profile', family_candidate_ref: null, payload,
      payload_digest: digest(payload), source_pack_digest,
      status: 'approved_authoring_not_runtime_selectable' };
  }).sort((a, b) => a.record_id.localeCompare(b.record_id));
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
