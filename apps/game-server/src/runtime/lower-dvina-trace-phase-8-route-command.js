import { buildTraversalRequest, validateTraversalResult } from
  '@rus/movement-routes';
import { getCommittedInventoryLoad } from
  './lower-dvina-trace-committed-inventory.js';
import { executeTraceLocalTraversal } from
  './lower-dvina-trace-local-traversal.js';
import { available, mode, phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';

const COMMAND_ID = 'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse';
const EXACT = new Set([
  'идти к жданко всем вместе. ратшу держать между нами. не входить тайком.',
  'идти к жданко всем вместе. ратшу держать между нами. не входить тайком'
]);

export function createTracePhase8RouteCommand({ contracts, inputDigest }) {
  return Object.freeze({
    command_id: COMMAND_ID,
    option_id: 'follow_known_route_to_zhdanko_storehouse',
    label: 'Пройти известным путём к клети Жданко',
    target_id: contracts.ids.storehouse,
    approved_record: contracts.activityPins.find(
      ({ id }) => id === contracts.routeActivity.profile_id),
    preconditions: [{ kind: 'phase8_route_available' }],
    expected_cost: { kind: 'exact_time', value: 12 },
    known_risks: ['У клети может ждать вооружённый человек.'],
    reason_visible_to_actor: 'Путь к клети известен от проводника.',
    mode: mode('movement_route', ['movement', 'route', 'time_progression']),
    matches: ({ raw_text: text }) => EXACT.has(normalize(text)),
    availability({ committed_state: committed, retrievedState }) {
      const state = committed ?? retrievedState;
      const allowed = routeAvailable(state, contracts);
      return available(allowed, [], allowed ? [] : ['phase8_route_unavailable']);
    },
    consequence({ retrievedState: state, playerInput }) {
      if (!routeAvailable(state, contracts)) fail('TRACE_PHASE_8_ROUTE_BLOCKED');
      const inventory = getCommittedInventoryLoad(state);
      if (!inventory.mass.pass || !inventory.hands.pass || !inventory.load.pass) {
        fail('TRACE_PHASE_8_INVENTORY_LOAD_INVALID');
      }
      const participants = routeParticipants(contracts);
      const request = buildTraversalRequest({ id: contracts.route.route_id,
        from_node_id: contracts.route.source_endpoint,
        to_node_id: contracts.route.destination_endpoint,
        base_time_minutes: contracts.route.duration_minutes }, {
        id: state.actor_id, load_category: inventory.load.load_category
      }, { knowledge_level: 'known' });
      const traversal = executeTraceLocalTraversal({ state, playerInput,
        inputDigest, namespace: 'trace-phase8-route', route: contracts.route,
        activity: contracts.routeActivity,
        sourceEndpoint: contracts.sourceEndpoint,
        destinationEndpoint: contracts.destinationEndpoint,
        destinationLocationRef: contracts.ids.storehouse,
        destinationAnchorId: contracts.storehouseAnchor,
        accessPolicy: contracts.access, capacityContract: contracts.capacity,
        inventoryLoad: { total_mass_grams: inventory.mass.total_mass_grams,
          hands_used: inventory.hands.hands_used,
          load_category: inventory.load.load_category },
        participantGroup: participants });
      const result = { route_id: contracts.route.route_id,
        status: traversal.interval_result.result_kind === 'segment_completed'
          ? 'completed' : 'invalid',
        position_node_id: contracts.route.destination_endpoint,
        elapsed_minutes: Number(traversal.interval_result.actual_time_numerator) };
      if (!request.availability.available
          || request.orientation_check_request !== null
          || !validateTraversalResult(result, request).ok) {
        fail('TRACE_PHASE_8_ROUTE_EXECUTION_INVALID');
      }
      return { version: 1, schema: 'turn_consequence_package',
        status: 'resolved', activity_attempt_id:
          `attempt:${inputDigest.slice(0, 32)}`, duration_minutes: 12,
        phase8_kind: 'movement', movement: {
          owner: '@rus/movement-routes',
          activity_ref: contracts.routeActivity.profile_id,
          route_ref: contracts.route.route_id,
          source: { location_ref: state.position.location_ref,
            g5_anchor_id: state.position.g5_anchor_id },
          destination: { location_ref: contracts.ids.storehouse,
            g5_anchor_id: contracts.storehouseAnchor, zone_ref: 'yard' },
          participants, result, traversal,
          inventory_load: structuredClone(traversal.inventory_load),
          reverse_route_ref: contracts.route.reverse_route_ref,
          route_history_effects:
            structuredClone(contracts.route.route_history_effects) },
        visible_seed: {}, hidden_update: {}, state_changes: [],
        suggested_actions: [] };
    },
    writeTargets: phase3WriteTargets
  });
}

export function tracePhase8RoutePreconditionSatisfied(precondition, state,
  contracts) {
  return precondition?.kind === 'phase8_route_available'
    && routeAvailable(state, contracts);
}

function routeAvailable(state, contracts) {
  const participants = new Set(routeParticipants(contracts));
  const present = new Set((state.npcs ?? []).filter(({ anchor_id: anchor }) =>
    anchor === state.position?.g5_anchor_id).map(({ instance_id: id }) => id));
  return state.position?.location_ref === contracts.ids.camp
    && (state.route_knowledge ?? []).includes(contracts.route.route_id)
    && [...participants].slice(1).every((id) => present.has(id))
    && !(state.combat_sessions ?? []).some(({ status }) => status !== 'ended')
    && state.player_response_boundary == null;
}
function routeParticipants(contracts) { return [contracts.stateActorId,
  contracts.actors.eremey.instance_id,
  contracts.actors.ratsha.instance_id,
  contracts.actors.participatingFisher.instance_id].filter(Boolean); }
function normalize(value) { return String(value ?? '').trim().toLowerCase()
  .replace(/\s+/gu, ' '); }
function fail(code) { throw Object.assign(new Error(code), { code }); }
