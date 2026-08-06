import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';
import { subtractGameTimestamp } from '@rus/time-events-history';
import {
  resolveTracePhase7DomainProposals,
  tracePhase7ItemUseTransitions,
  tracePhase7PropertyTransitions,
  tracePhase7TransitionTarget
} from './lower-dvina-trace-phase-7-owner-proposals.js';
import { resolveTracePhase7SemanticActivity } from
  './lower-dvina-trace-phase-7-semantic-activity.js';

const ACTIVITY_KINDS = ['wait', 'carry'];

export function createTracePhase7DomainExecution({ state, contracts,
  temporal, semanticActivityScheduleOwner }) {
  const resources = contracts.autonomous.available_resource_refs;
  const transitions = tracePhase7ItemUseTransitions(contracts);
  return Object.freeze({
    semantic_activity_handler: async (execution) => {
      const semantic = await resolveTracePhase7SemanticActivity({
        execution, contracts, semanticActivityScheduleOwner
      });
      return started({ execution, temporal, ...semantic,
        movement: null, property: null });
    },
    handlers: {
      request_activity: (execution) => executeActivity({
        execution, state, contracts, temporal
      }),
      request_item_use: (execution) => executeItem({
        execution, state, contracts, temporal
      })
    },
    operation_contract: {
      request_activity: {
        owner: '@rus/turn', activity_kinds: ACTIVITY_KINDS,
        target_refs: [...structuredClone(resources),
          contracts.localTransition.destination_zone_ref],
        maximum_elapsed_minutes: remainingMinutes(temporal),
        factual_outcome_write: 'forbidden'
      },
      request_item_use: {
        owner: '@rus/items-property', item_refs: structuredClone(resources),
        use_kinds: ['operate', 'other'],
        target_refs: transitions.map(tracePhase7TransitionTarget),
        factual_outcome_write: 'owner_only'
      }
    }
  });
}

function executeActivity({ execution, state, contracts, temporal }) {
  const operation = execution.operation;
  requireActorAndTargets(operation, contracts, {
    kinds: ACTIVITY_KINDS,
    targetRefs: [
      ...contracts.autonomous.available_resource_refs,
      contracts.localTransition.destination_zone_ref
    ],
    kindField: 'activity_kind'
  });
  const selection = selectApplicableNpcActivityExecution({
    operation,
    activity_profiles: contracts.scheduleActivityProfiles,
    execution_bindings: Object.values(contracts.scheduleExecutions),
    movement_bindings: [contracts.localTransition],
    property_transition_profiles: tracePhase7PropertyTransitions(contracts)
  });
  if (!selection.pass) {
    fail(selection.errors[0].code, selection.errors);
  }
  const profile = selection.execution_binding;
  const owned = resolveTracePhase7DomainProposals({
    operation, state, contracts, profile
  });
  return started({ execution, temporal, profile,
    movement: owned.movement, property: owned.property });
}

function executeItem({ execution, state, contracts, temporal }) {
  const operation = execution.operation;
  const transitions = tracePhase7ItemUseTransitions(contracts);
  requireActorAndTargets(operation, contracts, {
    kinds: ['operate', 'other'],
    targetRefs: transitions.map(tracePhase7TransitionTarget),
    kindField: 'use_kind'
  });
  if (operation.item_ref !== contracts.roadBag.item_ref
      || operation.target_refs.length !== 1) {
    fail('TRACE_PHASE_7_ITEM_REQUEST_NOT_APPLICABLE');
  }
  const { property } = resolveTracePhase7DomainProposals({
    operation, state, contracts
  });
  return started({ execution, temporal, profile: null, movement: null,
    property });
}

function started({ execution, temporal, profile, movement, property,
  minutes = null, npcRef = null }) {
  const duration = minutes == null
    ? profileMinutes(profile) ?? remainingMinutes(temporal) : Number(minutes);
  if (!Number.isSafeInteger(duration) || duration < 1
      || duration > remainingMinutes(temporal)) {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  const operation = execution.operation;
  const active = {
    npc_ref: npcRef ?? operation.actor_ref, status: 'started',
    started_at: structuredClone(temporal.result.clock_after),
    semantic_operation: structuredClone(operation),
    planned_exact_elapsed: {
      exact_minutes: { numerator: String(duration), denominator: '1' }
    }
  };
  return {
    working_projection: {
      ...structuredClone(execution.working_projection),
      active_npc_actor_step: active
    },
    summary: `npc_actor_step:${operation.op}`,
    consequence_fragment: Object.freeze({
      owner: '@rus/turn/actor-step', domain_owner: domainOwner(operation.op),
      status: 'started', failure_code: null,
      npc_ref: npcRef ?? operation.actor_ref,
      semantic_operation: structuredClone(operation),
      execution_binding_ref: profile?.execution_binding_id ?? null,
      schedule_option_id: profile?.schedule_option_id ?? null,
      activity_profile_ref: profile?.activity_profile_ref ?? null,
      exact_elapsed: structuredClone(active.planned_exact_elapsed),
      clock_before: structuredClone(temporal.result.clock_after),
      clock_after: structuredClone(temporal.result.clock_after),
      root_clock_write_count: 0, movement_proposal: movement,
      property_proposal: property,
      factual_result_source: 'code_owned_actor_step_domain_execution',
      parent_state_version: execution.request.committed_state_version
    }),
    goal_result: execution.plan.goal_result,
    continuation: null,
    player_response_boundary: true
  };
}

function requireActorAndTargets(operation, contracts, {
  kinds, targetRefs, kindField, singleTargetField = null
}) {
  const refs = singleTargetField == null
    ? operation.target_refs : [operation[singleTargetField]];
  if (operation.actor_ref !== contracts.zhdanko.instance_id
      || !kinds.includes(operation[kindField])
      || refs.some((ref) => !targetRefs.includes(ref))) {
    fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
}

function remainingMinutes(temporal) {
  const exact = subtractGameTimestamp(
    temporal.limit_timestamp, temporal.result.clock_after);
  if (exact.denominator !== '1') fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function profileMinutes(profile) {
  if (profile == null) return null;
  return (profile.elapsed_plan?.stages ?? []).reduce(
    (sum, stage) => sum + stage.duration_minutes, 0);
}

function domainOwner(operation) {
  if (operation === 'apply_semantic_activity') return '@rus/turn';
  if (operation === 'request_item_use') return '@rus/items-property';
  return '@rus/turn';
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
