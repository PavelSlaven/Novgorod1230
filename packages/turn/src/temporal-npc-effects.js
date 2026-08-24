import {
  createNpcScheduleDecisionTerminalEffect,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId,
  resolveNpcScheduleDecisionTerminal
} from '@rus/npc-runtime';
import { deepFreeze } from '@rus/kernel';
import { canonicalDigest } from '@rus/materialization';
import {
  addElapsedTime,
  compareGameTimestamp
} from '@rus/time-events-history';

export const NPC_ACTOR_STEP_COMPLETION_EFFECT_REF = versioned(
  'temporal_effect', 'npc-actor-step-completion', '1'
);

export {
  createNpcScheduleDecisionTerminalEffect,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId
};

export function npcTemporalEffectRegistrations() {
  return [{
    effect_ref: NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
    resolve: resolveNpcScheduleDecisionTerminal
  }, {
    effect_ref: NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
    resolve: resolveNpcActorStepCompletion
  }];
}

export function startNpcActorStep({ execution, started_at: startedAt,
  actor_ref: actorRef,
  duration_minutes: durationMinutes, execution_binding_ref: executionBindingRef,
  schedule_option_id: scheduleOptionId,
  activity_profile_ref: activityProfileRef,
  movement_proposal: movementProposal,
  property_proposal: propertyProposal } = {}) {
  const operation = execution?.operation;
  const npcRef = actorRef ?? operation?.actor_ref;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 0
      || typeof npcRef !== 'string' || npcRef.length === 0
      || typeof execution?.request?.request_id !== 'string'
      || execution?.plan == null || execution?.working_projection == null) {
    fail('npc_actor_step_start_gap');
  }
  const decisionTraceRef = {
    entity_kind: 'npc_decision_trace',
    entity_id: execution.request.request_id
  };
  const actorSteps = npcActorSteps(execution.working_projection);
  const priorIndex = actorSteps.findIndex((step) =>
    step?.status === 'started'
    && step?.npc_ref === npcRef
    && step?.decision_trace_ref?.entity_id === decisionTraceRef.entity_id);
  const prior = priorIndex < 0 ? null : actorSteps[priorIndex];
  const composing = operation.op === 'apply_semantic_activity'
    && prior?.status === 'started'
    && prior.semantic_operation?.op === 'apply_semantic_activity'
    && prior.decision_trace_ref?.entity_id === decisionTraceRef.entity_id;
  const priorDuration = composing ? exactActorStepMinutes(prior) : 0;
  const semanticOperation = composing
    ? prior.semantic_operation : operation;
  const additionalSemanticOperations = composing
    ? [...(prior.additional_semantic_operations ?? []), operation]
    : [];
  const active = {
    npc_ref: npcRef,
    status: 'started',
    started_at: structuredClone(startedAt),
    decision_trace_ref: decisionTraceRef,
    semantic_operation: structuredClone(semanticOperation),
    ...(additionalSemanticOperations.length > 0 ? {
      additional_semantic_operations: structuredClone(
        additionalSemanticOperations)
    } : {}),
    activity_profile_ref: composing
      ? prior.activity_profile_ref ?? null : activityProfileRef,
    planned_exact_elapsed: {
      exact_minutes: {
        numerator: String(priorDuration + durationMinutes),
        denominator: '1'
      }
    }
  };
  const nextActorSteps = [...actorSteps];
  if (composing) nextActorSteps[priorIndex] = active;
  else nextActorSteps.push(active);
  const workingProjection = structuredClone(execution.working_projection);
  delete workingProjection.active_npc_actor_step;
  workingProjection.active_npc_actor_steps = nextActorSteps;
  return immutable({
    working_projection: workingProjection,
    summary: 'npc_actor_step:' + operation.op,
    consequence_fragment: {
      owner: '@rus/turn/actor-step',
      domain_owner: domainOwner(operation.op),
      status: 'started',
      failure_code: null,
      npc_ref: npcRef,
      decision_trace_ref: active.decision_trace_ref,
      semantic_operation: semanticOperation,
      ...(additionalSemanticOperations.length > 0 ? {
        additional_semantic_operations: additionalSemanticOperations
      } : {}),
      execution_binding_ref: composing ? null : executionBindingRef,
      schedule_option_id: composing ? null : scheduleOptionId,
      activity_profile_ref: composing
        ? prior.activity_profile_ref ?? null : activityProfileRef,
      exact_elapsed: active.planned_exact_elapsed,
      clock_before: startedAt,
      clock_after: startedAt,
      root_clock_write_count: 0,
      movement_proposal: movementProposal,
      property_proposal: propertyProposal,
      factual_result_source: 'code_owned_actor_step_domain_execution',
      parent_state_version: execution.request.committed_state_version
    },
    goal_result: execution.plan.goal_result,
    continuation: null,
    player_response_boundary: true
  });
}

