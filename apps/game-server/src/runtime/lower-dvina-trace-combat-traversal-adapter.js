import { executeTraceLocalTraversal } from
  './lower-dvina-trace-local-traversal.js';
import { traceCombatMovementBindings } from
  './lower-dvina-trace-combat-bindings.js';

export function executeTraceCombatTraversal({ proposal, step, intent,
  working_state: working }, context) {
  const bindings = traceCombatMovementBindings(context)
    .route_execution_bindings?.filter(
      ({ movement_ref: ref }) => ref === proposal.movement_ref) ?? [];
  if (bindings.length !== 1
      || proposal.source.location_ref !== working.position?.location_ref
      || proposal.source.anchor_id !== working.position?.g5_anchor_id) {
    fail('TRACE_COMBAT_TRAVERSAL_BINDING_GAP');
  }
  const binding = bindings[0];
  const traversal = executeTraceLocalTraversal({ state: working,
    playerInput: context.playerInput, inputDigest: context.inputDigest,
    namespace: `trace-combat-${context.session.combat_id}-${step.proposal_id}`,
    route: binding.route, executionProfile: binding.execution_profile,
    sourceEndpoint: binding.source_endpoint,
    destinationEndpoint: binding.destination_endpoint,
    destinationLocationRef: binding.destination_location_ref,
    destinationAnchorId: binding.destination_anchor_id,
    accessPolicy: binding.access_policy,
    capacityContract: binding.capacity_contract,
    inventoryLoad: { total_mass_grams: 0, hands_used: 0,
      load_category: 'light' },
    participantGroup: [intent.actor_ref.entity_id] });
  return { ...traversal, actor_ref: structuredClone(intent.actor_ref),
    route_binding: structuredClone(binding.route) };
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
