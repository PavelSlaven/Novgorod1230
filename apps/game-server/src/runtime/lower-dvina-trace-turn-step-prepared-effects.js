import { serverError } from '../errors.js';
import { deepFreeze } from
  './lower-dvina-trace-turn-step-runtime-common.js';

const PHASE3_ROUTE_COMMAND =
  'lower_dvina_trace.follow_path_to_fishing_camp';

export function createLowerDvinaTracePreparedDomainEffect({
  committedState
}) {
  return Object.freeze({
    supports({ operation, command_id: commandId } = {}) {
      return operation?.op === 'request_movement'
        && commandId === PHASE3_ROUTE_COMMAND;
    },
    async apply(input) {
      return applyPreparedPhase3Route({
        input,
        committedState
      });
    }
  });
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
