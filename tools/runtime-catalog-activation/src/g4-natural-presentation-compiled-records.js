import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Reviewable rows only. Approval of authoring does not authorize import or activation. */
export function buildG4NaturalPresentationCompiledRecords({ candidateBytes, approvedCandidateBytes,
  naturalCandidateBytes, approvedNaturalCandidateBytes, approval, naturalRecords } = {}) {
  const successor = approval?.schema === 'rus.m2c_nature_successor_data_approval.v1';
  if (typeof candidateBytes !== 'string'
    || (successor ? approval.decision !== 'APPROVE_AUTHORING_DATA_ONLY'
      : approval?.schema !== 'rus.m2c_supplemental_data_approval.v1' || approval.decision !== 'APPROVE_DATA_ONLY')
    || (successor ? typeof approvedCandidateBytes !== 'string'
      || createHash('sha256').update(approvedCandidateBytes).digest('hex') !== approval.candidates?.presentation?.sha256
      || canonicalStringify(stripNaturalDigest(JSON.parse(candidateBytes)))
        !== canonicalStringify(stripNaturalDigest(JSON.parse(approvedCandidateBytes)))
      : createHash('sha256').update(candidateBytes).digest('hex') !== approval.approved_exact_candidates?.natural_presentation_sha256)) {
    throw new TypeError('Exact independently approved natural presentation bytes are required.');
  }
  const candidate = JSON.parse(candidateBytes);
  const approvedPresentation = successor ? JSON.parse(approvedCandidateBytes) : null;
  const sourceNatural = successor ? JSON.parse(naturalCandidateBytes) : null;
  const approvedNatural = successor ? JSON.parse(approvedNaturalCandidateBytes) : null;
  if (successor && (createHash('sha256').update(approvedNaturalCandidateBytes).digest('hex') !== approval.candidates?.natural?.sha256
    || sourceNatural.natural_profiles?.length !== candidate.presentation_profiles?.length)) {
    throw new TypeError('Exact natural source for presentation derivation is required.');
  }
  if (candidate.artifact_type !== (successor
    ? 'natural_presentation_successor_authoring_candidate' : 'natural_presentation_authoring_candidate')
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
    if (successor) {
      const source = sourceNatural.natural_profiles.find((row) => row.profile_id === profile.natural_profile_ref?.id);
      const old = approvedNatural.natural_profiles.find((row) => row.profile_id === profile.natural_profile_ref?.id);
      const oldPresentation = approvedPresentation.presentation_profiles.find((row) => row.id === profile.id);
      if (!source || !old || !oldPresentation
        || profile.natural_profile_ref.payload_digest !== naturalDigest(source)
        || oldPresentation.natural_profile_ref.payload_digest !== naturalDigest(old)) {
        throw new TypeError('Presentation source digest does not match natural successor.');
      }
      const natural = naturalRecords?.find((record) => record.payload?.profile_id === profile.natural_profile_ref?.id);
      if (!natural || natural.version !== profile.natural_profile_ref.version
        || natural.payload.g4_ref.id !== profile.g4_ref.id) {
        throw new TypeError('Exact compiled natural successor record is required.');
      }
      profile.natural_profile_ref = { ...profile.natural_profile_ref, payload_digest: natural.payload_digest };
      for (const layer of profile.layers) {
        const derived = natural.payload.natural_profile.season_matrix;
        if (!Object.values(derived).some((rows) => rows[layer.layer])) {
          layer.member_phrases = [];
          layer.channel = 'none';
          layer.clear_text = null;
          delete layer.partial_text;
        }
      }
    }
    const payload = { schema: 'rus.g4_natural_presentation_profile.v1', ...structuredClone(profile) };
    return { record_id: `profile:${profile.id}`, version: profile.version,
      record_kind: 'profile', family_candidate_ref: null, payload,
      payload_digest: digest(payload), source_pack_digest,
      status: 'approved_authoring_not_runtime_selectable' };
  }).sort((a, b) => a.record_id.localeCompare(b.record_id));
}
function stripNaturalDigest(candidate) {
  const copy = structuredClone(candidate);
  for (const profile of copy.presentation_profiles) delete profile.natural_profile_ref.payload_digest;
  return copy;
}
function naturalDigest(profile) {
  return digest({ schema: 'rus.g4_natural_baseline_profile.v1', profile_id: profile.profile_id,
    profile_version: profile.profile_version, g4_ref: profile.g4_ref,
    exact_scene_features: profile.exact_scene_features, natural_profile: profile.natural_profile });
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
