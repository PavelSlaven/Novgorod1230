import { executeTraceLocalTraversal } from
  './lower-dvina-trace-local-traversal.js';
import { traceCombatMovementBindings } from
  './lower-dvina-trace-combat-bindings.js';
import { getCommittedActorInventoryLoad } from
  './lower-dvina-trace-committed-inventory.js';

export function executeTraceCombatTraversal({ proposal, step, intent,
  working_state: working, temporal_slice: temporalSlice }, context) {
  const bindings = traceCombatMovementBindings(context)
    .route_execution_bindings?.filter(
      ({ movement_ref: ref }) => ref === proposal.movement_ref) ?? [];
  if (bindings.length !== 1
      || proposal.source.location_ref !== working.position?.location_ref
      || proposal.source.anchor_id !== working.position?.g5_anchor_id) {
    fail('TRACE_COMBAT_TRAVERSAL_BINDING_GAP');
  }
  const binding = bindings[0];
  const inventoryLoad = getCommittedActorInventoryLoad(
    working, intent.actor_ref.entity_id);
  const exact = temporalSlice?.exact_duration?.exact_minutes
    ?? proposal.exact_elapsed?.exact_minutes;
  if (exact?.denominator !== '1'
      || !Number.isSafeInteger(Number(exact.numerator))
      || Number(exact.numerator) <= 0) {
    fail('TRACE_COMBAT_TRAVERSAL_TIME_INVALID');
  }
  const existing = (working.active_combat_traversals ?? []).find(
    (entry) => entry.actor_ref?.entity_kind === intent.actor_ref.entity_kind
      && entry.actor_ref.entity_id === intent.actor_ref.entity_id
      && entry.intent_id === intent.intent_id
      && entry.movement_ref === proposal.movement_ref)?.traversal ?? null;
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
    inventoryLoad,
    participantGroup: [intent.actor_ref.entity_id],
    exactElapsedMinutes: Number(exact.numerator),
    clockCommitMode: temporalSlice?.clock_commit_mode
      ?? 'direct_party_clock',
    synchronizedTimeSliceResultId:
      temporalSlice?.synchronized_time_slice_result_id ?? null,
    interruptionKind: temporalSlice?.continuation_allowed === false
      ? 'stranded' : null,
    existingTraversal: existing });
  return { ...traversal, actor_ref: structuredClone(intent.actor_ref),
    route_binding: structuredClone(binding.route) };
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
