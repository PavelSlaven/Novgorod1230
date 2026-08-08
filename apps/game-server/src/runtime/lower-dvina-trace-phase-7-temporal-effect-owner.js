import {
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';

export const PHASE7_REST_PROGRESS_EFFECT_REF = versioned(
  'temporal_effect', 'lower-dvina-trace-fire-rest-progress', '1'
);
// Historical in-flight Phase 7 advances may still reference this exact owner.
// New executions register the common @rus/npc-runtime schedule terminal owner.
export const PHASE7_WAITING_TERMINAL_EFFECT_REF = versioned(
  'temporal_effect', 'lower-dvina-trace-waiting-terminal', '1'
);
export const PHASE7_NPC_ACTOR_STEP_COMPLETION_EFFECT_REF = versioned(
  'temporal_effect', 'npc-actor-step-completion', '1'
);

export function lowerDvinaTracePhase7TemporalEffectRegistrations() {
  return [{
    effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
    resolve: resolveRestProgress
  }, {
    effect_ref: PHASE7_WAITING_TERMINAL_EFFECT_REF,
    resolve: resolveLegacyWaitingTerminal
  }, {
    effect_ref: PHASE7_NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
    resolve: resolveNpcActorStepCompletion
  }];
}

function resolveLegacyWaitingTerminal({ candidate, context, descriptor }) {
  if (descriptor?.npc_ref !== 'zhdanko_storehouse_controller'
      || descriptor?.transition_kind !== 'waiting_terminal_reached'
      || descriptor?.decision_signal?.category !== 'objective'
      || typeof descriptor?.signal_subject_npc_ref !== 'string'
      || context.projection.waiting_terminal_reached === true) {
    fail('TRACE_PHASE_7_WAITING_TRANSITION_INVALID');
  }
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: candidate.boundary_id
  };
  const transition = {
    schema: 'rus.npc_activity_factual_transition.v1',
    transition_id: `waiting-transition:${candidate.boundary_id}`,
    npc_ref: descriptor.npc_ref,
    activity_ref: descriptor.activity_ref,
    from: 'waiting',
    to: 'decision_required',
    occurred_at: structuredClone(candidate.scheduled_at),
    source_candidate_ref: candidateRef,
    causal_parent_refs: [candidateRef]
  };
  return {
    disposition: 'execute',
    proposals: [{
      proposal_id: `waiting-terminal:${candidate.boundary_id}`,
      write_target: `npc-activity:${descriptor.npc_ref}`
    }],
    state_projection: {
      ...context.projection,
      waiting_terminal_reached: true,
      waiting_transition: transition,
      npc_decision_signal_descriptors: [
        ...(context.projection.npc_decision_signal_descriptors ?? []),
        {
          occurred_at: structuredClone(candidate.scheduled_at),
          category: descriptor.decision_signal.category,
          significance: descriptor.decision_signal.significance,
          source_event_ref: {
            entity_kind: 'npc_activity_factual_transition',
            entity_id: transition.transition_id
          },
          subject_ref: {
            entity_kind: 'npc',
            entity_id: descriptor.signal_subject_npc_ref
          },
          scope_refs: [],
          perception_required: false,
          source_perception_ref: null,
          causal_parent_refs: [candidateRef],
          perceived_change_summary:
            'Ратша не вернулся к условленному сроку.'
        }
      ]
    },
    follow_up_candidates: [],
    stop_after_current_batch: true
  };
}

function resolveRestProgress({ slice, context }) {
  const elapsed = integerElapsed(slice.from_timestamp, slice.to_timestamp);
  return {
    proposals: [{
      proposal_id: `${slice.slice_id}:phase7-rest-progress`,
      write_target: `activity-progress:${slice.slice_id}`
    }],
    state_projection: {
      ...context.projection,
      cumulative_elapsed_minutes:
        context.projection.cumulative_elapsed_minutes + elapsed
    }
  };
}

function resolveNpcActorStepCompletion({ candidate, context, descriptor }) {
  const active = context.projection.active_npc_actor_step;
  if (descriptor?.transition_kind !== 'npc_actor_step_completed'
      || active?.npc_ref !== descriptor.npc_ref
      || active.status !== 'started'
      || compareGameTimestamp(candidate.scheduled_at,
        descriptor.scheduled_at) !== 0) {
    fail('TRACE_PHASE_7_NPC_ACTOR_STEP_COMPLETION_INVALID');
  }
  return {
    disposition: 'execute',
    proposals: [{
      proposal_id: `npc-actor-step:${candidate.boundary_id}`,
      write_target: `npc-actor-step:${descriptor.npc_ref}`
    }],
    state_projection: {
      ...context.projection,
      active_npc_actor_step: {
        ...active,
        status: 'completed',
        completed_at: structuredClone(candidate.scheduled_at)
      }
    },
    follow_up_candidates: []
  };
}

function integerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function versioned(entityKind, entityId, authoringVersion) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion
  };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
