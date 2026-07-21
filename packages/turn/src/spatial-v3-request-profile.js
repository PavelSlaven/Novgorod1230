const text = (value) => typeof value === 'string' && value.trim().length > 0;
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const clone = (value) => structuredClone(value);
const failure = (code, subject) => freeze({ ok: false, errors: freeze([{ code, subject_ref: subject }]) });

/**
 * Actual request-composition boundary used by target/shadow callers. It owns
 * no storage and cannot select a profile from ambient process state. Until
 * P28 it makes v2 the only production delegate and admits v3 only through a
 * separate no-write shadow request.
 */
export function createSpatialV3RequestProfileBoundary({ request_profiles, runProductionV2, runShadowV3, p06Guard } = {}) {
  if (!Array.isArray(request_profiles) || typeof runProductionV2 !== 'function' || typeof runShadowV3 !== 'function' || typeof p06Guard !== 'function') {
    throw new TypeError('P25 requires request-local profiles, explicit v2/shadow delegates and P06 guard.');
  }
  const profiles = freeze(request_profiles.map((entry) => freeze({ party_id: entry?.party_id, request_id: entry?.request_id, profile: entry?.profile })));
  return freeze({
    request_profiles: profiles,
    async run({ party_id, request_id, profile, payload } = {}) {
      const matches = profiles.filter((entry) => entry.party_id === party_id && entry.request_id === request_id);
      const subject = `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`;
      if (!text(party_id) || !text(request_id) || !['production_v2', 'shadow_v3'].includes(profile)) return failure('composition_profile_invalid', subject);
      if (matches.length !== 1) return failure(matches.length ? 'composition_profile_binding_conflict' : 'composition_profile_binding_missing', subject);
      if (matches[0].profile !== profile) return failure('composition_profile_binding_mismatch', subject);
      const version = profile === 'production_v2' ? 2 : 3;
      const composition = p06Guard({ storage_versions: [2, 3], request_schema_version: version, reader_schema_version: version, writer_schema_version: version, current_position_contract: `v${version}`, target_records_schema_version: version });
      if (!composition?.ok) return failure('mixed_runtime_composition', subject);
      const immutable = freeze({ party_id, request_id, profile, payload: clone(payload) });
      if (profile === 'production_v2') return freeze({ ok: true, profile, result: await runProductionV2(immutable) });
      const result = await runShadowV3(immutable);
      if (result?.target_state_writes === true || typeof result?.commit === 'function' || typeof result?.write === 'function') return failure('dual_writer_forbidden', subject);
      return freeze({ ok: true, profile, result: clone(result), activation_permitted: false });
    }
  });
}
