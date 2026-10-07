import { deepFreeze } from '@rus/kernel';

const BODY_METRICS = ['health', 'satiety', 'energy'];
const PROFILE_SCHEMA = 'rus.body_state.initialization_profile.v1';

/** Builds body state only from an explicitly approved, versioned profile. */
export function initializeBodyState({ body_state_profile: profile } = {}) {
  const ref = profile?.profile_ref;
  if (profile?.schema !== PROFILE_SCHEMA
      || profile.status !== 'approved'
      || !plain(ref) || !plain(ref.entity_ref)
      || !text(ref.entity_ref.entity_kind) || !text(ref.entity_ref.entity_id)
      || !text(ref.authoring_version)
      || !plain(profile.initial_state)
      || BODY_METRICS.some((metric) => !Number.isFinite(profile.initial_state[metric])
        || profile.initial_state[metric] < 0 || profile.initial_state[metric] > 100)) {
    return hardBlock('body_state_profile_gap',
      'approved versioned body-state profile with health, satiety and energy is required');
  }

  return deepFreeze({
    ok: true,
    body_state: Object.fromEntries(BODY_METRICS.map((metric) => [
      metric, profile.initial_state[metric]
    ])),
    profile_ref: structuredClone(ref)
  });
}

function hardBlock(code, message) {
  return deepFreeze({ ok: false, status: 'hard_block', error: { code, message } });
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}
