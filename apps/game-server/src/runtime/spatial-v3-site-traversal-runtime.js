import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { prepareSpatialV3SiteConnectionTraversal } from '@rus/turn/spatial-v3-execution';
import { addElapsedTime, addRationalMinutes } from '@rus/time-events-history';
import { planExactTraversalIntervals } from '@rus/movement-routes';
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
const rational = (value) => value && /^\d+$/u.test(String(value.numerator))
  && /^\d+$/u.test(String(value.denominator)) && BigInt(value.numerator) > 0n
  && BigInt(value.denominator) > 0n
  ? { numerator: String(value.numerator), denominator: String(value.denominator) } : null;

/** Prepared consequence only. The official turn P16 transaction owns movement. */
export function createSpatialV3SiteTraversalRuntime({ pool, assessAvailability,
  assessMovementCapability, projectDestination, projectEnvironmentAtClock } = {}) {
  if (!pool?.query) throw new TypeError('Site traversal requires a PostgreSQL pool.');
  return async function prepareSiteTraversal({ partyId, actorId, requestId, state,
    playerInput, inputDigest, context, connection, local_edge_path_proofs = [] } = {}) {
    if (typeof assessAvailability !== 'function') gap('availability_condition_set_owner_missing');
    if (typeof assessMovementCapability !== 'function') gap('movement_capability_owner_missing');
    if (typeof projectDestination !== 'function') gap('destination_visible_projection_owner_missing');
    const snapshot = context?.snapshot;
    const location = context?.location;
    const originPosition = context?.position;
    const sourcePosition = context?.approach_departure_position ?? originPosition;
    if (![partyId, actorId, requestId, inputDigest, connection?.id].every(text)
      || state?.party_id !== partyId || state.actor_id !== actorId
      || state.journey_location?.id !== location?.id
      || state.journey_location?.scene_position_id !== originPosition?.id
      || state.position?.position_id !== originPosition?.id
      || connection.from_site_id !== context.site?.id || connection.status !== 'active'
      || connection.cost_kind !== 'time' || connection.action_units != null
      || !Number.isSafeInteger(Number(connection.base_minutes)) || Number(connection.base_minutes) < 1
      || connection.portal_entity_id != null || !snapshot) gap('site_traversal_source_invalid');
    const localPath = orderedLocalPath(local_edge_path_proofs,
      originPosition?.id, sourcePosition?.id);
    const profiles = context.closure?.connection_profiles?.filter((profile) =>
      profile.status === 'approved' && profile.profile_scope === 'site_connection'
      && profile.passage_type_id === connection.passage_type_id
      && profile.cost_kind === connection.cost_kind
      && profile.action_units == null
      && Number(profile.base_minutes) === Number(connection.base_minutes)
      && refMatches(connection, 'transition_environment_profile_ref', profile, 'transition_environment_profile')
      && refMatches(connection, 'movement_orientation_profile_ref', profile, 'movement_orientation_profile')
      && connection.line_kind_id === profile.line_kind_id
      && connection.line_kind_profile_ref?.entity_id === profile.line_kind_profile_id
      && Number(connection.line_kind_profile_ref?.authoring_version) === Number(profile.line_kind_profile_version)) ?? [];
    if (profiles.length !== 1) gap('approved_connection_profile_required');
    const profile = profiles[0];
    const lineBindings = snapshot.line_bindings?.filter((row) => row.site_connection_id === connection.id
      && Number(row.authoring_version) === 3
      && row.line_name === connection.line_name
      && row.line_discriminator === (connection.line_discriminator ?? null)
      && Number(row.base_minutes) === Number(connection.base_minutes)
      && row.line_kind_profile_ref === `${connection.line_kind_profile_ref.entity_id}@${connection.line_kind_profile_ref.authoring_version}`) ?? [];
    if (lineBindings.length !== 1) gap('exact_v3_line_binding_required');
    const lineBinding = lineBindings[0];
    const conditionRef = connection.availability_condition_set_ref == null ? null
      : `${connection.availability_condition_set_ref.entity_id}@${connection.availability_condition_set_ref.authoring_version}`;
    if (conditionRef !== profile.availability_condition_set_ref) gap('approved_condition_pin_mismatch');
    const from = exact(snapshot.endpoint_bindings, connection.id, 'from');
    const to = exact(snapshot.endpoint_bindings, connection.id, 'to');
    const sourceG6 = snapshot.g6_instances.find((row) => row.id === sourcePosition.g6_instance_id);
    const destinationPosition = snapshot.scene_positions.find((row) => row.id === to.position_id);
    const destinationG6 = snapshot.g6_instances.find((row) => row.id === destinationPosition?.g6_instance_id);
    const destinationBaseline = snapshot.scene_baselines.find((row) => row.id === destinationG6?.scene_baseline_id);
    const destinationSite = snapshot.sites.find((row) => row.id === connection.to_site_id);
    if (from.position_id !== sourcePosition.id || from.g5_site_id !== context.site.id
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
    if (admission?.ok !== true || admission.status !== 'open' || admission.condition_set_ref !== profile.availability_condition_set_ref
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
    const identity = canonicalDigest({ partyId, inputDigest, connection_id: connection.id,
      local_edge_path: localPath.map(({ edge_id }) => edge_id) });
    const capabilityAssessment = await assessMovementCapability({ partyId, actorId,
      context, connection });
    if (capabilityAssessment?.ok === false
      && capabilityAssessment.actor_id === actorId
      && capabilityAssessment.code === 'movement_actor_unavailable') {
      throw serverError('SPATIAL_V3_MOVEMENT_DENIED',
        'Персонаж сейчас не может двигаться.', { status: 409 });
    }
    const capability = capabilityAssessment?.capability_context;
    if (capabilityAssessment?.ok !== true || capabilityAssessment.actor_id !== actorId
      || !text(capability?.canonical_digest)) gap('movement_capability_missing');
    const allowedMethods = capability.allowed_movement_methods ?? [];
    const baselineMethod = lineBinding.movement_method_id;
    const baselineOption = lineBinding.movement_method_options?.find((row) =>
      row.movement_method_id === baselineMethod);
    const selectedMethod = allowedMethods.includes(baselineMethod) ? baselineOption
      : lineBinding.alternative_methods?.filter((row) => allowedMethods.includes(row.movement_method_id))
        .map((alternative) => ({ ...alternative,
          ...lineBinding.movement_method_options?.find((row) =>
            row.movement_method_id === alternative.movement_method_id) }))
        .find((row) => row.factor != null);
    const unresolvedHazardRef = selectedMethod?.hazard_rule_ref
      && !lineBinding.hazard_rule_resolutions?.some((row) =>
        row.hazard_rule_ref === selectedMethod.hazard_rule_ref)
      ? selectedMethod.hazard_rule_ref : null;
    const methodId = selectedMethod?.movement_method_id ?? baselineMethod;
    const methodFactor = rational(selectedMethod?.factor ?? lineBinding.method_factor);
    if (!text(methodId) || !allowedMethods.includes(methodId) || !methodFactor) {
      gap('approved_line_factors_missing');
    }
    if (!text(connection.source_canonical_connection_ref?.entity_id)
      || !text(connection.source_canonical_connection_ref?.authoring_version)) {
      gap('canonical_connection_source_pin_missing');
    }
    const factorPins = seal({ pins: [...(capability.dependency_pins?.pins ?? []),
      ...(lineBinding.dependency_pins?.pins ?? [])] });
    const factor = (factor_kind, value) => seal({ factor_kind,
      numerator: value.numerator, denominator: value.denominator,
      source_dependency_pins: factorPins });
    const staticFactors = [factor('method', methodFactor),
      ...['load', 'body', 'pace'].map((kind) => factor(kind,
        { numerator: '1', denominator: '1' }))];
    const recheckPolicy = lineBinding.dynamic_recheck_policy;
    const intervalMinutes = recheckPolicy?.policy_kind === 'fixed_time_interval'
      ? Number(recheckPolicy.interval_minutes) : null;
    if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 30) {
      gap('line_recheck_slicing_missing');
    }
    let cumulative = { numerator: '0', denominator: '1' };
    let remainingDistance = { numerator: '1', denominator: '1' };
    let worldTime = state.clock;
    if (!worldTime || !text(worldTime.whole_minutes)
      || !text(worldTime.subminute_numerator) || !text(worldTime.subminute_denominator)) {
      gap('site_traversal_clock_required');
    }
    const traversalIntervals = [];
    let progress = 0;
    let intervalOrdinal = 0;
    while (progress < 1_000_000) {
      if (typeof projectEnvironmentAtClock !== 'function') gap('current_environment_projection_missing');
      const environment = projectEnvironmentAtClock({ state, clock: worldTime });
      const environmentFactor = rational(environment?.effects?.movement_factor);
      if (!environmentFactor) gap('current_environment_factor_missing');
      const resolvedFactors = [factor('method', methodFactor),
        factor('environment', environmentFactor), ...staticFactors.slice(1)];
      const maxTime = { numerator: String(intervalMinutes), denominator: '1' };
      const interval = planExactTraversalIntervals({
        base_minutes: { numerator: String(connection.base_minutes), denominator: '1' },
        factors: resolvedFactors.map(({ numerator, denominator }) => ({ numerator, denominator })),
        fixed_time_interval: maxTime, distance_remaining: remainingDistance }).intervals[0];
      const { planned_time: elapsed, cumulative_progress_after_ppm: progressAfter,
        distance_remaining_after: distanceAfter } = interval;
      if (progressAfter <= progress || progressAfter > 1_000_000) gap('line_interval_progress_invalid');
      const worldTimeBefore = structuredClone(worldTime);
      worldTime = addElapsedTime(worldTime, { exact_minutes: elapsed });
      const dynamicSnapshot = seal({ snapshot_id: `line:${connection.id}:${lineBinding.canonical_digest}:${intervalOrdinal}`,
        resolved_factors: resolvedFactors, resolved_delays: [],
        environment_state: environment?.environment_state ?? null });
      const intervalInput = { clock_commit_mode: 'direct_party_clock',
        world_time_before: worldTimeBefore,
        progress_before_ppm: progress,
        planned_progress_after_ppm: progressAfter,
        actual_progress_after_ppm: unresolvedHazardRef ? 0 : progressAfter,
        planned_time: elapsed, actual_time: elapsed,
        cumulative_before: cumulative, dynamic_snapshot: dynamicSnapshot,
        resolved_factors: resolvedFactors, dynamic_dependency_pins: factorPins,
        delay_occurrence_history: seal({ id: `line-delay-history:${identity}`,
          committed_occurrence_keys: [] }),
        source_signals: seal({ dependency_pins: factorPins,
          ...(unresolvedHazardRef ? { paused: true } : {}) }) };
      cumulative = addRationalMinutes(cumulative, elapsed);
      traversalIntervals.push(intervalInput);
      if (unresolvedHazardRef) break;
      progress = progressAfter;
      remainingDistance = distanceAfter;
      intervalOrdinal += 1;
    }
    const [footprintId, footprintVersion] = String(profile.capacity_semantics_ref ?? '').split('@');
    if (!text(footprintId) || !text(footprintVersion)) gap('movement_footprint_rule_missing');
    const transition = { owner: '@rus/turn/spatial-v3-site-connection-traversal',
      party_id: partyId, actor_id: actorId, journey_location_id: location.id,
      origin_position_ref: originPosition.id,
      ordered_local_edge_path: localPath,
      from_position_ref: from.position_id, to_position_ref: to.position_id,
      connection_id: connection.id, source_site_id: context.site.id,
      source_g4_id: context.site.parent_g4_id,
      source_g6_instance_id: sourceG6.id,
      destination_site_id: destinationSite.id,
      destination_g4_id: destinationSite.parent_g4_id,
      destination_g6_instance_id: destinationG6.id,
      destination_scene_baseline_id: destinationBaseline.id,
      expected_journey_state_version: Number(location.state_version),
      connection_state_version: Number(connection.state_version),
      source_endpoint_state_version: Number(from.state_version),
      source_position_state_version: Number(sourcePosition.state_version),
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
      line_kind_id: connection.line_kind_id,
      line_kind_profile_ref: connection.line_kind_profile_ref,
      line_name: connection.line_name,
      line_discriminator: connection.line_discriminator ?? null,
      line_direction_id: connection.line_direction_id,
      base_minutes: Number(connection.base_minutes),
      baseline_movement_method_id: connection.baseline_movement_method_id,
      movement_method_cost_profile_ref: connection.movement_method_cost_profile_ref,
      transition_environment_profile_ref: connection.transition_environment_profile_ref,
      movement_orientation_profile_ref: connection.movement_orientation_profile_ref,
      dynamic_recheck_policy_ref: connection.dynamic_recheck_policy_ref,
      capability_context_digest: capability.canonical_digest,
      destination_visible_digest: canonicalDigest(projected.visible_context),
      line_binding_digest: lineBinding.canonical_digest };
    const readCurrentState = async ({ option }) => {
      const checked = await recheckSiteConnectionTraversal({ transaction: pool,
        partyId, check: transition, assessAvailability,
        assessMovementCapability, projectDestination });
      return checked.ok ? { ok: true,
        expected_state_versions: option.expected_state_versions } : checked;
    };
    for (const _interval of traversalIntervals) {
      const checked = await recheckSiteConnectionTraversal({ transaction: pool,
        partyId, check: transition, assessAvailability,
        assessMovementCapability, projectDestination });
      if (!checked.ok) gap(checked.reason ?? 'site_traversal_slice_recheck_failed');
    }
    const prepared = await prepareSpatialV3SiteConnectionTraversal({ party_id: partyId,
      request_id: requestId, execution_id: `site-execution:${identity}`,
      plan_id: `site-plan:${identity}`, travel_state_id: `site-travel:${identity}`,
      idempotency_key: playerInput.idempotency_key, idempotency_record_id: idemId,
      change_set_id: changeSetId, occurred_at_turn: turnNumber,
      world_revision_id: context.world_revision_id,
      catalog_digest: context.world_catalog_digest,
      connection: { ...helperConnection(connection),
        baseline_movement_method_id: methodId },
      connection_profile: helperProfile(profile, connection),
      journey_location: sourcePosition.id === originPosition.id ? location
        : { ...location, scene_position_id: sourcePosition.id },
      endpoint_bindings: snapshot.endpoint_bindings, scene_positions: snapshot.scene_positions,
      g6_instances: snapshot.g6_instances, scene_baselines: snapshot.scene_baselines,
      sites: snapshot.sites, movement_capacity_units: 1,
      traversal_intervals: traversalIntervals,
      footprint_rule_ref: { entity_ref: { entity_kind: 'capacity_semantics', entity_id: footprintId },
        authoring_version: footprintVersion }, capability_context: capability,
      execution_context_snapshot: seal({ context_kind: 'site_connection_traversal', connection_id: connection.id,
        origin_position_id: originPosition.id, source_position_id: from.position_id,
        destination_position_id: to.position_id,
        ordered_local_edge_path: localPath.map(({ edge_id, from_position_id, to_position_id }) =>
          ({ edge_id, from_position_id, to_position_id })) })
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
    if (!prepared.ok) {
      gap(prepared.error?.diagnostics?.reason ?? prepared.error?.code ?? 'site_traversal_preparation_failed');
    }
    const returnedToDeparture = prepared.result.result_kind === 'returned_to_departure';
    const interruptedAtShore = prepared.result.result_kind === 'interrupted_at_anchor';
    const sourceProjection = returnedToDeparture || interruptedAtShore ? await projectDestination({ partyId, actorId,
      context: { ...context, position: sourcePosition }, connection, profile, destinationPosition: sourcePosition,
      destinationG6: sourceG6, destinationBaseline: context.baseline,
      destinationSite: context.site }) : null;
    if ((returnedToDeparture || interruptedAtShore) && (sourceProjection?.ok !== true
      || sourceProjection.position_id !== from.position_id
      || sourceProjection.site_id !== context.site.id
      || sourceProjection.visible_context?.schema !== 'visible_context_package')) {
      gap('source_visible_projection_missing');
    }
    const exactElapsed = prepared.clock_update.actual_elapsed;
    const duration = Number(exactElapsed.numerator) / Number(exactElapsed.denominator);
    if (!Number.isFinite(duration) || duration <= 0) gap('site_traversal_exact_duration_not_representable');
    return { ...packageBase({ inputDigest, duration, kind: 'movement',
      position_transition: transition,
      spatial_v3_traversal: { plan: prepared.plan, result: prepared.result,
        travel_state: prepared.travel_state,
        final_travel_state: prepared.final_travel_state,
        traversal_intervals: prepared.traversal_intervals,
        clock_update: prepared.clock_update,
        expected_state_versions: prepared.expected_state_versions },
      movement: { status: prepared.final_travel_state.status,
        cost_kind: 'time', duration_minutes: duration } }),
      visible_seed: prepared.result.result_kind === 'segment_completed'
        ? { destination_visible_context: projected.visible_context }
        : returnedToDeparture || interruptedAtShore
          ? { destination_visible_context: sourceProjection.visible_context } : {} };
  };
}

function exact(bindings, id, role) {
  const rows = bindings.filter((row) => row.site_connection_id === id
    && row.endpoint_role === role && row.status === 'active');
  if (rows.length !== 1) gap('exact_site_connection_endpoint_required');
  return rows[0];
}
function orderedLocalPath(path, originPositionId, departurePositionId) {
  if (!Array.isArray(path) || !text(originPositionId) || !text(departurePositionId)) {
    gap('local_line_approach_path_invalid');
  }
  if (originPositionId === departurePositionId) {
    if (path.length) gap('local_line_approach_path_unexpected');
    return [];
  }
  if (!path.length) gap('local_line_approach_path_required');
  let current = originPositionId;
  for (const item of path) {
    const admission = item?.movement_admission;
    if (!text(item?.edge_id) || item.from_position_id !== current
      || !text(item.to_position_id) || admission?.edge_id !== item.edge_id
      || admission.from_position_ref !== item.from_position_id
      || admission.to_position_ref !== item.to_position_id
      || admission.cost_kind !== 'action'
      || !Number.isSafeInteger(admission.action_units) || admission.action_units < 1
      || admission.base_minutes != null
      || !Number.isSafeInteger(admission.edge_state_version) || admission.edge_state_version < 1
      || !Number.isSafeInteger(admission.source_node_state_version) || admission.source_node_state_version < 1
      || !Number.isSafeInteger(admission.destination_node_state_version) || admission.destination_node_state_version < 1
      || !Number.isSafeInteger(admission.destination_capacity) || admission.destination_capacity < 1
      || admission.transition_footprint_units !== 1
      || admission.destination_status !== 'open'
      || admission.reverse_edge_id == null && admission.local_movement_eligibility_ref == null) {
      gap('local_line_approach_edge_admission_invalid');
    }
    current = item.to_position_id;
  }
  if (current !== departurePositionId) gap('local_line_approach_path_endpoint_mismatch');
  return path.map((item) => structuredClone(item));
}
function helperConnection(connection) {
  const kinds = { line_kind_profile_ref: 'line_kind_profile',
    movement_method_cost_profile_ref: 'movement_method_cost_profile',
    transition_environment_profile_ref: 'transition_environment_profile',
    movement_orientation_profile_ref: 'movement_orientation_profile',
    dynamic_recheck_policy_ref: 'dynamic_recheck_policy',
    source_canonical_connection_ref: 'source_canonical_connection' };
  const output = { ...connection };
  for (const [field, kind] of Object.entries(kinds)) {
    const value = connection[field];
    if (!value?.entity_id || !value?.authoring_version) continue;
    output[field] = { entity_ref: { entity_kind: kind, entity_id: value.entity_id },
      authoring_version: String(value.authoring_version) };
  }
  return output;
}
function helperProfile(profile, connection) {
  const output = { ...profile };
  for (const field of ['movement_method_cost_profile_ref', 'transition_environment_profile_ref',
    'movement_orientation_profile_ref', 'dynamic_recheck_policy_ref']) {
    output[field] = helperConnection(connection)[field];
  }
  return output;
}
function gap(reason) { throw serverError('SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP',
  'The committed site connection cannot be traversed.', { status: 409,
    details: { reason } }); }
