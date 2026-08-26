import {
  digest,
  entityRef,
  formal,
  freeze,
  normalizeTimestamp,
  record,
  stableId,
  versionedRef
} from './internal.js';

const CATEGORIES = new Set([
  'self', 'others', 'environment', 'objective', 'communication'
]);
const SIGNIFICANCE = new Set(['material', 'critical']);

export const NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF = freeze({
  entity_ref: {
    entity_kind: 'temporal_effect',
    entity_id: 'npc-schedule-decision-terminal'
  },
  authoring_version: '1'
});

export function createNpcScheduleDecisionTerminalEffect(input = {}) {
  validateInput(input);
  const candidate = {
    boundary_id: input.boundary_id,
    boundary_kind: 'npc_schedule',
    scheduled_at: structuredClone(input.scheduled_at),
    source_ref: structuredClone(input.source_ref),
    primary_subject_ref: structuredClone(input.npc_ref),
    subject_refs: [],
    scope_ref: structuredClone(input.scope_ref),
    rule_ref: structuredClone(input.rule_ref),
    policy_ref: structuredClone(input.policy_ref),
    preconditions_digest: digest({
      schedule_actor_ref: input.schedule_actor_ref,
      activity_ref: input.activity_ref,
      from_state: input.from_state,
      terminal_state: input.terminal_state,
      source_ref: input.source_ref
    }),
    resolution_class: 'npc_schedule',
    interrupt_effect: 'background',
    visibility_policy_ref: structuredClone(input.visibility_policy_ref),
    idempotency_key: input.boundary_id,
    causal_parent_refs: []
  };
  if (!formal('temporal_boundary_candidate', candidate)) {
    invalid('npc_schedule_gap',
      'NPC schedule terminal produced an invalid temporal candidate.');
  }
  return freeze({
    candidate,
    effect_ref: NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
    input: {
      schedule_actor_ref: input.schedule_actor_ref,
      npc_ref: input.npc_ref,
      activity_ref: input.activity_ref,
      from_state: input.from_state,
      terminal_state: input.terminal_state,
      signal: input.signal
    }
  });
}

export function resolveNpcScheduleDecisionTerminal({ candidate, context,
  descriptor } = {}) {
  const current = context?.projection?.npc_activity_states
    ?.[descriptor?.schedule_actor_ref];
  if (!formal('temporal_boundary_candidate', candidate)
      || !validDescriptor(descriptor)
      || !sameEntityRef(candidate.primary_subject_ref, descriptor.npc_ref)
      || candidate.preconditions_digest !== digest({
        schedule_actor_ref: descriptor.schedule_actor_ref,
        activity_ref: descriptor.activity_ref,
        from_state: descriptor.from_state,
        terminal_state: descriptor.terminal_state,
        source_ref: candidate.source_ref
      })
      || current?.activity_ref !== descriptor.activity_ref
      || current?.status !== descriptor.from_state) {
    invalid('npc_schedule_gap',
      'NPC schedule terminal is not applicable to the working state.');
  }
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: candidate.boundary_id
  };
  const transition = {
    schema: 'rus.npc_activity_factual_transition.v1',
    transition_id: npcScheduleDecisionTransitionId(candidate.boundary_id),
    npc_ref: descriptor.schedule_actor_ref,
    activity_ref: descriptor.activity_ref,
    from: descriptor.from_state,
    to: descriptor.terminal_state,
    occurred_at: structuredClone(candidate.scheduled_at),
    source_candidate_ref: structuredClone(candidateRef),
    causal_parent_refs: [structuredClone(candidateRef)]
  };
  const signal = descriptor.signal;
  return freeze({
    disposition: 'execute',
    proposals: [{
      proposal_id: `npc-schedule-terminal:${candidate.boundary_id}`,
      write_target: `npc-activity:${descriptor.schedule_actor_ref}`
    }],
    state_projection: {
      ...context.projection,
      npc_activity_states: {
        ...context.projection.npc_activity_states,
        [descriptor.schedule_actor_ref]: {
          activity_ref: descriptor.activity_ref,
          status: descriptor.terminal_state
        }
      },
      npc_activity_factual_transitions: [
        ...(context.projection.npc_activity_factual_transitions ?? []),
        transition
      ],
      npc_decision_signal_descriptors: [
        ...(context.projection.npc_decision_signal_descriptors ?? []),
        {
          occurred_at: structuredClone(candidate.scheduled_at),
          category: signal.category,
          significance: signal.significance,
          source_event_ref: {
            entity_kind: 'npc_activity_factual_transition',
            entity_id: transition.transition_id
          },
          subject_ref: structuredClone(descriptor.npc_ref),
          scope_refs: [],
          perception_required: false,
          source_perception_ref: null,
          causal_parent_refs: [candidateRef],
          perceived_change_summary: signal.perceived_change_summary
        }
      ]
    },
    follow_up_candidates: [],
    stop_after_current_batch: true
  });
}

export function npcScheduleDecisionTransitionId(candidateId) {
  if (!stableId(candidateId)) {
    invalid('npc_schedule_gap', 'NPC schedule candidate id is required.');
  }
  return `waiting-transition:${candidateId}`;
}

function validateInput(input) {
  if (!stableId(input.boundary_id)
      || normalizeTimestamp(input.scheduled_at) === null
      || !entityRef(input.source_ref)
      || !entityRef(input.scope_ref)
      || !entityRef(input.npc_ref, 'npc')
      || !stableId(input.schedule_actor_ref)
      || !stableId(input.activity_ref)
      || !stableId(input.from_state)
      || !stableId(input.terminal_state)
      || input.from_state === input.terminal_state
      || !versionedRef(input.rule_ref)
      || !versionedRef(input.policy_ref)
      || !versionedRef(input.visibility_policy_ref)
      || !validSignal(input.signal)) {
    invalid('npc_schedule_gap',
      'NPC schedule terminal requires exact approved data.');
  }
}

function validDescriptor(value) {
  return record(value)
    && stableId(value.schedule_actor_ref)
    && entityRef(value.npc_ref, 'npc')
    && stableId(value.activity_ref)
    && stableId(value.from_state)
    && stableId(value.terminal_state)
    && value.from_state !== value.terminal_state
    && validSignal(value.signal);
}

function validSignal(value) {
  return record(value)
    && CATEGORIES.has(value.category)
    && SIGNIFICANCE.has(value.significance)
    && typeof value.perceived_change_summary === 'string'
    && value.perceived_change_summary.length > 0
    && value.perceived_change_summary.trim()
      === value.perceived_change_summary;
}

function sameEntityRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function invalid(code, message) {
  throw Object.assign(new TypeError(message), { code });
}
