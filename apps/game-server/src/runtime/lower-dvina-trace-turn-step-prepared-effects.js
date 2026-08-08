import { serverError } from '../errors.js';
import { deepFreeze } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { applyTracePhase7ScheduleState } from
  './lower-dvina-trace-phase-7-state-projection.js';

const PHASE3_ROUTE_COMMAND =
  'lower_dvina_trace.follow_path_to_fishing_camp';
const PHASE7_REST_COMMAND =
  'lower_dvina_trace.rest_by_fire_and_dry_clothing';
export const TURN10_COMPANION_COMMAND =
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse';

export function createLowerDvinaTracePreparedDomainEffect({
  committedState
}) {
  let currentState = structuredClone(committedState);
  return Object.freeze({
    supports({ operation, command_id: commandId } = {}) {
      return (operation?.op === 'request_movement'
          && commandId === PHASE3_ROUTE_COMMAND)
        || (operation?.op === 'request_activity'
          && commandId === PHASE7_REST_COMMAND)
        || (operation?.op === 'emit_interaction'
          && commandId === TURN10_COMPANION_COMMAND);
    },
    currentState() {
      return structuredClone(currentState);
    },
    advanceState({ prepared_effect: effect }) {
      currentState = projectPreparedDomainState(currentState, effect);
      return structuredClone(currentState);
    },
    async apply(input) {
      if (input?.command_id === PHASE3_ROUTE_COMMAND) {
        return applyPreparedPhase3Route({ input, committedState });
      }
      if (input?.command_id === PHASE7_REST_COMMAND) {
        return applyPreparedPhase7Rest(input);
      }
      if (input?.command_id === TURN10_COMPANION_COMMAND) {
        return applyPreparedTurn10Conversation(input);
      }
      fail('TRACE_TURN_STEP_PREPARED_COMMAND_UNSUPPORTED');
    }
  });
}

function applyPreparedPhase7Rest(input) {
  const consequence = input?.consequence;
  if (consequence?.phase7_kind !== 'fire_rest'
      || consequence.duration_minutes !== 30
      || input?.prepared_chain_context?.prior_effect_count !== 0) {
    fail('TRACE_TURN_STEP_PREPARED_PHASE7_INVALID');
  }
  return preparedResult(input, consequence, false);
}

function applyPreparedTurn10Conversation(input) {
  const consequence = input?.consequence;
  if (consequence?.turn10_kind !== 'companion_request'
      || consequence.duration_minutes !== 0
      || input?.prepared_chain_context?.prior_effect_count !== 1) {
    fail('TRACE_TURN_STEP_PREPARED_TURN10_INVALID');
  }
  return preparedResult(input, consequence, true);
}

function preparedResult(input, consequence, playerResponseBoundary) {
  return deepFreeze({
    working_projection: structuredClone(input.working_projection),
    summary: `prepared:${input.command_id}`,
    write_fragments: [],
    player_response_boundary: playerResponseBoundary,
    prepared_effect_request: {
      effect_kind: 'domain_command',
      owner_ref: input.command_id,
      operation_ref: input.operation.op,
      availability: structuredClone(input.availability),
      consequence: structuredClone(consequence)
    }
  });
}

function projectPreparedDomainState(state, effect) {
  let next = structuredClone(state);
  next.clock = structuredClone(effect.time_update.clock_after);
  next.clock_weather_light = {
    ...structuredClone(next.clock_weather_light ?? {}),
    clock: structuredClone(next.clock)
  };
  next.body_state = structuredClone(effect.body_update.state_after);
  if (effect.consequence?.phase7_kind === 'fire_rest') {
    const phase7 = effect.consequence.phase7;
    next = applyTracePhase7ScheduleState({
      state: next,
      execution: phase7.schedule_execution,
      changeSetId: null,
      activeActorStep:
        phase7.schedule_temporal.projection?.active_npc_actor_step
    });
    next.phase7_fire_rest = {
      status: phase7.schedule_temporal.result
        .temporal_status === 'completed' ? 'completed' : 'paused'
    };
    next.temporal_boundary_candidates = [];
  }
  return next;
}

async function applyPreparedPhase3Route({
  input,
  committedState
}) {
  const consequence = input?.consequence;
  const movement = consequence?.movement;
  const duration = Number(consequence?.duration_minutes);
  if (consequence?.phase3_kind !== 'movement'
      || !Number.isSafeInteger(duration) || duration <= 0
      || movement?.destination?.location_ref == null
      || input?.prepared_chain_context?.prior_effect_count !== 0) {
    fail('TRACE_TURN_STEP_PREPARED_ROUTE_INVALID');
  }
  const projection = buildLowerDvinaTracePreparedRouteWorkingProjection({
    projection: input.working_projection,
    movement,
    committedState
  });
  return deepFreeze({
    working_projection: projection,
    summary: `prepared:${input.command_id}`,
    write_fragments: [],
    player_response_boundary: false,
    prepared_effect_request: {
      effect_kind: 'domain_command',
      owner_ref: input.command_id,
      operation_ref: input.operation.op,
      availability: structuredClone(input.availability),
      consequence: structuredClone(consequence)
    }
  });
}

export function buildLowerDvinaTracePreparedRouteWorkingProjection({
  projection,
  movement,
  committedState,
  clockAfter
}) {
  const destination = movement.destination;
  const scene = (committedState.prepared_scenes ?? []).find(
    ({ location_profile_ref: locationRef }) =>
      locationRef === destination.location_ref);
  if (!scene?.node?.instance_id) {
    fail('TRACE_TURN_STEP_PREPARED_ROUTE_DESTINATION_INVALID');
  }
  const routeEntry = {
    route_ref: movement.route_ref,
    from_ref: movement.source.location_ref,
    to_ref: destination.location_ref,
    status: 'completed'
  };
  const moved = {
    ...structuredClone(projection),
    position: {
      ...structuredClone(projection.position ?? {}),
      location_ref: destination.location_ref,
      g5_anchor_id: destination.g5_anchor_id,
      g5_node_id: scene.node.instance_id,
      ...(destination.zone_ref == null
        ? {} : { zone_ref: destination.zone_ref })
    },
    route_history: [
      ...structuredClone(projection.route_history ?? []),
      routeEntry
    ]
  };
  if (clockAfter == null) return moved;
  return {
    ...moved,
    clock: structuredClone(clockAfter),
    clock_weather_light: {
      ...structuredClone(moved.clock_weather_light ?? {}),
      clock: structuredClone(clockAfter)
    }
  };
}

function fail(code) {
  throw serverError(code, 'Prepared turn-step effect failed closed.', {
    status: 409
  });
}
