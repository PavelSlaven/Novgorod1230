import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { prepareSpatialV3SiteConnectionTraversal } from '@rus/turn/spatial-v3-execution';
import { serverError } from '../errors.js';
import { readSiteTraversalDestinationOccupancy } from
  '../infrastructure/postgres/spatial-v3-site-traversal-occupancy.js';
import { recheckSiteConnectionTraversal } from
  '../infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';
import { packageBase } from './lower-dvina-trace-phase-3-command-shared.js';

const text = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;
const seal = (payload) => ({ ...payload, canonical_digest: digest(payload) });
const refMatches = (row, field, profile, name) => row[field]?.entity_id === profile[`${name}_id`]
  && Number(row[field]?.authoring_version) === Number(profile[`${name}_version`]);

/** Prepared consequence only. The official turn P16 transaction owns movement. */
export function createSpatialV3SiteTraversalRuntime({ pool, assessAvailability,
  assessMovementCapability, projectDestination } = {}) {
  if (!pool?.query) throw new TypeError('Site traversal requires a PostgreSQL pool.');
  return async function prepareSiteTraversal({ partyId, actorId, requestId, state,
    playerInput, inputDigest, context, connection } = {}) {
    if (typeof assessAvailability !== 'function') gap('availability_condition_set_owner_missing');
    if (typeof assessMovementCapability !== 'function') gap('movement_capability_owner_missing');
    if (typeof projectDestination !== 'function') gap('destination_visible_projection_owner_missing');
    const snapshot = context?.snapshot;
    const location = context?.location;
    if (![partyId, actorId, requestId, inputDigest, connection?.id].every(text)
      || state?.party_id !== partyId || state.actor_id !== actorId
      || state.journey_location?.id !== location?.id
      || state.journey_location?.scene_position_id !== context.position?.id
      || state.position?.position_id !== context.position?.id
      || connection.from_site_id !== context.site?.id || connection.status !== 'active'
      || connection.cost_kind !== 'action' || connection.base_minutes !== null
      || connection.portal_entity_id != null || !snapshot) gap('site_traversal_source_invalid');
    const profiles = context.closure?.connection_profiles?.filter((profile) =>
      profile.status === 'approved' && profile.profile_scope === 'site_connection'
      && profile.passage_type_id === connection.passage_type_id
      && profile.cost_kind === connection.cost_kind
      && profile.action_units === connection.action_units
      && refMatches(connection, 'transition_environment_profile_ref', profile, 'transition_environment_profile')
      && refMatches(connection, 'movement_orientation_profile_ref', profile, 'movement_orientation_profile')) ?? [];
    if (profiles.length !== 1) gap('approved_connection_profile_required');
    const profile = profiles[0];
    const conditionRef = connection.availability_condition_set_ref == null ? null
      : `${connection.availability_condition_set_ref.entity_id}@${connection.availability_condition_set_ref.authoring_version}`;
    if (conditionRef !== profile.availability_condition_set_ref) gap('approved_condition_pin_mismatch');
    const from = exact(snapshot.endpoint_bindings, connection.id, 'from');
    const to = exact(snapshot.endpoint_bindings, connection.id, 'to');
    const sourceG6 = snapshot.g6_instances.find((row) => row.id === context.position.g6_instance_id);
    const destinationPosition = snapshot.scene_positions.find((row) => row.id === to.position_id);
    const destinationG6 = snapshot.g6_instances.find((row) => row.id === destinationPosition?.g6_instance_id);
    const destinationBaseline = snapshot.scene_baselines.find((row) => row.id === destinationG6?.scene_baseline_id);
    const destinationSite = snapshot.sites.find((row) => row.id === connection.to_site_id);
    if (from.position_id !== context.position.id || from.g5_site_id !== context.site.id
      || !sourceG6 || sourceG6.scene_baseline_id !== context.baseline?.id
      || !destinationPosition || !destinationG6 || !destinationBaseline || !destinationSite
      || to.g5_site_id !== destinationSite.id || destinationBaseline.host_id !== destinationSite.id
      || destinationG6.host_id !== destinationSite.id || destinationSite.parent_g4_id !== context.site.parent_g4_id
      || [to, destinationPosition, destinationG6, destinationBaseline, destinationSite]
        .some((row) => row.status !== 'active')) gap('committed_arrival_endpoint_required');
    const occupancy = await readSiteTraversalDestinationOccupancy({ pool,
      partyId, positionId: destinationPosition.id });
    if (!Number.isSafeInteger(occupancy) || !Number.isSafeInteger(destinationPosition.capacity)
      || occupancy + 1 > destinationPosition.capacity
      || connection.capacity != null && connection.capacity < 1) gap('site_traversal_capacity_denied');
    const admission = await assessAvailability({ partyId, actorId, context,
      connection, profile, from, to, destinationPosition, destinationG6,
      destinationBaseline, destinationSite });
    if (admission?.ok !== true || admission.condition_set_ref !== profile.availability_condition_set_ref
      || admission.connection_id !== connection.id) gap('site_traversal_availability_denied');
    const projected = await projectDestination({ partyId, actorId, context,
      connection, profile, destinationPosition, destinationG6,
      destinationBaseline, destinationSite });
    if (projected?.ok !== true || projected.position_id !== destinationPosition.id
      || projected.site_id !== destinationSite.id || projected.visible_context?.schema !== 'visible_context_package') {
      gap('destination_visible_projection_missing');
    }
    const turnNumber = state.party_state.turn_number + 1;
    const changeSetId = `change:${partyId}:turn-step:${turnNumber}`;
    const idemId = `idem:${partyId}:${canonicalDigest(playerInput.idempotency_key).slice(0, 20)}`;
    const identity = canonicalDigest({ partyId, inputDigest, connection_id: connection.id });
    const capabilityAssessment = await assessMovementCapability({ partyId, actorId,
      context, connection });
    const capability = capabilityAssessment?.capability_context;
    if (capabilityAssessment?.ok !== true || capabilityAssessment.actor_id !== actorId
      || !text(capability?.canonical_digest)) gap('movement_capability_missing');
    const [footprintId, footprintVersion] = String(profile.capacity_semantics_ref ?? '').split('@');
    if (!text(footprintId) || !text(footprintVersion)) gap('movement_footprint_rule_missing');
    const transition = { owner: '@rus/turn/spatial-v3-site-connection-traversal',
      party_id: partyId, actor_id: actorId, journey_location_id: location.id,
      from_position_ref: from.position_id, to_position_ref: to.position_id,
      connection_id: connection.id, source_site_id: context.site.id,
      destination_site_id: destinationSite.id,
      destination_g4_id: destinationSite.parent_g4_id,
      destination_g6_instance_id: destinationG6.id,
      destination_scene_baseline_id: destinationBaseline.id,
      expected_journey_state_version: Number(location.state_version),
      connection_state_version: Number(connection.state_version),
      source_endpoint_state_version: Number(from.state_version),
      source_position_state_version: Number(context.position.state_version),
      source_g6_state_version: Number(sourceG6.state_version),
      source_baseline_state_version: Number(context.baseline.state_version),
      source_site_state_version: Number(context.site.state_version),
      destination_endpoint_state_version: Number(to.state_version),
      destination_position_state_version: Number(destinationPosition.state_version),
      destination_g6_state_version: Number(destinationG6.state_version),
      destination_baseline_state_version: Number(destinationBaseline.state_version),
      destination_site_state_version: Number(destinationSite.state_version),
      destination_capacity: destinationPosition.capacity,
      availability_condition_set_ref: connection.availability_condition_set_ref,
      capability_context_digest: capability.canonical_digest,
      destination_visible_digest: canonicalDigest(projected.visible_context),
      action_units: connection.action_units };
    const readCurrentState = async ({ option }) => {
      const checked = await recheckSiteConnectionTraversal({ transaction: pool,
        partyId, check: transition, assessAvailability,
        assessMovementCapability, projectDestination });
      return checked.ok ? { ok: true,
        expected_state_versions: option.expected_state_versions } : checked;
    };
    const prepared = await prepareSpatialV3SiteConnectionTraversal({ party_id: partyId,
      request_id: requestId, execution_id: `site-execution:${identity}`,
      plan_id: `site-plan:${identity}`, run_id: `site-action:${identity}`,
      idempotency_key: playerInput.idempotency_key, idempotency_record_id: idemId,
      change_set_id: changeSetId, occurred_at_turn: turnNumber,
      world_revision_id: context.world_revision_id,
      catalog_digest: context.world_catalog_digest,
      connection, connection_profile: profile, journey_location: location,
      endpoint_bindings: snapshot.endpoint_bindings, scene_positions: snapshot.scene_positions,
      g6_instances: snapshot.g6_instances, scene_baselines: snapshot.scene_baselines,
      sites: snapshot.sites, movement_capacity_units: 1,
      footprint_rule_ref: { entity_ref: { entity_kind: 'capacity_semantics', entity_id: footprintId },
        authoring_version: footprintVersion }, capability_context: capability,
      execution_context_snapshot: seal({ context_kind: 'site_connection_traversal', connection_id: connection.id,
        source_position_id: from.position_id, destination_position_id: to.position_id })
    }, { validateCapability: async () => {
      const current = await assessMovementCapability({ partyId, actorId,
        context, connection });
      return { ok: current?.ok === true && current.actor_id === actorId
        && current.capability_context?.canonical_digest === capability.canonical_digest };
    },
      loadCurrentState: readCurrentState,
      recheckActivation: async () => recheckSiteConnectionTraversal({
        transaction: pool, partyId, check: transition, assessAvailability,
        assessMovementCapability, projectDestination }) });
    if (!prepared.ok || prepared.result.result_kind !== 'completed') {
      gap(prepared.error?.diagnostics?.reason ?? prepared.error?.code ?? 'site_traversal_preparation_failed');
    }
    return { ...packageBase({ inputDigest, duration: 0, kind: 'movement',
      position_transition: transition,
      spatial_v3_traversal: { plan: prepared.plan, result: prepared.result,
        expected_state_versions: prepared.expected_state_versions },
      movement: { status: 'completed', cost_kind: 'action', action_units: connection.action_units } }),
      visible_seed: { destination_visible_context: projected.visible_context } };
  };
}

function exact(bindings, id, role) {
  const rows = bindings.filter((row) => row.site_connection_id === id
    && row.endpoint_role === role && row.status === 'active');
  if (rows.length !== 1) gap('exact_site_connection_endpoint_required');
  return rows[0];
}
function gap(reason) { throw serverError('SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP',
  'The committed site connection cannot be traversed.', { status: 409,
    details: { reason } }); }
