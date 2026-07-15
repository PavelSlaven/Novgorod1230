import { TURN_TRAVEL_COMMAND_IDS } from './contracts.js';

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
    consequence() { throw travelHandlerError('TRAVEL_HANDLER_CONTEXT_MISSING', 'Travel command requires a formal travel context and code consequence adapter.'); },
    writeTargets() { throw travelHandlerError('TRAVEL_HANDLER_CONTEXT_MISSING', 'Travel command requires a formal persistence proposal.'); }
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
