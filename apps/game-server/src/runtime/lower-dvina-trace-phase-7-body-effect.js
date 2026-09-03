import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export function resolveTracePhase7FireRestEffect(source, state) {
  const bounds = source?.delta_bounds;
  const transitions = source?.condition_transitions;
  if (source?.activity_ref !== 'trace_ld_v1_activity_fire_rest'
      || source.elapsed_minutes !== 30
      || canonicalDigest(bounds) !== canonicalDigest({
        health: [0, 0], satiety: [-1, 0], energy: [1, 4]
      })
      || canonicalDigest(transitions) !== canonicalDigest([
        'wet_to_damp_only',
        'strong_shivering_may_stop',
        'headache_persists',
        'bruise_persists'
      ])) {
    gap();
  }
  const conditions = new Set((state.body_state?.active_conditions ?? [])
    .map(({ id }) => id));
  const coldState = ['strong_shivering', 'mild_shivering']
    .find((id) => conditions.has(id));
  return {
    ...structuredClone(source),
    source_profile_digest: canonicalDigest(source),
    selection_policy: 'code_owned_within_approved_bounds',
    rng_consumption: 'forbidden',
    exact_deltas: { health: 0, energy: 3, satiety: -1 },
    condition_outcomes: [{
      condition_profile_ref: 'trace_ld_v1_condition_wet_clothing',
      from: 'wet', to: 'damp',
      outcome: 'wet_clothing_reduced_to_damp'
    }, ...(coldState == null ? [] : [{
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: coldState, to: 'mild_shivering',
      outcome: coldState === 'strong_shivering'
        ? 'strong_shivering_reduced' : 'persists'
    }]), {
      condition_profile_ref: 'trace_ld_v1_condition_headache',
      from: 'headache', to: 'headache', outcome: 'headache_persists'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_shoulder_bruise',
      from: 'shoulder_bruise', to: 'shoulder_bruise',
      outcome: 'shoulder_bruise_persists'
    }].filter(({ from }) => conditions.has(from))
  };
}

export function approvedTracePhase7RestOutcomes(outcomes) {
  const allowed = new Map([
    ['trace_ld_v1_condition_wet_clothing', [['wet', 'damp']]],
    ['trace_ld_v1_condition_cold_shivering', [
      ['strong_shivering', 'mild_shivering'],
      ['mild_shivering', 'mild_shivering']
    ]],
    ['trace_ld_v1_condition_headache', [['headache', 'headache']]],
    ['trace_ld_v1_condition_shoulder_bruise', [
      ['shoulder_bruise', 'shoulder_bruise']
    ]]
  ]);
  const seen = new Set();
  return Array.isArray(outcomes) && outcomes.every((outcome) => {
    const profile = outcome?.condition_profile_ref;
    if (seen.has(profile)) return false;
    seen.add(profile);
    return (allowed.get(profile) ?? []).some(([from, to]) =>
      outcome.from === from && outcome.to === to);
  });
}

function gap() {
  throw serverError('TRACE_PHASE_7_BODY_PROFILE_INVALID',
    'The exact party-pinned Phase 7 chain is incomplete.', { status: 409 });
}
