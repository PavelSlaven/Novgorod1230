import { createTurnStepExecutionRegistry } from '../src/turn-step-loop.js';

export function input(overrides = {}) {
  return {
    requestId: 'request-1', rootTurnId: 'turn-1', committedStateVersion: 7,
    rootPlayerAction: 'беру камень и кладу его в сумку',
    actor: { actor_ref: 'actor-1' }, initialWorkingProjection: {
      actor_ref: 'actor-1', visible_entities: [{ entity_ref: 'stone-1' }],
      inventory: [], elapsed_minutes: 0
    }, ...overrides
  };
}

export function basePlan(request, overrides = {}) {
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: null, reason_code: 'direct_step', reason: 'test plan',
    ...overrides
  };
}

export function result(projection, summary, overrides = {}) {
  return { working_projection: projection, summary, write_fragments: [], ...overrides };
}

export function ports(overrides = {}) {
  return {
    turnStepModel: async (request) => basePlan(request),
    projectPlayerSafeState: async ({ working_projection: projection }) => ({
      actor_ref: projection.actor_ref, visible_entities: projection.visible_entities,
      inventory: projection.inventory, elapsed_minutes: projection.elapsed_minutes
    }),
    revalidateCommittedState: async () => ({ state_version: 7 }),
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection: projection }) => result({
        ...projection, elapsed_minutes: projection.elapsed_minutes + 1 }, 'прошла минута')
    }), ...overrides
  };
}

export function checkPolicyRefs() {
  return {
    policy_profile_ref: 'test_generic_check_profile', policy_profile_pin: policyProfilePin(),
    check_policy_ref: { entity_kind: 'check_policy', entity_id: 'test_check_policy', authoring_version: '1' },
    consequence_policy_ref: { entity_kind: 'consequence_policy', entity_id: 'test_consequence_policy', authoring_version: '1' }
  };
}

export function policyProfilePin() {
  return { artifact_id: 'test_turn_step_owner_profiles', revision: 1, digest: 'a'.repeat(64) };
}
