import { row, sealedCheck } from './first-playable/plan-shared.js';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { serverError } from '../../errors.js';

export const SITE_TRAVERSAL_OWNER = '@rus/turn/spatial-v3-site-connection-traversal';

export function applySiteTraversalTransition({ snapshot, state, consequence }) {
  const transition = consequence?.position_transition;
  if (transition?.owner !== SITE_TRAVERSAL_OWNER) return false;
  const plan = consequence.spatial_v3_traversal?.plan;
  const result = consequence.spatial_v3_traversal?.result;
  const step = plan?.steps?.[0];
  if (transition.actor_id !== state.actor_id || !state.journey_location?.id
    || state.journey_location.scene_position_id !== transition.from_position_ref
    || state.position?.position_id !== transition.from_position_ref
    || Number(state.journey_location.state_version) !== transition.expected_journey_state_version
    || plan?.party_id !== state.party_id || plan.steps.length !== 1
    || step.step_kind !== 'immediate_action'
    || step.static_contract_snapshot?.action_snapshot?.relation_ref?.entity_kind !== 'site_connection'
    || step.static_contract_snapshot.action_snapshot.relation_ref.entity_id !== transition.connection_id
    || step.departure_endpoint_snapshot?.resolved_position_id !== transition.from_position_ref
    || step.arrival_endpoint_snapshot?.resolved_position_id !== transition.to_position_ref
    || result?.result_kind !== 'completed' || result.execution_id == null
    || result.endpoint_before?.endpoint_id !== step.departure_endpoint_snapshot.endpoint_ref.endpoint_id
    || result.endpoint_after?.endpoint_id !== step.arrival_endpoint_snapshot.endpoint_ref.endpoint_id
    || !validateVisibleContext(consequence.visible_seed?.destination_visible_context).ok
    || ![transition.destination_g4_id, transition.destination_site_id,
      transition.destination_g6_instance_id, transition.to_position_ref].every(text)) fail();
  snapshot.position = { g4_id: transition.destination_g4_id,
    site_id: transition.destination_site_id,
    g6_instance_id: transition.destination_g6_instance_id,
    position_id: transition.to_position_ref };
  snapshot.journey_location = { ...state.journey_location,
    scene_position_id: transition.to_position_ref,
    g6_instance_id: transition.destination_g6_instance_id,
    state_version: Number(state.journey_location.state_version) + 1 };
  return true;
}

