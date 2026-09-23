import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Reviewable rows only. Approval of authoring does not authorize import or activation. */
export function buildG4NaturalPresentationCompiledRecords({ candidateBytes, approval } = {}) {
  if (typeof candidateBytes !== 'string'
    || approval?.decision !== 'APPROVE_M2C_NATURAL_PRESENTATION_AUTHORING_V1'
    || approval.approval_scope !== 'natural_presentation_authoring_data_only'
    || createHash('sha256').update(candidateBytes).digest('hex') !== approval.candidate_sha256) {
    throw new TypeError('Exact independently approved natural presentation bytes are required.');
  }
  const candidate = JSON.parse(candidateBytes);
  if (candidate.artifact_type !== 'natural_presentation_authoring_candidate'
    || approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
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
