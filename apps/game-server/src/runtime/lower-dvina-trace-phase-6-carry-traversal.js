import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createSpatialV3ExecutionEngine } from
  '@rus/turn/spatial-v3-execution';

export function executeTracePhase6CarryTraversal({ state, contracts, inputDigest,
  commandIdempotencyKey, intent, prior, requiredCamp }) {
  const turnNumber = Number(state.party_state.turn_number) + 1;
  const routeExecutionId = `route-execution:${state.party_id}:trace-phase6:carry`;
  const routePlanId = `route-plan:${state.party_id}:trace-phase6:carry`;
  const travelStateId = `travel-state:${state.party_id}:trace-phase6:carry`;
  const intervalOrdinal = intent.attempt.ordinal;
  const changeSetId = `change:${state.party_id}:trace-phase6:${turnNumber}`;
  const exactIdempotencyKey = commandIdempotencyKey ?? inputDigest;
  const idemId = `idem:${state.party_id}:${canonicalDigest(exactIdempotencyKey).slice(0, 20)}`;
  const pins = seal({ pins: [{ dependency_role: 'route_binding', entity_ref: { entity_kind: 'movement_route_binding', entity_id: contracts.route.route_id }, version_pin: { pin_kind: 'authoring_version', authoring_version: String(contracts.route.version), state_version: null } }, { dependency_role: 'activity_profile', entity_ref: { entity_kind: 'activity_profile', entity_id: contracts.activity.profile_id }, version_pin: { pin_kind: 'authoring_version', authoring_version: String(contracts.activity.version), state_version: null } }] });
  const source = seal({ endpoint_kind: 'scene_position', endpoint_id: contracts.sourceEndpoint.endpoint_id, location_ref: state.position.location_ref, g5_anchor_id: state.position.g5_anchor_id });
  const target = seal({ endpoint_kind: 'scene_position', endpoint_id: contracts.destinationEndpoint.endpoint_id, location_ref: contracts.terminalPlacement.group.location_ref, g5_anchor_id: intent.terminal_group_position?.g5_anchor_id ?? requiredCamp(state, contracts).anchor.instance_id });
  const context = seal({ context_id: `trace-phase6-carry:${state.party_id}`, route_ref: contracts.route.route_id, access_policy_ref: contracts.accessPolicy.policy_id, capacity_contract_ref: contracts.capacity.contract_id, assembly_snapshot_digest: intent.assembly_snapshot.canonical_digest, participant_ids: [...intent.internal_rebinding.initial_carrier_ids, intent.internal_rebinding.replacement_carrier_id, intent.carried_actor_id].sort() });
  const engine = createSpatialV3ExecutionEngine();
  let travelState = prior?.traversal?.final_travel_state ?? null;
  if (travelState == null) {
    const started = engine.startTraversal({ departure_valid: true, travel_state_id: travelStateId, execution_id: routeExecutionId, party_id: state.party_id, idempotency_key: `${exactIdempotencyKey}:phase6:route-start`, idempotency_record_id: idemId, change_set_id: changeSetId, occurred_at_turn: turnNumber, step_ordinal: 0, departure_endpoint: source, arrival_endpoint: target, segment_id: contracts.route.route_id, method_id: contracts.route.movement_method, capacity_units: 5, context_snapshot: context, dependency_pins: pins });
    if (!started.ok) fail('TRACE_PHASE_6_ROUTE_START_REJECTED');
    travelState = started.travel_state;
  } else if (travelState.execution_id !== routeExecutionId || travelState.progress_ppm !== intent.progress_before_ppm || Number(travelState.next_interval_ordinal) !== intervalOrdinal || travelState.status !== 'paused_in_transit') fail('TRACE_PHASE_6_ROUTE_RESUME_STALE');
  const dynamicSnapshot = seal({ snapshot_id: `trace-phase6-carry:${state.party_id}:${intervalOrdinal}`, assembly_snapshot_digest: intent.assembly_snapshot.canonical_digest, carrier_inventory_snapshots: intent.carrier_inventory_snapshots, internal_rebinding_applied: intent.internal_rebinding.applied_in_this_attempt });
  const terminal = intent.execution_after.status === 'completed';
  const resolved = engine.resolveTraversalInterval({ party_id: state.party_id, execution_id: routeExecutionId, idempotency_key: `${exactIdempotencyKey}:phase6:route:${intervalOrdinal}`, change_set_id: changeSetId, idempotency_record_id: idemId, occurred_at_turn: turnNumber, step_ordinal: 0, interval_ordinal: intervalOrdinal, clock_commit_mode: 'direct_party_clock', world_time_before: structuredClone(state.clock), travel_state: travelState, progress_before_ppm: intent.progress_before_ppm, planned_progress_after_ppm: intent.progress_after_ppm, actual_progress_after_ppm: intent.progress_after_ppm, planned_time: structuredClone(intent.exact_elapsed), actual_time: structuredClone(intent.exact_elapsed), cumulative_before: structuredClone(intent.cumulative_elapsed_before), dynamic_snapshot: dynamicSnapshot, dynamic_dependency_pins: pins, execution_context_snapshot: context, delay_occurrence_history: seal({ id: `trace-phase6-carry-delay:${state.party_id}:${intervalOrdinal}`, committed_occurrence_keys: [] }), source_signals: seal({ dependency_pins: pins, ...(terminal ? {} : { pause: true }) }), result_code: terminal ? 'trace_phase6_carry_completed' : 'trace_phase6_external_boundary_pause' });
  if (!resolved.ok || resolved.result.actual_time_numerator !== intent.exact_elapsed.numerator || resolved.result.actual_time_denominator !== '1' || resolved.result.actual_progress_after_ppm !== intent.progress_after_ppm || resolved.result.result_kind !== (terminal ? 'segment_completed' : 'paused_in_transit') || resolved.clock_update == null) fail('TRACE_PHASE_6_ROUTE_INTERVAL_REJECTED');
  return { owner: '@rus/movement-routes', ids: { plan_id: routePlanId, execution_id: routeExecutionId, travel_state_id: travelStateId, interval_id: resolved.result.id }, source_endpoint: source, target_endpoint: target, dependency_pins: pins, context_snapshot: context, planning_state_version: state.party_state.state_version, interval_result: structuredClone(resolved.result), final_travel_state: structuredClone(resolved.travel_state), clock_before: structuredClone(state.clock), clock_update: structuredClone(resolved.clock_update), started_in_this_attempt: prior == null };
}

function seal(payload) { return { ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) }; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
