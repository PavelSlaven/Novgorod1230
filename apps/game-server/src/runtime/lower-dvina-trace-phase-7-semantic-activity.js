import { canonicalDigest } from '@rus/materialization';

export async function resolveTracePhase7SemanticActivity({ execution,
  contracts, semanticActivityScheduleOwner }) {
  const activity = execution.operation?.activity;
  const expected = contracts.semanticActivityProfiles.find((profile) =>
    profile.duration_class === activity?.duration_class
      && profile.effort === activity?.effort);
  if (execution.plan.resolution !== 'direct'
      || activity?.owner !== 'semantic'
      || execution.plan.operations.length !== 0
      || !expected
      || typeof semanticActivityScheduleOwner?.resolve !== 'function') {
    fail('TRACE_PHASE_7_SEMANTIC_ACTIVITY_NOT_APPLICABLE');
  }
  const resolved = await semanticActivityScheduleOwner.resolve({ activity });
  const approved = {
    profile_ref: expected.profile_ref,
    profile_pin: structuredClone(expected.profile_pin),
    duration_class: expected.duration_class,
    effort: expected.effort,
    duration_minutes: expected.duration_minutes
  };
  if (canonicalDigest(resolved) !== canonicalDigest(approved)) {
    fail('TRACE_PHASE_7_SEMANTIC_ACTIVITY_OWNER_INVALID');
  }
  return {
    profile: {
      execution_binding_id: null,
      schedule_option_id: null,
      activity_profile_ref: resolved.profile_ref
    },
    minutes: resolved.duration_minutes,
    npcRef: execution.request.npc_ref
  };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
