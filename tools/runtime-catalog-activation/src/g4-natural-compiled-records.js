import { createHash } from 'node:crypto';
import { validateG4NaturalProfile } from '../../../packages/materialization/src/g4-natural-baseline.js';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Builds reviewable rows only; the existing approval/import workflow owns writes. */
export function buildG4NaturalCompiledRecords({ candidate } = {}) {
  if (candidate?.artifact_type !== 'natural_baseline_authoring_candidate'
    || !Array.isArray(candidate.natural_profiles) || !candidate.natural_profiles.length) {
    throw new TypeError('Natural baseline authoring candidate is required.');
  }
  const source_pack_digest = digest(candidate); const seen = new Set();
  return candidate.natural_profiles.map((profile) => {
    validateG4NaturalProfile(profile);
    const key = `${profile.g4_ref.id}@${profile.g4_ref.version}`;
    if (profile.g4_ref.world_revision_id !== candidate.target.world_revision_id || seen.has(key)) {
      throw new TypeError('Natural profiles require unique exact G4 pins in the target world.');
    }
    seen.add(key);
    const payload = { schema: 'rus.g4_natural_baseline_profile.v1',
      profile_id: profile.profile_id, profile_version: profile.profile_version,
      g4_ref: structuredClone(profile.g4_ref),
      exact_scene_features: structuredClone(profile.exact_scene_features),
      natural_profile: structuredClone(profile.natural_profile) };
    return { record_id: `profile:${profile.profile_id}`, version: profile.profile_version,
      record_kind: 'profile', family_candidate_ref: null, payload,
      payload_digest: digest(payload), source_pack_digest,
      status: 'approved_authoring_not_runtime_selectable' };
  }).sort((a, b) => a.record_id.localeCompare(b.record_id));
}
function digest(value) { return createHash('sha256').update(canonicalStringify(value)).digest('hex'); }
