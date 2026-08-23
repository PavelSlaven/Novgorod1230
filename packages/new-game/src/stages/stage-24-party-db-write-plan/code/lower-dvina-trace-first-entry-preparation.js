import { computeSpatialV3CanonicalDigest, validateSpatialV3Contract } from
  '@rus/contracts/spatial-v3/registry';
import { sha256 } from '@rus/kernel';

export function addFirstEntryPreparationBatches({ batches, result, partyId, playerId,
  changeSetId, sourceTrace, addBatch }) {
  const prepared = result.first_entry_preparation;
  if (prepared == null) return null;
  const binding = prepared.binding;
  const scene = prepared.scene;
  if (binding?.route_command_id !== 'lower_dvina_trace.follow_path_to_fishing_camp'
    || binding.route_ref !== 'trace_ld_v1_route_wreck_to_camp'
    || binding.materialization_timing !== 'on_first_successful_entry_only'
    || !scene?.node?.instance_id || !scene?.anchor?.instance_id) {
    const error = new Error('First-entry preparation is incomplete.');
    error.code = 'LOWER_DVINA_TRACE_FIRST_ENTRY_PREPARATION_INVALID';
    throw error;
  }
  const prefix = sha256([partyId, result.run_id, 'first_entry']).slice(0, 24);
  const sourceNode = result.immediate.spatial.node;
  const sourceAnchor = result.immediate.spatial.anchor;
  const sourceLocationRef = sourceNode.state.location_profile_ref;
  const ids = {
    snapshot: `preparation:${prefix}`,
    route: `route:${prefix}`,
    execution: `route-execution:${prefix}`,
    claim: `preparation-claim:${prefix}`,
    journeyLocation: `journey-location:${partyId}:${playerId}`,
    sourceBaseline: `baseline:${sourceNode.instance_id}`,
    sourceG5: `g5:${sourceNode.instance_id}`,
    sourceG6: `g6:${sourceAnchor.instance_id}`,
    sourcePosition: `position:${sourceAnchor.instance_id}`,
    baseline: `baseline:${scene.node.instance_id}`,
    g5: `g5:${scene.node.instance_id}`,
    g6: `g6:${scene.anchor.instance_id}`,
    position: `position:${scene.anchor.instance_id}`
  };
  const s1Topology = prepared.s1_topology;
  const s1PhysicalWrites = prepared.s1_physical_writes;
  const s1Base = `s1:${partyId}:${ids.baseline}:${binding.destination.g6.s1_topology_slot.g6.slot_key}`;
  if (!s1Topology || !Array.isArray(s1PhysicalWrites)
      || s1PhysicalWrites.length !== 6
      || s1Topology.g6_instance_ref !== `${s1Base}:g6`
      || s1Topology.position_ref !== `${s1Base}:position`) {
    const error = new Error('First-entry S1 topology is incomplete.');
    error.code = 'LOWER_DVINA_TRACE_FIRST_ENTRY_PREPARATION_INVALID';
    throw error;
  }
  const sourceEndpointRef = {
    endpoint_kind: 'scene_position',
    endpoint_id: 'trace_ld_v1_ep_wreck_path_to_camp'
  };
  const targetEndpointRef = {
    endpoint_kind: 'scene_position',
    endpoint_id: 'trace_ld_v1_ep_camp_path_to_wreck'
  };
  const routePin = authoringPin('route', 'world_route', binding.route_ref);
  const sourcePin = authoringPin(
    'source_authoring', 'scene_materialization_candidate', sourceLocationRef);
  const targetPin = authoringPin(
    'target', 'scene_materialization_candidate',
    binding.destination.location_profile_ref);
  const templatePin = authoringPin(
    'scene_template', 'scene_template', binding.destination.g6.scene_template_ref);
  const profilePin = authoringPin('scene_materialization_profile',
    'scene_materialization_profile',
    binding.destination.g6.materialization_profile);
  const targetPins = dependencyPinSet([targetPin, templatePin, profilePin]);
  const planningPins = dependencyPinSet([routePin, sourcePin, targetPin]);
  const sourceEndpoint = endpointSnapshot({
    endpoint_ref: sourceEndpointRef,
    dependency_pins: dependencyPinSet([sourcePin, routePin]),
    resolved_scene_baseline_id: ids.sourceBaseline,
    resolved_position_id: ids.sourcePosition
  });
  const targetEndpoint = endpointSnapshot({
    endpoint_ref: targetEndpointRef,
    dependency_pins: targetPins,
    resolved_scene_baseline_id: ids.baseline,
    resolved_position_id: ids.position
  });
  const materializationPayload = {
    g4_id: scene.node.parent_g4_id,
    g5_site_id: ids.g5,
    g5_origin: 'generated',
    scene_baseline_id: ids.baseline,
    g6_instance_id: ids.g6,
    position_id: ids.position,
    scene_template_ref: versionedRef(
      'scene_template', binding.destination.g6.scene_template_ref),
    materialization_profile_ref: versionedRef(
      'scene_materialization_profile',
      binding.destination.g6.materialization_profile),
    catalog_digest: result.trace.catalog_digest,
    materializer_version: result.trace.materializer_version,
    dependency_pins: targetPins
  };
  const materialization = sealSpatial(materializationPayload);
  const memberPayload = {
    preparation_snapshot_id: ids.snapshot,
    ordinal: 0,
    member_kind: 'transfer_scene',
    source_authoring_ref: versionedRef(
      'scene_materialization_candidate',
      binding.destination.location_profile_ref),
    prepared_scene_materialization: materialization,
    dependency_pins: targetPins,
    share_mode: 'execution_exclusive'
  };
  const member = {
    ...memberPayload,
    member_digest: spatialDigest(memberPayload)
  };
  assertSpatialContract('prepared_scene_materialization_snapshot',
    materialization);
  assertSpatialContract('preparation_snapshot_member', member);
  const planningRequestDigest = spatialDigest({
    command_id: binding.route_command_id,
    relation_ref: binding.route_ref,
    source_endpoint_ref: sourceEndpointRef,
    target_endpoint_ref: targetEndpointRef,
    target_g4_id: scene.node.parent_g4_id
  });
  const immutableMembersDigest = spatialDigest([member]);
  const snapshotPayload = {
    id: ids.snapshot,
    party_id: partyId,
    planning_request_id: binding.route_command_id,
    planning_request_digest: planningRequestDigest,
    immutable_members_digest: immutableMembersDigest,
    created_at_turn: 0,
    created_change_set_id: changeSetId
  };
  const snapshot = {
    ...snapshotPayload,
    canonical_digest: spatialDigest(snapshotPayload)
  };
  const segmentRef = {
    segment_ref: {
      segment_kind: 'world_route_segment', segment_id: binding.route_ref
    },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1' }
  };
  const factualContext = sealSpatial({
    context_ref: { entity_kind: 'world_route', entity_id: binding.route_ref },
    dependency_pins: dependencyPinSet([routePin]),
    g0_id: 'g0v3__eurasia',
    g1_id: 'g1v3__eastern_europe',
    weather_scope_id: scene.node.parent_g4_id
  });
  const physicalContext = sealSpatial({
    context_mode: 'fixed_world_context',
    segment_ref: segmentRef,
    fixed_context: factualContext,
    segment_dependency_pins: dependencyPinSet([routePin])
  });
  const traversal = sealSpatial({
    physical_segment_ref: segmentRef,
    selected_movement_method_id: 'walk',
    movement_carrier_ref: { entity_kind: 'actor', entity_id: playerId },
    movement_capacity_units: 1,
    environment_profile_ref: versionedRef(
      'transition_environment_profile', 'trace_ld_v1_env_open_path'),
    orientation_profile_ref: versionedRef(
      'movement_orientation_profile',
      'trace_ld_v1_route_wreck_to_camp_orientation'),
    cost_profile_ref: versionedRef(
      'movement_method_cost_profile', 'trace_ld_v1_time_8m'),
    recheck_policy_ref: versionedRef(
      'dynamic_recheck_policy', 'no_check_on_visible_local_path'),
    factual_context_snapshot: physicalContext,
    dependency_pins: planningPins
  });
  const staticPayload = {
    snapshot_kind: 'timed_traversal',
    traversal_snapshot: traversal
  };
  const step = {
    route_plan_id: ids.route,
    ordinal: 0,
    step_kind: 'timed_traversal',
    departure_endpoint_snapshot: sourceEndpoint,
    arrival_endpoint_snapshot: targetEndpoint,
    static_contract_snapshot: {
      ...staticPayload,
      canonical_digest: computeSpatialV3CanonicalDigest(staticPayload)
    }
  };
  const planImmutable = {
    journey_owner_ref: { entity_kind: 'actor', entity_id: playerId },
    journey_scope: 'world_travel',
    request_kind: 'ordinary',
    planning_request_id: binding.route_command_id,
    path_query_digest: planningRequestDigest,
    option_id: binding.route_ref,
    knowledge_scope: 'factual',
    source_endpoint_snapshot: sourceEndpoint,
    target_request: {
      target_kind: 'factual_spatial',
      factual_target_ref: { spatial_kind: 'party_g5_site', spatial_id: ids.g5 }
    },
    resolved_factual_target_ref: {
      spatial_kind: 'party_g5_site', spatial_id: ids.g5
    },
    target_resolution_dependency_pins: targetPins,
    world_revision_id: result.trace.world_revision_id,
    catalog_digest: result.trace.catalog_digest,
    planning_algorithm_version: 'trace_first_entry_v1',
    planning_state_version: 1,
    planning_context_dependency_pins: planningPins,
    preparation_snapshot_id: ids.snapshot,
    preparation_snapshot_digest: snapshot.canonical_digest
  };
  const routePlan = {
    id: ids.route,
    party_id: partyId,
    ...planImmutable,
    canonical_serialization_digest: spatialDigest({ plan: planImmutable, steps: [step] }),
    status: 'ready',
    lifecycle_state_version: 1,
    created_change_set_id: changeSetId,
    lifecycle_change_set_id: changeSetId,
    created_at_turn: 0
  };
  assertSpatialContract('endpoint_contract_snapshot', sourceEndpoint);
  assertSpatialContract('endpoint_contract_snapshot', targetEndpoint);
  assertSpatialContract('route_plan_step_static_snapshot',
    step.static_contract_snapshot);
  assertSpatialContract('party_route_plan_step', step);
  assertSpatialContract('preparation_snapshot', snapshot);
  assertSpatialContract('party_route_plan', routePlan);
  const sourceTemplateRef = dbVersionedRef('scene_template', sourceNode.template_id);
  addBatch(batches, 'party_g5_sites', [{
    id: ids.sourceG5,
    party_id: partyId,
    origin: 'canonical',
    parent_g4_id: sourceNode.parent_g4_id,
    canonical_g5_ref: dbVersionedRef('location_profile', sourceLocationRef),
    status: 'active',
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }], ['parties', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_scene_baselines', [{
    id: ids.sourceBaseline,
    party_id: partyId,
    host_kind: 'g5_site',
    host_id: ids.sourceG5,
    source_kind: 'canonical_template',
    scene_template_ref: sourceTemplateRef,
    materialization_trace_id: result.run_id,
    materializer_version: result.trace.materializer_version,
    catalog_digest: result.trace.catalog_digest,
    status: 'active',
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }], ['party_g5_sites'], sourceTrace);
  addBatch(batches, 'party_g6_instances', [{
    id: ids.sourceG6,
    party_id: partyId,
    scene_baseline_id: ids.sourceBaseline,
    source_scene_template_ref: sourceTemplateRef,
    scene_slot_key: sourceAnchor.slot_key,
    host_kind: 'g5_site',
    host_id: ids.sourceG5,
    physical_class_id: 'open',
    primary_scene_role_id: sourceAnchor.state.zone_ref,
    vertical_context_id: 'surface',
    overhead_cover_id: 'none',
    intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near',
    acoustic_uniformity: 'uniform',
    status: 'active',
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }], ['party_scene_baselines'], sourceTrace);
  addBatch(batches, 'scene_position_nodes', [{
    id: ids.sourcePosition,
    party_id: partyId,
    g6_instance_id: ids.sourceG6,
    position_type_id: 'scene_position',
    template_slot_key: sourceAnchor.state.zone_ref,
    template_instance_ordinal: 0,
    capacity: Math.max(1, sourceAnchor.npc_capacity),
    access_class_id: sourceAnchor.state.access_policy_ref,
    status: 'active',
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }], ['party_g6_instances'], sourceTrace);
  addBatch(batches, 'party_journey_locations', [{
    id: ids.journeyLocation,
    party_id: partyId,
    owner_kind: 'actor',
    owner_id: playerId,
    location_kind: 'scene',
    scene_position_id: ids.sourcePosition,
    transit_anchor_id: null,
    travel_state_id: null,
    state_version: 1,
    updated_change_set_id: changeSetId
  }], ['scene_position_nodes', 'party_player_characters'], sourceTrace);
  addBatch(batches, 'preparation_snapshots', [snapshot], ['parties'], sourceTrace);
  addBatch(batches, 'preparation_snapshot_members', [member],
    ['preparation_snapshots'], sourceTrace);
  addBatch(batches, 'party_route_plans', [routePlan],
    ['preparation_snapshots'], sourceTrace);
  addBatch(batches, 'party_route_plan_steps', [step],
    ['party_route_plans'], sourceTrace);
  addBatch(batches, 'party_route_plan_executions', [{
    id: ids.execution,
    party_id: partyId,
    route_plan_id: ids.route,
    journey_owner_ref: { entity_kind: 'actor', entity_id: playerId },
    journey_scope: 'world_travel',
    status: 'planned',
    current_step_ordinal: 0,
    current_endpoint_ref: sourceEndpoint,
    state_version: 1,
    updated_change_set_id: changeSetId
  }], ['party_route_plans'], sourceTrace);
  addBatch(batches, 'party_route_plan_execution_events', [{
    execution_id: ids.execution,
    event_ordinal: 0,
    event_kind: 'planned',
    to_status: 'planned',
    step_ordinal: 0,
    location_snapshot: {
      location: { location_kind: 'scene', scene_position_id: ids.sourcePosition },
      endpoint_snapshot: sourceEndpoint
    },
    causal_result_ref: null,
    change_set_id: changeSetId,
    idempotency_record_id: result.trace.idempotency_key,
    occurred_at_turn: 0
  }], ['party_route_plan_executions'], sourceTrace);
  addBatch(batches, 'preparation_claims', [{
    id: ids.claim,
    preparation_snapshot_id: ids.snapshot,
    preparation_member_ordinal: 0,
    route_plan_execution_id: ids.execution,
    claim_status: 'reserved',
    state_version: 1,
    reserved_change_set_id: changeSetId,
    terminal_change_set_id: null
  }], ['preparation_snapshot_members', 'party_route_plan_executions'], sourceTrace);
  return {
    ...structuredClone(prepared),
    spatial_v3: {
      source: {
        g4_id: sourceNode.parent_g4_id,
        g5_site_id: ids.sourceG5,
        scene_baseline_id: ids.sourceBaseline,
        g6_instance_id: ids.sourceG6,
        position_id: ids.sourcePosition,
        endpoint_ref: sourceEndpointRef
      },
      target: { ...materialization, endpoint_ref: targetEndpointRef,
        s1_topology: structuredClone(s1Topology),
        s1_physical_writes: structuredClone(s1PhysicalWrites) },
      preparation_snapshot_id: ids.snapshot,
      preparation_snapshot_digest: snapshot.canonical_digest,
      preparation_member_ordinal: 0,
      preparation_member_digest: member.member_digest,
      route_plan_id: ids.route,
      route_plan_digest: routePlan.canonical_serialization_digest,
      route_plan_execution_id: ids.execution,
      preparation_claim_id: ids.claim,
      journey_location_id: ids.journeyLocation
    }
  };
}

