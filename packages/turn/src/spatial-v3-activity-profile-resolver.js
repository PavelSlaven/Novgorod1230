const clone = (value) => structuredClone(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Resolves policy for the existing spatial-v3 timed-activity engine.
 * The resolver never chooses by file order, identifier order, randomness, or
 * player input. A multi-candidate result is legal only when an approved
 * bounded-decision policy explicitly owns the choice.
 */
export function resolveApprovedActivityProfile({
  profiles,
  context,
  boundedDecisionPolicies = []
} = {}) {
  const approved = (profiles ?? []).filter((profile) =>
    profile?.status === 'approved' &&
    profile.category === context?.category &&
    Object.entries(profile.applicability ?? {}).every(([key, expected]) =>
      Object.hasOwn(context, key) && equal(context[key], expected)));
  if (approved.length === 0) {
    return Object.freeze({
      ok: false,
      code: 'activity_profile_gap',
      reason: 'no_applicable_profile',
      execution_created: false,
      elapsed_minutes: 0,
      mutations: Object.freeze([])
    });
  }
  const highestPriority = Math.max(...approved.map(({ priority }) => priority));
  const candidates = approved.filter(({ priority }) => priority === highestPriority);
  if (candidates.length === 1) {
    return Object.freeze({
      ok: true,
      resolution_kind: 'singleton',
      profile: Object.freeze(clone(candidates[0]))
    });
  }
  const candidateIds = candidates.map(({ activity_profile_id }) =>
    activity_profile_id).sort();
  const policy = (boundedDecisionPolicies ?? []).find((candidate) =>
    candidate?.status === 'approved' &&
    candidate.category === context?.category &&
    equal([...candidate.candidate_profile_ids].sort(), candidateIds));
  if (policy) {
    return Object.freeze({
      ok: true,
      resolution_kind: 'bounded_decision',
      bounded_decision_policy: Object.freeze(clone(policy)),
      candidates: Object.freeze(candidates.map((candidate) =>
        Object.freeze(clone(candidate))))
    });
  }
  return Object.freeze({
    ok: false,
    code: 'activity_policy_gap',
    reason: 'ambiguous_most_specific_profile',
    candidate_profile_ids: Object.freeze(candidateIds),
    execution_created: false,
    elapsed_minutes: 0,
    mutations: Object.freeze([])
  });
}