export function createNpcActorStepCompletionEffect({ party_ref: partyRef,
  active_actor_step: active, visibility_policy_ref: visibilityPolicyRef
} = {}) {
  if (partyRef?.entity_kind !== 'party'
      || typeof partyRef.entity_id !== 'string'
      || active?.status !== 'started'
      || typeof active.npc_ref !== 'string'
      || typeof active.decision_trace_ref?.entity_kind !== 'string'
      || typeof active.decision_trace_ref?.entity_id !== 'string'
      || typeof active.semantic_operation?.op !== 'string'
      || visibilityPolicyRef == null) {
    fail('npc_actor_step_completion_gap');
  }
  const scheduledAt = addElapsedTime(
    active.started_at, active.planned_exact_elapsed);
  const identity = 'npc-actor-step:' + partyRef.entity_id + ':'
    + active.npc_ref + ':' + active.decision_trace_ref.entity_id + ':complete';
  return immutable({
    candidate: {
      boundary_id: identity,
      boundary_kind: 'npc_schedule',
      scheduled_at: scheduledAt,
      source_ref: active.decision_trace_ref,
      primary_subject_ref: ref('npc', active.npc_ref),
      subject_refs: [],
      scope_ref: partyRef,
      rule_ref: versioned(
        'action_contract', active.semantic_operation.op, '1'),
      policy_ref: versioned('activity_contract', 'npc-actor-step', '1'),
      preconditions_digest: canonicalDigest(active),
      resolution_class: 'execution_outcome',
      interrupt_effect: 'background',
      visibility_policy_ref: visibilityPolicyRef,
      idempotency_key: identity,
      causal_parent_refs: [active.decision_trace_ref]
    },
    effect_ref: NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
    input: {
      npc_ref: active.npc_ref,
      decision_trace_ref: structuredClone(active.decision_trace_ref),
      scheduled_at: scheduledAt,
      transition_kind: 'npc_actor_step_completed'
    }
  });
}

function resolveNpcActorStepCompletion({ candidate, context, descriptor }) {
  const actorSteps = npcActorSteps(context.projection);
  const activeIndex = actorSteps.findIndex((step) =>
    step?.npc_ref === descriptor?.npc_ref
    && step?.decision_trace_ref?.entity_kind
      === descriptor?.decision_trace_ref?.entity_kind
    && step?.decision_trace_ref?.entity_id
      === descriptor?.decision_trace_ref?.entity_id);
  const active = activeIndex < 0 ? null : actorSteps[activeIndex];
  const expectedIdentity = 'npc-actor-step:'
    + candidate?.scope_ref?.entity_id + ':' + descriptor?.npc_ref + ':'
    + descriptor?.decision_trace_ref?.entity_id + ':complete';
  if (descriptor?.transition_kind !== 'npc_actor_step_completed'
      || active?.npc_ref !== descriptor.npc_ref
      || active.status !== 'started'
      || canonicalDigest(candidate?.source_ref)
        !== canonicalDigest(descriptor.decision_trace_ref)
      || candidate?.primary_subject_ref?.entity_kind !== 'npc'
      || candidate.primary_subject_ref.entity_id !== descriptor.npc_ref
      || candidate?.boundary_id !== expectedIdentity
      || candidate?.idempotency_key !== expectedIdentity
      || candidate?.preconditions_digest !== canonicalDigest(active)
      || compareGameTimestamp(candidate.scheduled_at,
        descriptor.scheduled_at) !== 0) {
    fail('npc_actor_step_completion_gap');
  }
  const completed = {
    ...active,
    status: 'completed',
    completed_at: structuredClone(candidate.scheduled_at)
  };
  const nextActorSteps = [...actorSteps];
  nextActorSteps[activeIndex] = completed;
  const projection = { ...context.projection };
  delete projection.active_npc_actor_step;
  projection.active_npc_actor_steps = nextActorSteps;
  return {
    disposition: 'execute',
    proposals: [{
      proposal_id: 'npc-actor-step:' + candidate.boundary_id,
      write_target: 'npc-actor-step:' + descriptor.npc_ref
    }],
    state_projection: projection,
    follow_up_candidates: []
  };
}

export function npcActorSteps(projection) {
  if (Array.isArray(projection?.active_npc_actor_steps)) {
    return structuredClone(projection.active_npc_actor_steps);
  }
  return projection?.active_npc_actor_step == null
    ? [] : [structuredClone(projection.active_npc_actor_step)];
}

function exactActorStepMinutes(active) {
  const exact = active?.planned_exact_elapsed?.exact_minutes;
  const value = Number(exact?.numerator);
  if (exact?.denominator !== '1'
      || !Number.isSafeInteger(value) || value < 0) {
    fail('npc_actor_step_start_gap');
  }
  return value;
}

export function domainOwner(operation) {
  if (operation === 'request_item_use') return '@rus/items-property';
  if (operation === 'request_container_access') return '@rus/items-property';
  if (operation === 'request_movement') return '@rus/movement-routes';
  if (operation === 'request_world_process') return '@rus/world-processes';
  return '@rus/turn';
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

function versioned(entityKind, entityId, authoringVersion = '1') {
  return {
    entity_ref: ref(entityKind, entityId),
    authoring_version: authoringVersion
  };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