function versionedRef(entityKind, entityId) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: '1'
  };
}

function dbVersionedRef(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId, authoring_version: '1' };
}

function authoringPin(dependencyRole, entityKind, entityId) {
  return {
    dependency_role: dependencyRole,
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1' }
  };
}

function dependencyPinSet(pins) {
  const ordered = [...pins].sort((left, right) =>
    `${left.dependency_role}\u0000${left.entity_ref.entity_kind}\u0000${left.entity_ref.entity_id}`
      .localeCompare(`${right.dependency_role}\u0000${right.entity_ref.entity_kind}\u0000${right.entity_ref.entity_id}`));
  return sealSpatial({ pins: ordered });
}

function endpointSnapshot(payload) {
  return sealSpatial(payload);
}

function sealSpatial(payload) {
  return { ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) };
}

function spatialDigest(payload) {
  return computeSpatialV3CanonicalDigest(payload).slice('sha256:'.length);
}

function assertSpatialContract(contractName, value) {
  const errors = validateSpatialV3Contract(contractName, value);
  if (errors.length === 0) return;
  const error = new Error(`Invalid ${contractName}.`);
  error.code = 'LOWER_DVINA_TRACE_FIRST_ENTRY_PREPARATION_INVALID';
  error.details = errors;
  throw error;
}
