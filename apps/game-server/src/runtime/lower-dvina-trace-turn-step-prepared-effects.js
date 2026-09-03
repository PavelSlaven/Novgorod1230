import { serverError } from '../errors.js';
import { deepFreeze } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { projectPreparedDomainState } from
  './lower-dvina-trace-turn-step-prepared-state-projection.js';
import { validTracePreparedCombatConsequence } from
  './lower-dvina-trace-combat-prepared-contract.js';
import { validTraceCombatStartConsequence } from
  './lower-dvina-trace-combat-prepared-contract.js';
import { TRACE_PHASE9_PREPARED_COMMANDS } from
  './lower-dvina-trace-phase-9-prepared-commands.js';

const PHASE3_ROUTE_COMMAND =
  'lower_dvina_trace.follow_path_to_fishing_camp';
const PHASE7_REST_COMMAND =
  'lower_dvina_trace.rest_by_fire_and_dry_clothing';
const PHASE8_ROUTE_COMMAND =
  'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse';
export const TURN10_COMPANION_COMMAND =
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse';
export const COMBAT_RESPONSE_COMMAND =
  'lower_dvina_trace.respond_in_active_combat';
const KNOWN_ROUTE_COMMAND = 'lower_dvina_trace.follow_admitted_known_route:';

export function createLowerDvinaTracePreparedDomainEffect({
  committedState
}) {
  let currentState = structuredClone(committedState);
  return Object.freeze({
    supports({ operation, command_id: commandId,
      prepared_chain_context: context } = {}) {
      const priorCount = context?.prior_effect_count ?? 0;
      return (operation?.op === 'request_movement'
          && [PHASE3_ROUTE_COMMAND, PHASE8_ROUTE_COMMAND]
            .includes(commandId) && priorCount === 0)
        || (operation?.op === 'request_movement'
          && commandId?.startsWith(KNOWN_ROUTE_COMMAND) === true
          && priorCount === 0)
        || (operation?.op === 'request_activity'
          && commandId === PHASE7_REST_COMMAND && priorCount === 0)
        || (operation?.op === 'emit_interaction'
          && commandId === TURN10_COMPANION_COMMAND && priorCount === 1)
        || (operation?.op === 'request_combat'
          && commandId === COMBAT_RESPONSE_COMMAND && priorCount === 0)
        || (TRACE_PHASE9_PREPARED_COMMANDS.has(commandId) && priorCount === 0);
    },
    currentState() {
      return structuredClone(currentState);
    },
    advanceState({ prepared_effect: effect }) {
      currentState = projectPreparedDomainState(currentState, effect);
      return structuredClone(currentState);
    },
    async apply(input) {
      if ([PHASE3_ROUTE_COMMAND, PHASE8_ROUTE_COMMAND]
        .includes(input?.command_id)
        || input?.command_id?.startsWith(KNOWN_ROUTE_COMMAND) === true) {
        return applyPreparedPhase3Route({ input, committedState });
      }
      if (input?.command_id === PHASE7_REST_COMMAND) {
        return applyPreparedPhase7Rest(input);
      }
      if (input?.command_id === TURN10_COMPANION_COMMAND) {
        return applyPreparedTurn10Conversation(input);
      }
      if (input?.command_id === COMBAT_RESPONSE_COMMAND) {
        return applyPreparedCombat(input);
      }
      if (TRACE_PHASE9_PREPARED_COMMANDS.has(input?.command_id)) {
        return applyPreparedPhase9(input);
      }
      fail('TRACE_TURN_STEP_PREPARED_COMMAND_UNSUPPORTED');
    }
  });
}

function applyPreparedPhase9(input) {
  const consequence = input?.consequence;
  if (typeof consequence?.phase9_kind !== 'string'
      || consequence.phase9 == null
      || input?.prepared_chain_context?.prior_effect_count !== 0) {
    fail('TRACE_TURN_STEP_PREPARED_PHASE9_INVALID');
  }
  return preparedResult(input, consequence, true);
}

function applyPreparedPhase7Rest(input) {
  const consequence = input?.consequence;
  const restCompleted = consequence?.phase7?.schedule_temporal
    ?.rest_completed === true;
  const resumed = consequence?.phase7?.resumed === true;
  const duration = Number(consequence?.duration_minutes);
  const validDuration = Number.isSafeInteger(duration) && duration > 0
    && (resumed ? duration <= 5
      : restCompleted ? duration === 30 : duration >= 25 && duration < 30);
  if (consequence?.phase7_kind !== 'fire_rest'
      || !validDuration
      || input?.prepared_chain_context?.prior_effect_count !== 0) {
    fail('TRACE_TURN_STEP_PREPARED_PHASE7_INVALID');
  }
  return preparedResult(input, consequence, false);
}

function applyPreparedTurn10Conversation(input) {
  const consequence = input?.consequence;
  if (consequence?.turn10_kind !== 'companion_request'
      || consequence.duration_minutes !== 5
      || consequence.parent_activity_completion?.status !== 'completed'
      || input?.prepared_chain_context?.prior_effect_count !== 1) {
    fail('TRACE_TURN_STEP_PREPARED_TURN10_INVALID');
  }
  return preparedResult(input, consequence, true);
}

function applyPreparedCombat(input) {
  const consequence = input?.consequence;
  const session = consequence?.combat?.session_after
    ?? consequence?.combat_initialization?.session;
  const pausedForPlayer = session?.status === 'paused_for_player'
    && session.player_response_required === true;
  if (!(validTracePreparedCombatConsequence(consequence)
      || validTraceCombatStartConsequence(consequence))
      || input?.prepared_chain_context?.prior_effect_count !== 0) {
    fail('TRACE_TURN_STEP_PREPARED_COMBAT_INVALID');
  }
  return preparedResult(input, consequence, pausedForPlayer);
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

async function applyPreparedPhase3Route({
  input,
  committedState
}) {
  const consequence = input?.consequence;
  const movement = consequence?.movement;
  const duration = Number(consequence?.duration_minutes);
  if (!['movement'].includes(consequence?.phase3_kind
        ?? consequence?.phase8_kind)
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
      locationRef === destination.location_ref)
    ?? (committedState.first_entry_preparation?.scene?.location_profile_ref
      === destination.location_ref
      ? committedState.first_entry_preparation.scene : null);
  if (!scene?.node?.instance_id) {
    fail('TRACE_TURN_STEP_PREPARED_ROUTE_DESTINATION_INVALID');
  }
  const routeEntry = {
    route_ref: movement.route_ref,
    from_ref: movement.source.location_ref,
    to_ref: destination.location_ref,
    status: 'completed'
  };
  const { active_interlocutor: _activeInterlocutor,
    ...projectionWithoutInterlocutor } = structuredClone(projection);
  const moved = {
    ...projectionWithoutInterlocutor,
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
