import { canonicalDigest } from '@rus/materialization';

export async function resolveTracePhase7SemanticActivity({ execution,
  contracts, semanticActivityScheduleOwner }) {
  const activity = execution.operation?.activity;
  const expected = contracts.semanticActivityProfiles.find((profile) =>
    profile.duration_class === activity?.duration_class
      && profile.effort === activity?.effort);
  const domainOperations = execution.plan.operations.filter(({ op }) =>
    !DIRECT.has(op));
  const actionProduction = execution.plan.resolution === 'domain_request'
    && domainOperations.length === 1
    && domainOperations[0]?.op === 'request_item_use'
    && domainOperations[0]?.action_production != null;
  if ((!['direct', 'generic_check'].includes(execution.plan.resolution)
      && !actionProduction)
      || activity?.owner !== 'semantic'
      || (!actionProduction && execution.plan.operations.some(({ op }) =>
        !DIRECT.has(op)))
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

const DIRECT = new Set(['create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event']);

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