export function siteTraversalWrites({ partyId, envelope, changeSetId, idemId, turnNumber }) {
  const transition = envelope.consequence?.position_transition;
  if (transition?.owner !== SITE_TRAVERSAL_OWNER) return { writes: null, rechecks: [] };
  const traversal = envelope.consequence.spatial_v3_traversal;
  const plan = traversal?.plan;
  const result = traversal?.result;
  const step = plan?.steps?.[0];
  if (plan?.party_id !== partyId || plan?.created_change_set_id !== changeSetId
    || plan?.created_at_turn !== turnNumber || plan.steps?.length !== 1
    || result?.result_change_set_id !== changeSetId
    || result?.idempotency_record_id !== idemId
    || result?.occurred_at_turn !== turnNumber || result?.result_kind !== 'completed'
    || result?.step_ordinal !== 0 || result?.execution_id == null
    || !text(plan.id) || !text(result.id) || !text(result.execution_id)
    || step?.step_kind !== 'immediate_action') fail();
  const executionId = result.execution_id;
  const event = (ordinal, kind, from, to, location, causal = null) => row(
    'party_route_plan_execution_events', `${executionId}:${ordinal}`, {
      execution_id: executionId, event_ordinal: ordinal, event_kind: kind,
      from_status: from, to_status: to, step_ordinal: 0,
      location_snapshot: location, causal_result_ref: causal,
      change_set_id: changeSetId, idempotency_record_id: idemId,
      occurred_at_turn: turnNumber });
  const origin = step.departure_endpoint_snapshot;
  const arrival = step.arrival_endpoint_snapshot;
  return { writes: {
    inserts: [row('party_route_plans', plan.id, {
      id: plan.id, party_id: partyId, journey_owner_ref: plan.journey_owner_ref,
      journey_scope: plan.journey_scope, request_kind: plan.request_kind,
      recovery_binding_id: null, administrative_authorization_pins: null,
      planning_request_id: plan.planning_request_id, path_query_digest: plan.path_query_digest,
      option_id: plan.option_id, knowledge_scope: plan.knowledge_scope,
      knowledge_subject_ref: plan.knowledge_subject_ref,
      source_endpoint_snapshot: plan.source_endpoint_snapshot,
      target_request: plan.target_request,
      resolved_factual_target_ref: plan.resolved_factual_target_ref,
      target_resolution_dependency_pins: plan.target_resolution_dependency_pins,
      intended_direction_id: plan.intended_direction_id,
      world_revision_id: plan.world_revision_id, catalog_digest: plan.catalog_digest,
      planning_algorithm_version: plan.planning_algorithm_version,
      planning_state_version: plan.planning_state_version,
      planning_context_dependency_pins: plan.planning_context_dependency_pins,
      preparation_snapshot_id: null, preparation_snapshot_digest: null,
      canonical_serialization_digest: plan.canonical_serialization_digest,
      status: 'ready', lifecycle_state_version: 1,
      created_change_set_id: changeSetId, lifecycle_change_set_id: changeSetId,
      created_at_turn: turnNumber }),
    row('party_route_plan_steps', `${plan.id}:0`, {
      route_plan_id: plan.id, ordinal: 0, step_kind: 'immediate_action',
      departure_endpoint_snapshot: origin, arrival_endpoint_snapshot: arrival,
      static_contract_snapshot: step.static_contract_snapshot }),
    row('party_route_plan_executions', executionId, {
      id: executionId, party_id: partyId, route_plan_id: plan.id,
      journey_owner_ref: plan.journey_owner_ref, journey_scope: plan.journey_scope,
      status: 'completed', current_step_ordinal: null, current_endpoint_ref: null,
      active_travel_state_id: null, active_activity_execution_id: null,
      suspension_endpoint_ref: null, final_location_snapshot: arrival,
      abort_reason_code: null, supersedes_execution_id: null,
      superseded_by_execution_id: null, started_at_turn: turnNumber,
      terminal_at_turn: turnNumber, state_version: 3,
      updated_change_set_id: changeSetId })],
    updates: [],
    appends: [row('party_action_step_runs', result.id, {
      id: result.id, party_id: partyId, action_scope: 'route_step',
      execution_id: executionId, plan_step_ordinal: 0, attempt_ordinal: 0,
      action_snapshot: step.static_contract_snapshot.action_snapshot,
      departure_endpoint_snapshot: origin, arrival_endpoint_snapshot: arrival,
      execution_context_snapshot: result.execution_context_snapshot,
      result_kind: 'completed', result_code: 'site_connection_completed',
      result_change_set_id: changeSetId, idempotency_record_id: idemId,
      occurred_at_turn: turnNumber }),
    event(0, 'planned', null, 'planned', origin),
    event(1, 'activated', 'planned', 'active', origin),
    event(2, 'completed', 'active', 'completed', arrival,
      { entity_kind: 'party_action_step_run', entity_id: result.id })],
    deletes: [] }, rechecks: [sealedCheck('site_connection_traversal', {
      party_id: partyId, actor_id: transition.actor_id,
      journey_location_id: envelope.consequence.spatial_v3_traversal
        .expected_state_versions.entries.find((entry) =>
          entry.entity_ref.entity_kind === 'party_journey_location')?.entity_ref.entity_id,
      ...transition })] };
}

const text = (value) => typeof value === 'string' && value.length > 0;
function fail() { throw serverError('SPATIAL_V3_SITE_TRAVERSAL_COMMIT_INVALID',
  'Site connection traversal failed its sealed turn contract.', { status: 409 }); }
