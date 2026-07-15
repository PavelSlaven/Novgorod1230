import { TURN_TRAVEL_COMMAND_IDS } from './contracts.js';
import { abandonJourney, advanceJourney, applyTravelLifecycleMetadata, buildTravelAdvanceResult, buildTravelArrivalRequest, buildTravelChangeSetProposal, campJourney, changeJourneyPace, createJourney, interruptJourney, rerouteJourney, resumeJourney } from '@rus/travel';

const TRAVEL_STATE_BLOCKS = Object.freeze(['party_state', 'current_position', 'clock_weather_light', 'active_journey', 'journey_legs', 'travel_position', 'environment_landmarks', 'environment_cues', 'movement_traces', 'transport_state', 'relevant_routes', 'character_knowledge_map', 'relevant_hidden_state']);
const TRAVEL_WRITES = Object.freeze(['party_journeys', 'party_journey_legs', 'party_current_position', 'party_environment_runs', 'party_environment_choices', 'party_environment_landmarks', 'party_environment_cues', 'party_environment_traces', 'party_visible_context_package', 'party_narrator_output']);

export function createTravelTurnCommandDefinitions() {
  return Object.freeze(TURN_TRAVEL_COMMAND_IDS.map((commandId) => Object.freeze({
    command_id: commandId,
    target_id: 'travel_runtime',
    expected_cost: { kind: 'time', value: 0 },
    known_risks: [],
    reason_visible_to_actor: 'Доступное действие путешествия.',
    matches(context) { return context?.routing_context?.travel_command_id === commandId; },
    mode: modeFor(commandId),
    availability(context) {
      const decision = context?.retrievedState?.travel_command_availability;
      if (decision?.command_id === commandId) return decision.value;
      return { version: 1, schema: 'turn_availability_decision', status: 'blocked', can_attempt: false, reasons: ['TRAVEL_HANDLER_CONTEXT_MISSING'], check_requests: [] };
    },
    consequence(context) {
      if (['travel.start_route', 'travel.start_course'].includes(commandId)) return startJourney(commandId, context);
      return executableCommand(commandId) ? transitionJourney(commandId, context) : missingContext();
    },
    writeTargets(context) { return executableCommand(commandId) ? continueWriteTargets(context) : missingContext(); }
  })));
}

function modeFor(commandId) {
  const primary = commandId === 'travel.start_course' ? 'long_course' : 'movement_route';
  return {
    selected_primary_mode: primary,
    secondary_modes: ['route', 'long_course_materialization', 'time_progression', 'body_state', 'visible_context_projection'],
    resolution_plan: {
      subsystems: ['movement', 'route', 'long_course_materialization', 'body_state', 'time_progression', 'visible_context_projection'],
      checks_to_run: ['route_access', 'body_state'],
      expected_writes: TRAVEL_WRITES,
      state_blocks_to_load: TRAVEL_STATE_BLOCKS
    }
  };
}

function travelHandlerError(code, message) { return Object.assign(new Error(message), { code }); }

function transitionJourney(commandId, { retrievedState } = {}) {
  const journey = retrievedState?.active_journey;
  const travelContext = retrievedState?.travel_context;
  const request = commandId === 'travel.reroute' ? retrievedState?.travel_reroute_request : retrievedState?.travel_advance_request;
  if (!journey || !travelContext || !validRequest(request)) return missingContext();
  if (commandId === 'travel.reroute' && !plain(request.journey_plan)) return missingContext();
  if (commandId === 'travel.continue' && (!Number.isInteger(request.progress_permille) || request.progress_permille < 0 || request.progress_permille > 1000)) return missingContext();
  const after = applyTravelLifecycleMetadata({ before: journey, after: applyTransition(commandId, journey, travelContext, request), elapsed_minutes: request.duration_minutes, updated_at: request.updated_at });
  const advanceResult = commandId === 'travel.continue' ? buildTravelAdvanceResult({ before: journey, after, request }) : null;
  const resultJourney = advanceResult?.journey ?? after;
  const proposal = buildTravelChangeSetProposal({ before: journey, after: resultJourney, idempotency_key: request.idempotency_key, expected_state_version: retrievedState.party_state?.state_version });
  const arrivalRequest = advanceResult?.arrival_request ?? (resultJourney.status === 'arrived' ? buildTravelArrivalRequest({ before: journey, after: resultJourney }) : null);
  return {
    version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: Number(request.duration_minutes), visible_seed: structuredClone(request.visible_seed),
    hidden_update: {
      travel_change_set_proposal: proposal,
      ...(advanceResult ? { travel_advance_result: advanceResult } : {}),
      ...(arrivalRequest ? { travel_arrival_request: arrivalRequest } : {})
    },
    ...(arrivalRequest ? {
      position_transition: {
        from_g4_id: arrivalRequest.from_g4_id,
        to_g4_id: arrivalRequest.to_g4_id,
        destination_position: arrivalRequest.destination_position
      }
    } : {}),
    state_changes: [{ target: 'travel_journey', operation: commandId }], suggested_actions: structuredClone(request.suggested_actions)
  };
}

function startJourney(commandId, { retrievedState } = {}) {
  const travelContext = retrievedState?.travel_context;
  const request = retrievedState?.travel_start_request;
  if (!travelContext || !validRequest(request) || !plain(request.journey_plan)) return missingContext();
  const expectedMode = commandId === 'travel.start_route' ? 'route' : 'course';
  if (request.journey_plan.mode !== expectedMode) return missingContext();
  const journey = createJourney(request.journey_plan, travelContext);
  const proposal = buildTravelChangeSetProposal({ before: null, after: journey, idempotency_key: request.idempotency_key, expected_state_version: retrievedState.party_state?.state_version });
  return {
    version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: Number(request.duration_minutes), visible_seed: structuredClone(request.visible_seed),
    hidden_update: { travel_change_set_proposal: proposal }, state_changes: [{ target: 'travel_journey', operation: commandId }], suggested_actions: structuredClone(request.suggested_actions)
  };
}

function applyTransition(commandId, journey, context, request) {
  if (commandId === 'travel.continue') return advanceJourney({ journey, context, progress_permille: request.progress_permille, perceived_position: request.perceived_position ?? null });
  if (commandId === 'travel.stop') return interruptJourney({ journey, context, interruption: request.interruption });
  if (commandId === 'travel.camp') return campJourney({ journey, context, camp: request.camp });
  if (commandId === 'travel.resume') return resumeJourney({ journey, context });
  if (commandId === 'travel.change_pace') return changeJourneyPace({ journey, context, pace_profile_id: request.pace_profile_id });
  if (commandId === 'travel.abandon') return abandonJourney({ journey, context });
  if (commandId === 'travel.reroute') return rerouteJourney({ journey, plan: request.journey_plan, context });
  return missingContext();
}

function continueWriteTargets({ consequence } = {}) {
  const proposal = consequence?.hidden_update?.travel_change_set_proposal;
  if (!proposal) return missingContext();
  return [
    { target: 'party_journeys', value: proposal.journey },
    { target: 'party_journey_legs', value: proposal.journey.legs },
    { target: 'party_current_position', value: proposal.position }
  ];
}

function missingContext() { throw travelHandlerError('TRAVEL_HANDLER_CONTEXT_MISSING', 'Travel command requires a complete formal travel context and persistence proposal.'); }
function executableCommand(commandId) { return ['travel.start_route', 'travel.start_course', 'travel.continue', 'travel.stop', 'travel.camp', 'travel.resume', 'travel.change_pace', 'travel.reroute', 'travel.abandon'].includes(commandId); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
function validRequest(request) { return request && typeof request === 'object' && Number.isInteger(request.duration_minutes) && request.duration_minutes >= 0 && text(request.updated_at) && plain(request.visible_seed) && Array.isArray(request.suggested_actions) && text(request.idempotency_key); }
