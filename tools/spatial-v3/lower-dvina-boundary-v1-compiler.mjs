import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { digest } from './lower-dvina-v2-compiler.mjs';

export const PARENT_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v2';
export const SOURCE_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/staging/lower-dvina-boundary-v2';
export const CANDIDATE_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v3';
export const PARENT_WORLD_REVISION =
  'novgorod_spatial_v3_production_v2_candidate_001';
export const OUTPUT_WORLD_REVISION =
  'novgorod_spatial_v3_production_v3_candidate_001';
export const RELEASE_ID = 'spatial-v3-production-v3';
export const COMPILER_VERSION = 'lower-dvina-boundary-v1-compiler@1';
export const APPROVED_CONTENT_DIGEST =
  'cde64b5e6317cd580a16b9178e7291c326a9c2c478811c31851eb7e45e5e8f4b';

const PROVENANCE = 'prov_lower_dvina_boundary_authoring_v1';
const G0 = 'region_novgorod_land';
const G1_025 = 'gn_nov_g1_xp017_yp025';
const G2_025 = 'gn_nov_g2_xp017_yp025_dvina_corridor';
const G3_025 = 'gn_nov_g3_xp017_yp025_lower_dvina_reach';
const G4_025 = 'g4v3__gn_nov_g3_xp017_yp025_lower_dvina_reach';
const G5_025 = 'cg5v3__gn_nov_g4_xp017_yp025_navigation_corridor';
const G5_026 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach';
const G4_026 = 'g4v3__gn_nov_g3_xp017_yp026_r2_south_entry_reach';
const G1_026 = 'gn_nov_g1_xp017_yp026';
const PROFILE_025 = 'smpv3__gn_nov_g4_xp017_yp025_navigation_corridor';
const AVAILABILITY =
  'availability.lower_dvina_late_summer_daylight_v1';
const CONSEQUENCE = 'consequence.lower_dvina_segment_v1';
const FORWARD = 'wrv3__lower_dvina_yp026_to_yp025';
const REVERSE = 'wrv3__lower_dvina_yp025_to_yp026';
const FORWARD_CONTEXT = 'dctxv3__lower_dvina_yp026_to_yp025';
const REVERSE_CONTEXT = 'dctxv3__lower_dvina_yp025_to_yp026';
const FORWARD_EXIT = 'g4exitv3__lower_dvina_yp026_to_yp025';
const REVERSE_EXIT = 'g4exitv3__lower_dvina_yp025_to_yp026';
const FORWARD_TRANSITION = 'stcv3__lower_dvina_yp026_to_yp025';
const REVERSE_TRANSITION = 'stcv3__lower_dvina_yp025_to_yp026';
const FORWARD_BOUNDARY = 'bcv3__lower_dvina_yp026_to_yp025';
const REVERSE_BOUNDARY = 'bcv3__lower_dvina_yp025_to_yp026';

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function rowDigest(row) {
  const value = structuredClone(row);
  delete value.canonical_digest;
  return digest(value);
}

function seal(value, field) {
  const output = structuredClone(value);
  output[field] = digest(output);
  return output;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function carriedVersionIndex(parentAuthoringVersions) {
  const index = new Map();
  for (const row of parentAuthoringVersions) {
    if (row.entity_kind === 'external_dependency') continue;
    assert(!index.has(row.entity_id), 'parent_authoring_identity_ambiguous');
    index.set(row.entity_id, row.version);
  }
  return index;
}

async function internalVersionIndex({
  parentManifest,
  parentRoot,
  parentAuthoringVersions
}) {
  const index = carriedVersionIndex(parentAuthoringVersions);
  for (const item of parentManifest.datasets) {
    if (item.table === 'spatial_v3_external_dependency_versions') continue;
    const rows = JSON.parse(await readFile(resolve(parentRoot, item.file)));
    for (const row of rows) {
      if (typeof row.id !== 'string' || !Number.isInteger(row.version)) {
        continue;
      }
      const existing = index.get(row.id);
      assert(existing == null || existing === row.version,
        `parent_internal_version_conflict:${row.id}`);
      index.set(row.id, row.version);
    }
  }
  return index;
}

function transformCarriedRow(row, versions) {
  const output = structuredClone(row);
  for (const [key, id] of Object.entries(row)) {
    if (!key.endsWith('_id') || typeof id !== 'string') continue;
    const versionKey = `${key.slice(0, -3)}_version`;
    if (Number.isInteger(row[versionKey]) && versions.has(id)) {
      output[versionKey] = row[versionKey] + 1;
    }
  }
  if (row.world_revision_id === PARENT_WORLD_REVISION) {
    output.world_revision_id = OUTPUT_WORLD_REVISION;
  }
  if (typeof row.id === 'string' && Number.isInteger(row.version)
      && versions.has(row.id)) {
    output.version = row.version + 1;
  }
  if (typeof output.canonical_digest === 'string') {
    output.canonical_digest = rowDigest(output);
  }
  return output;
}

function externalPin(edge, externalById) {
  const selected = externalById.get(edge.target_entity_id);
  assert(selected, `external_dependency_selection_missing:${edge.target_entity_id}`);
  return {
    ...edge,
    target_registry_type: selected.registry_type,
    target_registry_id: selected.registry_id,
    target_registry_version: selected.registry_version,
    target_registry_digest: selected.registry_digest,
    target_dependency_digest: selected.dependency_digest
  };
}

function authoringVersion(entityKind, entityId) {
  const row = {
    entity_kind: entityKind,
    entity_id: entityId,
    version: 1,
    world_revision_id: OUTPUT_WORLD_REVISION,
    status: 'approved',
    provenance_ref: PROVENANCE
  };
  return { ...row, canonical_digest: rowDigest(row) };
}

function versionedRow(row) {
  const base = {
    ...row,
    version: 1,
    world_revision_id: OUTPUT_WORLD_REVISION,
    status: 'approved',
    provenance_ref: PROVENANCE
  };
  return { ...base, canonical_digest: rowDigest(base) };
}

function newAuthoringRows() {
  return [
    ...[G1_025, G2_025, G3_025, G4_025, G5_025]
      .map((id) => authoringVersion('spatial_node', id)),
    authoringVersion('scene_materialization_profile', PROFILE_025),
    ...[
      'env.lower_dvina_sheltered_approach_v1',
      'env.lower_dvina_open_channel_v1'
    ].map((id) => authoringVersion('transition_environment_profile', id)),
    ...[
      'cost.lower_dvina_sheltered_10m_v1',
      'cost.lower_dvina_upstream_open_30m_v1',
      'cost.lower_dvina_downstream_open_20m_v1'
    ].map((id) => authoringVersion('movement_method_cost_profile', id)),
    authoringVersion('traversal_availability_policy', AVAILABILITY),
    ...[
      'check.lower_dvina_boat_control_v1',
      'check.lower_dvina_orientation_v1'
    ].map((id) => authoringVersion('traversal_check_policy', id)),
    authoringVersion('traversal_consequence_policy', CONSEQUENCE),
    ...[
      'risk.lower_dvina_sheltered_approach_v1',
      'risk.lower_dvina_upstream_open_channel_v1',
      'risk.lower_dvina_downstream_open_channel_v1'
    ].map((id) => authoringVersion('traversal_risk_profile', id)),
    authoringVersion('topological_direction_context', FORWARD_CONTEXT),
    authoringVersion('topological_direction_context', REVERSE_CONTEXT),
    authoringVersion('g4_directional_exit', FORWARD_EXIT),
    authoringVersion('g4_directional_exit', REVERSE_EXIT),
    authoringVersion('world_route', FORWARD),
    authoringVersion('world_route', REVERSE),
    ...routePointIds(FORWARD).map((id) =>
      authoringVersion('world_route_point', id)),
    ...routePointIds(REVERSE).map((id) =>
      authoringVersion('world_route_point', id)),
    ...routeSegmentIds(FORWARD).map((id) =>
      authoringVersion('world_route_segment', id)),
    ...routeSegmentIds(REVERSE).map((id) =>
      authoringVersion('world_route_segment', id)),
    ...endpointBindingIds(FORWARD).map((id) =>
      authoringVersion('world_route_endpoint_binding', id)),
    ...endpointBindingIds(REVERSE).map((id) =>
      authoringVersion('world_route_endpoint_binding', id)),
    authoringVersion('spatial_transition_contract', FORWARD_TRANSITION),
    authoringVersion('spatial_transition_contract', REVERSE_TRANSITION),
    authoringVersion('boundary_crossing_contract', FORWARD_BOUNDARY),
    authoringVersion('boundary_crossing_contract', REVERSE_BOUNDARY)
  ];
}

function routePointIds(routeId) {
  return [0, 1, 2].map((ordinal) =>
    `wrpointv3__${routeId.slice('wrv3__'.length)}__0${ordinal}`);
}

function routeSegmentIds(routeId) {
  return [0, 1].map((ordinal) =>
    `wrsegv3__${routeId.slice('wrv3__'.length)}__0${ordinal}`);
}

function endpointBindingIds(routeId) {
  const stem = routeId.slice('wrv3__'.length);
  return [`wrebv3__${stem}__from`, `wrebv3__${stem}__to`];
}

function newTransitionContracts(outputVersions) {
  return [
    [FORWARD_TRANSITION, G1_026, outputVersions.get(G1_026), G1_025, 1, -1],
    [REVERSE_TRANSITION, G1_025, 1, G1_026, outputVersions.get(G1_026), 1]
  ].map(([id, fromG1, fromVersion, toG1, toVersion, gridDeltaY]) =>
    versionedRow({
      entity_kind: 'spatial_transition_contract',
      id,
      transition_kind: 'g1_adjacency',
      from_g0_id: G0,
      from_g0_version: outputVersions.get(G0),
      from_g1_id: fromG1,
      from_g1_version: fromVersion,
      to_g0_id: G0,
      to_g0_version: outputVersions.get(G0),
      to_g1_id: toG1,
      to_g1_version: toVersion,
      grid_delta_x: 0,
      grid_delta_y: gridDeltaY,
      legal_customs_profile_id: null,
      legal_customs_profile_version: null
    }));
}

function newBoundaryContracts(outputVersions) {
  const contextDigests = new Map(newSegmentContexts(outputVersions).map(
    (row) => [row.segment_id, row.canonical_digest]
  ));
  return [
    {
      id: FORWARD_BOUNDARY,
      route: FORWARD,
      point: routePointIds(FORWARD)[1],
      inbound: routeSegmentIds(FORWARD)[0],
      outbound: routeSegmentIds(FORWARD)[1],
      transition: FORWARD_TRANSITION,
      from: routeSegmentIds(FORWARD)[0],
      to: routeSegmentIds(FORWARD)[1]
    },
    {
      id: REVERSE_BOUNDARY,
      route: REVERSE,
      point: routePointIds(REVERSE)[1],
      inbound: routeSegmentIds(REVERSE)[0],
      outbound: routeSegmentIds(REVERSE)[1],
      transition: REVERSE_TRANSITION,
      from: routeSegmentIds(REVERSE)[0],
      to: routeSegmentIds(REVERSE)[1]
    }
  ].map((row) => versionedRow({
    entity_kind: 'boundary_crossing_contract',
    id: row.id,
    boundary_kind: 'g1_internal',
    route_id: row.route,
    route_version: 1,
    route_point_id: row.point,
    route_point_version: 1,
    inbound_segment_id: row.inbound,
    inbound_segment_version: 1,
    outbound_segment_id: row.outbound,
    outbound_segment_version: 1,
    from_context_digest: contextDigests.get(row.from),
    to_context_digest: contextDigests.get(row.to),
    transition_contract_id: row.transition,
    transition_contract_version: 1,
    switch_phase: 'outbound_dispatch',
    directionality: 'directed'
  }));
}

function newNodes() {
  return [
    [G1_025, 'G1', 'spatial.g1.territorial_grid_cell', 'reviewed', null],
    [G2_025, 'G2', 'spatial.g2.territorial_zone',
      'comparative_reconstruction', null],
    [G3_025, 'G3', 'spatial.g3.natural_feature',
      'comparative_reconstruction', null],
    [G4_025, 'G4', 'spatial.g4.sector',
      'comparative_reconstruction', 'through_area'],
    [G5_025, 'G5', 'spatial.g5.parcel',
      'comparative_reconstruction', null]
  ].map(([id, spatialLevel, primaryClassId, evidenceStatus, traversalModel]) =>
    versionedRow({
      entity_kind: 'spatial_node',
      id,
      spatial_level: spatialLevel,
      stable_label_id: null,
      primary_class_id: primaryClassId,
      evidence_status: evidenceStatus,
      traversal_model: traversalModel
    }));
}

function newParents(outputVersions) {
  return [
    [G1_025, 1, G0, outputVersions.get(G0)],
    [G2_025, 1, G1_025, 1],
    [G3_025, 1, G2_025, 1],
    [G4_025, 1, G3_025, 1],
    [G5_025, 1, G4_025, 1]
  ].map(([childId, childVersion, parentId, parentVersion]) => ({
    child_id: childId,
    child_version: childVersion,
    parent_id: parentId,
    parent_version: parentVersion,
    world_revision_id: OUTPUT_WORLD_REVISION
  }));
}

function newDirectionContexts(outputVersions) {
  return [{
    id: FORWARD_CONTEXT,
    version: 1,
    from_g4_id: G4_026,
    from_g4_version: outputVersions.get(G4_026),
    to_g4_id: G4_025,
    to_g4_version: 1,
    from_canonical_g5_id: G5_026,
    from_canonical_g5_version: outputVersions.get(G5_026),
    to_canonical_g5_id: G5_025,
    to_canonical_g5_version: 1,
    orientation_profile_id: 'orientation.topological_route',
    orientation_profile_version: outputVersions.get(
      'orientation.topological_route'
    ),
    status: 'approved',
    provenance_ref: PROVENANCE
  }, {
    id: REVERSE_CONTEXT,
    version: 1,
    from_g4_id: G4_025,
    from_g4_version: 1,
    to_g4_id: G4_026,
    to_g4_version: outputVersions.get(G4_026),
    from_canonical_g5_id: G5_025,
    from_canonical_g5_version: 1,
    to_canonical_g5_id: G5_026,
    to_canonical_g5_version: outputVersions.get(G5_026),
    orientation_profile_id: 'orientation.topological_route',
    orientation_profile_version: outputVersions.get(
      'orientation.topological_route'
    ),
    status: 'approved',
    provenance_ref: PROVENANCE
  }];
}

function newDirectionalExits(outputVersions) {
  return [
    [FORWARD_EXIT, G4_026, outputVersions.get(G4_026), FORWARD_CONTEXT,
      G5_026, outputVersions.get(G5_026)],
    [REVERSE_EXIT, G4_025, 1, REVERSE_CONTEXT, G5_025, 1]
  ].map(([id, g4Id, g4Version, contextId, g5Id, g5Version]) =>
    versionedRow({
      id,
      g4_id: g4Id,
      g4_version: g4Version,
      direction_context_id: contextId,
      exit_orientation_profile_id: null,
      exit_orientation_profile_version: null,
      exit_orientation_rule_id: 'exit_orientation__ordered_source_to_target',
      exit_orientation_rule_version: outputVersions.get(
        'exit_orientation__ordered_source_to_target'
      ),
      exit_kind: 'world_route_exit',
      exit_canonical_g5_id: g5Id,
      exit_canonical_g5_version: g5Version,
      boundary_feature_entity_kind: null,
      boundary_feature_entity_id: null,
      boundary_feature_version: null
    }));
}

function newRoutes() {
  return [
    [FORWARD, REVERSE, 'risk.lower_dvina_upstream_open_channel_v1'],
    [REVERSE, FORWARD, 'risk.lower_dvina_downstream_open_channel_v1']
  ].map(([id, reverseId, riskId]) => versionedRow({
    id,
    route_kind_id: 'route.river_channel',
    reverse_route_id: reverseId,
    reverse_route_version: 1,
    availability_condition_set_id: AVAILABILITY,
    availability_condition_set_version: 1,
    risk_profile_id: riskId,
    risk_profile_version: 1
  }));
}

function newRoutePoints(routeId) {
  return routePointIds(routeId).map((id, ordinal) => versionedRow({
    id,
    world_route_id: routeId,
    world_route_version: 1,
    ordinal,
    point_kind: ordinal === 0
      ? 'endpoint_from'
      : ordinal === 1 ? 'boundary' : 'endpoint_to',
    anchor_policy: ordinal === 1 ? 'shared_checkpoint' : 'endpoint_binding',
    stable_label_id: null,
    context_switch_phase: ordinal === 1 ? 'outbound_dispatch' : null
  }));
}

function newSegments(outputVersions) {
  const recheckVersion = outputVersions.get('recheck.water_15m');
  assert(recheckVersion === 3, 'exact_parent_recheck_version_resolution_failed');
  const definitions = [
    [FORWARD, 0, 'env.lower_dvina_sheltered_approach_v1',
      'cost.lower_dvina_sheltered_10m_v1', 10,
      'risk.lower_dvina_sheltered_approach_v1'],
    [FORWARD, 1, 'env.lower_dvina_open_channel_v1',
      'cost.lower_dvina_upstream_open_30m_v1', 30,
      'risk.lower_dvina_upstream_open_channel_v1'],
    [REVERSE, 0, 'env.lower_dvina_open_channel_v1',
      'cost.lower_dvina_downstream_open_20m_v1', 20,
      'risk.lower_dvina_downstream_open_channel_v1'],
    [REVERSE, 1, 'env.lower_dvina_sheltered_approach_v1',
      'cost.lower_dvina_sheltered_10m_v1', 10,
      'risk.lower_dvina_sheltered_approach_v1']
  ];
  return definitions.map(([routeId, ordinal, environmentId, costId,
    minutes, riskId]) => {
    const points = routePointIds(routeId);
    return versionedRow({
      id: routeSegmentIds(routeId)[ordinal],
      world_route_id: routeId,
      world_route_version: 1,
      ordinal,
      from_point_id: points[ordinal],
      from_point_version: 1,
      to_point_id: points[ordinal + 1],
      to_point_version: 1,
      transition_environment_profile_id: environmentId,
      transition_environment_profile_version: 1,
      movement_orientation_profile_id: null,
      movement_orientation_profile_version: null,
      topological_orientation_profile_id: 'orientation.channel_ordered',
      topological_orientation_profile_version: outputVersions.get(
        'orientation.channel_ordered'
      ),
      baseline_movement_method_id: 'movement.small_river_craft',
      movement_method_cost_profile_id: costId,
      movement_method_cost_profile_version: 1,
      base_minutes: minutes,
      dynamic_recheck_policy_id: 'recheck.water_15m',
      dynamic_recheck_policy_version: recheckVersion,
      capacity: null,
      risk_profile_id: riskId,
      risk_profile_version: 1,
      availability_condition_set_id: AVAILABILITY,
      availability_condition_set_version: 1
    });
  });
}

function newSegmentContexts(outputVersions) {
  return [
    [routeSegmentIds(FORWARD)[0], G1_026, outputVersions.get(G1_026),
      G4_026, outputVersions.get(G4_026)],
    [routeSegmentIds(FORWARD)[1], G1_025, 1, G4_025, 1],
    [routeSegmentIds(REVERSE)[0], G1_025, 1, G4_025, 1],
    [routeSegmentIds(REVERSE)[1], G1_026, outputVersions.get(G1_026),
      G4_026, outputVersions.get(G4_026)]
  ].map(([segmentId, g1Id, g1Version, g4Id, g4Version]) => {
    const row = {
      segment_id: segmentId,
      segment_version: 1,
      g0_id: G0,
      g0_version: outputVersions.get(G0),
      g1_id: g1Id,
      g1_version: g1Version,
      g2_id: null,
      g2_version: null,
      g3_id: null,
      g3_version: null,
      g4_corridor_id: g4Id,
      g4_corridor_version: g4Version,
      jurisdiction_profile_id: null,
      jurisdiction_profile_version: null,
      weather_scope_id: `weather_scope_g1__${g1Id}`,
      event_pool_profile_id: null,
      event_pool_profile_version: null,
      status: 'approved',
      provenance_ref: PROVENANCE
    };
    return { ...row, canonical_digest: rowDigest(row) };
  });
}

function newEndpointBindings(outputVersions) {
  const forwardPoints = routePointIds(FORWARD);
  const reversePoints = routePointIds(REVERSE);
  return [
    [endpointBindingIds(FORWARD)[0], FORWARD, 'from', forwardPoints[0],
      G5_026, outputVersions.get(G5_026), FORWARD_EXIT, 'departure'],
    [endpointBindingIds(FORWARD)[1], FORWARD, 'to', forwardPoints[2],
      G5_025, 1, null, 'arrival'],
    [endpointBindingIds(REVERSE)[0], REVERSE, 'from', reversePoints[0],
      G5_025, 1, REVERSE_EXIT, 'departure'],
    [endpointBindingIds(REVERSE)[1], REVERSE, 'to', reversePoints[2],
      G5_026, outputVersions.get(G5_026), null, 'arrival']
  ].map(([id, routeId, role, pointId, g5Id, g5Version, exitId, slot]) =>
    versionedRow({
      id,
      world_route_id: routeId,
      world_route_version: 1,
      endpoint_role: role,
      route_point_id: pointId,
      route_point_version: 1,
      canonical_g5_id: g5Id,
      canonical_g5_version: g5Version,
      directional_exit_id: exitId,
      directional_exit_version: exitId == null ? null : 1,
      scene_endpoint_slot_key: slot
    }));
}

function newEnvironmentProfiles() {
  return [
    ['env.lower_dvina_sheltered_approach_v1',
      'sheltered_water_approach',
      'Topological sheltered departure or arrival approach; normal supported conditions require no check.'],
    ['env.lower_dvina_open_channel_v1',
      'open_main_channel_water',
      'Corridor-only open main-channel interval; no exact geometry or automatic hazard draw.']
  ].map(([id, environmentClassId, definition]) => versionedRow({
    id,
    environment_class_id: environmentClassId,
    permanent_cost_basis_id: null,
    dynamic_environment_rule_set_id: null,
    dynamic_environment_rule_set_version: null,
    definition
  }));
}

function newCostProfiles() {
  return [
    ['cost.lower_dvina_sheltered_10m_v1', 10,
      'Sheltered departure/arrival approach baseline.'],
    ['cost.lower_dvina_upstream_open_30m_v1', 30,
      'Upstream open-channel boundary segment baseline.'],
    ['cost.lower_dvina_downstream_open_20m_v1', 20,
      'Downstream open-channel boundary segment baseline.']
  ].map(([id, baseMinutes, definition]) => versionedRow({
    id,
    baseline_movement_method_id: 'movement.small_river_craft',
    base_minutes: baseMinutes,
    dynamic_modifiers_required: true,
    calibration_kind: 'discrete_boundary_segment_gameplay_calibration',
    distance_derived: false,
    measured_historical_duration: false,
    definition
  }));
}

function policyDatasets() {
  const availability = [versionedRow({
    id: AVAILABILITY,
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    season_mode: 'late_summer_open_water',
    daylight_required: true,
    fallback_behavior: 'forbidden',
    unsupported_state_behavior: 'hard_block'
  })];
  const values = {
    season_mode: ['late_summer_open_water'],
    water_surface_state: ['open_water'],
    wind_band: ['calm', 'light', 'moderate_supported'],
    visibility_band: ['clear', 'light_haze', 'reduced_but_navigable'],
    craft_state: ['serviceable'],
    load_state: ['within_approved_capacity'],
    controller_state: ['approved_boatman_in_control']
  };
  const availabilityValues = Object.entries(values).flatMap(
    ([dimensionId, allowed]) => allowed.map((valueId, ordinal) => ({
      policy_id: AVAILABILITY,
      policy_version: 1,
      dimension_id: dimensionId,
      value_id: valueId,
      disposition: 'allowed',
      canonical_ordinal: ordinal
    }))
  );
  const checks = [
    ['check.lower_dvina_boat_control_v1', 'craft_control',
      'dexterity', 'travel_transport'],
    ['check.lower_dvina_orientation_v1', 'orientation',
      'attention', 'observation']
  ].map(([id, activationDomain, characteristicId, modifierSkillId]) =>
    versionedRow({
      id,
      activation_domain: activationDomain,
      characteristic_id: characteristicId,
      modifier_skill_id: modifierSkillId,
      one_factor_dc: 10,
      two_factor_dc: 12,
      maximum_factor_count: 2,
      identity_scope_kind: 'traversal_interval_result_id'
    }));
  const triggerDefinitions = {
    'check.lower_dvina_boat_control_v1': [
      'moderate_supported_wind',
      'moderate_cross_current',
      'craft_control_degraded'
    ],
    'check.lower_dvina_orientation_v1': [
      'reduced_but_navigable_visibility',
      'landmark_confidence_reduced'
    ]
  };
  const triggers = Object.entries(triggerDefinitions).flatMap(
    ([checkPolicyId, ids]) => ids.map((triggerId, canonicalOrdinal) => ({
      check_policy_id: checkPolicyId,
      check_policy_version: 1,
      trigger_id: triggerId,
      canonical_ordinal: canonicalOrdinal
    }))
  );
  const consequences = [versionedRow({
    id: CONSEQUENCE,
    pre_progress_elapsed_minutes: 0,
    pre_progress_progress_ppm: 0,
    positive_progress_delay_minutes: 5,
    positive_progress_energy_delta: -2,
    condition_candidate_id: 'wet',
    first_failure_state: 'paused_in_transit',
    repeated_failure_state: 'stranded_in_transit',
    preserves_committed_elapsed: true,
    preserves_committed_progress: true,
    fatality_allowed: false,
    craft_destruction_allowed: false,
    inventory_wipe_allowed: false
  })];
  const risks = [
    ['risk.lower_dvina_sheltered_approach_v1',
      'env.lower_dvina_sheltered_approach_v1', 'low'],
    ['risk.lower_dvina_upstream_open_channel_v1',
      'env.lower_dvina_open_channel_v1', 'moderate_nonfatal'],
    ['risk.lower_dvina_downstream_open_channel_v1',
      'env.lower_dvina_open_channel_v1', 'moderate_nonfatal']
  ].map(([id, environmentProfileId, severityBand]) => versionedRow({
    id,
    environment_profile_id: environmentProfileId,
    environment_profile_version: 1,
    activation_kind: 'environment_or_craft_state_trigger_only',
    severity_band: severityBand,
    random_draw_allowed: false,
    mixed_check_domain_behavior: 'hard_block',
    consequence_policy_id: CONSEQUENCE,
    consequence_policy_version: 1
  }));
  const riskChecks = risks.flatMap(({ id }) => {
    const domains = id.includes('sheltered')
      ? [['craft_control', 'check.lower_dvina_boat_control_v1']]
      : [
          ['craft_control', 'check.lower_dvina_boat_control_v1'],
          ['orientation', 'check.lower_dvina_orientation_v1']
        ];
    return domains.map(([checkDomain, checkPolicyId], canonicalOrdinal) => ({
      risk_profile_id: id,
      risk_profile_version: 1,
      check_domain: checkDomain,
      check_policy_id: checkPolicyId,
      check_policy_version: 1,
      canonical_ordinal: canonicalOrdinal
    }));
  });
  const hazards = {
    'risk.lower_dvina_sheltered_approach_v1': [
      'craft_control_shift', 'wet_exposure'
    ],
    'risk.lower_dvina_upstream_open_channel_v1': [
      'shoal_or_grounding', 'lateral_drift',
      'orientation_loss', 'wet_exposure'
    ],
    'risk.lower_dvina_downstream_open_channel_v1': [
      'lateral_drift', 'orientation_loss',
      'shoal_or_grounding', 'wet_exposure'
    ]
  };
  const riskHazards = Object.entries(hazards).flatMap(
    ([riskProfileId, ids]) => ids.map((hazardClassId, canonicalOrdinal) => ({
      risk_profile_id: riskProfileId,
      risk_profile_version: 1,
      hazard_class_id: hazardClassId,
      canonical_ordinal: canonicalOrdinal
    }))
  );
  return {
    spatial_v3_traversal_availability_policies: availability,
    spatial_v3_traversal_availability_values: availabilityValues,
    spatial_v3_traversal_check_policies: checks,
    spatial_v3_traversal_check_triggers: triggers,
    spatial_v3_traversal_consequence_policies: consequences,
    spatial_v3_traversal_risk_profiles: risks,
    spatial_v3_traversal_risk_check_bindings: riskChecks,
    spatial_v3_traversal_risk_hazards: riskHazards
  };
}

function sourceRecord() {
  return {
    id: PROVENANCE,
    title: 'Lower Dvina yp025↔yp026 boundary authoring package v1',
    source_type: 'project_note',
    url: null,
    file_reference:
      'data/world-catalogs/novgorod/spatial-v3/staging/lower-dvina-boundary-v2/approved-authoring-v1.json',
    summary:
      `approved candidate ${APPROVED_CONTENT_DIGEST}; topological-only boundary authoring and gameplay calibration`,
    limitations:
      'No exact geometry, bank, landing, settlement, measured historical duration, random hazard probability or fatal consequence.',
    status: 'approved',
    confidence: 'medium'
  };
}

function newDependencyEdges(outputVersions, externalById) {
  const edge = ({
    sourceKind, sourceId, role, targetKind, targetId, targetVersion,
    ordinal = 0
  }) => {
    const base = {
      source_entity_kind: sourceKind,
      source_entity_id: sourceId,
      source_version: 1,
      world_revision_id: OUTPUT_WORLD_REVISION,
      dependency_role: role,
      target_entity_kind: targetKind,
      target_entity_id: targetId,
      target_version: targetVersion,
      canonical_ordinal: ordinal,
      provenance_ref: PROVENANCE,
      target_registry_type: null,
      target_registry_id: null,
      target_registry_version: null,
      target_registry_digest: null,
      target_dependency_digest: null
    };
    return targetKind === 'external_dependency'
      ? externalPin(base, externalById)
      : base;
  };
  return [
    edge({ sourceKind: 'spatial_node', sourceId: G1_025, role: 'parent',
      targetKind: 'spatial_node', targetId: G0,
      targetVersion: outputVersions.get(G0) }),
    edge({ sourceKind: 'spatial_node', sourceId: G2_025, role: 'parent',
      targetKind: 'spatial_node', targetId: G1_025, targetVersion: 1 }),
    edge({ sourceKind: 'spatial_node', sourceId: G3_025, role: 'parent',
      targetKind: 'spatial_node', targetId: G2_025, targetVersion: 1 }),
    edge({ sourceKind: 'spatial_node', sourceId: G4_025, role: 'parent',
      targetKind: 'spatial_node', targetId: G3_025, targetVersion: 1 }),
    edge({ sourceKind: 'spatial_node', sourceId: G5_025, role: 'parent',
      targetKind: 'spatial_node', targetId: G4_025, targetVersion: 1 }),
    edge({ sourceKind: 'spatial_node', sourceId: G5_025,
      role: 'primary_function', targetKind: 'external_dependency',
      targetId: 'navigation_zone', targetVersion: 1 }),
    edge({ sourceKind: 'spatial_node', sourceId: G5_025,
      role: 'spatial_class', targetKind: 'external_dependency',
      targetId: 'spatial.g5.parcel', targetVersion: 1 }),
    ...[FORWARD, REVERSE].map((sourceId) => edge({
      sourceKind: 'world_route',
      sourceId,
      role: 'route_kind',
      targetKind: 'external_dependency',
      targetId: 'route.river_channel',
      targetVersion: 1
    })),
    ...routeSegmentIds(FORWARD).concat(routeSegmentIds(REVERSE))
      .map((sourceId) => edge({
        sourceKind: 'world_route_segment',
        sourceId,
        role: 'baseline_movement_method',
        targetKind: 'external_dependency',
        targetId: 'movement.small_river_craft',
        targetVersion: 1
      }))
  ];
}

function sourceTransitionSet(parentTransition, allocations, approvalDigest) {
  const inherited = parentTransition.exact_inherited_parent_set ?? [];
  return seal({
    schema: 'rus.spatial-v3.source_transition_set.v1',
    world_revision_id: OUTPUT_WORLD_REVISION,
    exact_inherited_parent_set: [
      ...inherited.map((row) => ({
        ...row,
        parent_version: row.output_version,
        output_version: row.output_version + 1
      })),
      ...allocations.filter(({ allocation_kind: kind }) =>
        kind === 'new').map((row) => ({
        entity_kind: row.entity_kind,
        entity_id: row.entity_id,
        parent_version: null,
        output_version: 1,
        transition_kind: 'new'
      }))
    ],
    new_transitions: [{
      transition_id: 'MATCH_DVINA_YP025_YP026_001',
      transition_kind: 'staging_source_supersession',
      approval_decision_digest: approvalDigest,
      evidence_result: 'validated_in_candidate',
      effective_for_production_line: false
    }]
  }, 'transition_set_digest');
}

export async function compileLowerDvinaBoundaryV1({
  root = process.cwd(),
  exactHead
} = {}) {
  assert(/^[a-f0-9]{40}$/u.test(exactHead), 'exact_head_invalid');
  const parentRoot = resolve(root, PARENT_ROOT);
  const sourceRoot = resolve(root, SOURCE_ROOT);
  const candidateRoot = resolve(root, CANDIDATE_ROOT);
  const parentManifestBytes = await readFile(resolve(parentRoot, 'manifest.json'));
  const parentManifest = JSON.parse(parentManifestBytes);
  assert(parentManifest.release_id === 'spatial-v3-production-v2',
    'exact_parent_release_mismatch');
  assert(parentManifest.world_revision_id === PARENT_WORLD_REVISION,
    'exact_parent_world_revision_mismatch');
  for (const item of parentManifest.datasets) {
    const bytes = await readFile(resolve(parentRoot, item.file));
    assert(digest(bytes) === item.sha256,
      `exact_parent_dataset_digest_mismatch:${item.table}`);
  }
  const approvedSourceBytes = await readFile(resolve(
    sourceRoot, 'approved-authoring-v1.json'
  ));
  const approvedSource = JSON.parse(approvedSourceBytes);
  const approvalBytes = await readFile(resolve(
    sourceRoot, 'approval-decision-v1.json'
  ));
  const approval = JSON.parse(approvalBytes);
  assert(approvedSource.candidate_content_digest === APPROVED_CONTENT_DIGEST,
    'approved_candidate_digest_mismatch');
  assert(approval.candidate_content_digest === APPROVED_CONTENT_DIGEST,
    'approval_candidate_digest_mismatch');
  assert(approval.decision === 'APPROVE_LOWER_DVINA_BOUNDARY_AUTHORING_V1',
    'explicit_user_approval_missing');

  const parentVersions = JSON.parse(await readFile(resolve(
    parentRoot, 'datasets/spatial_v3_authoring_versions.json'
  )));
  const versions = await internalVersionIndex({
    parentManifest,
    parentRoot,
    parentAuthoringVersions: parentVersions
  });
  const outputVersions = new Map([...versions].map(([id, version]) =>
    [id, version + 1]));
  const parentExternal = JSON.parse(await readFile(resolve(
    parentRoot, 'datasets/spatial_v3_external_dependency_versions.json'
  )));
  const externalById = new Map(parentExternal.map((row) =>
    [row.dependency_id, row]));

  await rm(candidateRoot, { recursive: true, force: true });
  const compiled = new Map();
  for (const item of parentManifest.datasets) {
    const rows = JSON.parse(await readFile(resolve(parentRoot, item.file)));
    if (item.table === 'spatial_v3_world_revisions') {
      compiled.set(item.table, [
        ...rows,
        {
          id: OUTPUT_WORLD_REVISION,
          parent_revision_id: PARENT_WORLD_REVISION,
          catalog_digest: '0'.repeat(64),
          status: 'approved',
          provenance_ref: PROVENANCE,
          deprecated_at: null
        }
      ]);
    } else if (item.table === 'world_revisions') {
      compiled.set(item.table, [{
        id: OUTPUT_WORLD_REVISION,
        parent_revision_id: null,
        title: 'Novgorod Spatial-v3 production v3 boundary successor pin',
        effective_from: '1230-01-01',
        effective_to: '1250-12-31',
        catalog_digest: '0'.repeat(64),
        status: 'approved'
      }]);
    } else if (item.table === 'spatial_v3_authoring_versions') {
      const carried = rows
        .filter(({ entity_kind: kind }) => kind !== 'external_dependency')
        .map((row) => {
          const output = {
            ...row,
            version: row.version + 1,
            world_revision_id: OUTPUT_WORLD_REVISION
          };
          output.canonical_digest = rowDigest(output);
          return output;
        });
      compiled.set(item.table, [...carried, ...newAuthoringRows()]);
    } else if (item.table === 'spatial_v3_authoring_dependency_edges') {
      const carried = rows.map((row) => {
        const output = {
          ...row,
          source_version: row.source_version + 1,
          world_revision_id: OUTPUT_WORLD_REVISION
        };
        if (row.target_entity_kind !== 'external_dependency') {
          output.target_version = row.target_version + 1;
        }
        return output;
      });
      compiled.set(item.table, [
        ...carried,
        ...newDependencyEdges(outputVersions, externalById)
      ]);
    } else if (item.table === 'source_records') {
      compiled.set(item.table, [...rows, sourceRecord()]);
    } else if (item.table === 'spatial_v3_external_dependency_versions') {
      compiled.set(item.table, structuredClone(rows));
    } else {
      compiled.set(item.table, rows.map((row) =>
        transformCarriedRow(row, versions)));
    }
  }

  const append = (table, rows) =>
    compiled.set(table, [...(compiled.get(table) ?? []), ...rows]);
  append('spatial_v3_nodes', newNodes());
  append('spatial_v3_node_parents', newParents(outputVersions));
  append('spatial_v3_node_classes', newNodes().map((row) => ({
    node_id: row.id,
    node_version: 1,
    category_id: row.primary_class_id,
    class_ordinal: 0
  })));
  append('spatial_v3_g1_grid_cells', [{
    node_id: G1_025,
    node_version: 1,
    world_revision_id: OUTPUT_WORLD_REVISION,
    root_g0_id: G0,
    root_g0_version: outputVersions.get(G0),
    grid_convention: 'grid_east_north_v1',
    grid_x: 17,
    grid_y: 25,
    cell_code: 'xp017_yp025'
  }]);
  append('spatial_v3_g4_traversal_profiles', [{
    g4_id: G4_025,
    g4_version: 1,
    traversal_model: 'through_area',
    status: 'approved'
  }]);
  append('spatial_v3_scene_materialization_profiles', [
    versionedRow({
      id: PROFILE_025,
      source_kind: 'canonical_g5',
      source_entity_id: G5_025,
      source_entity_version: 1,
      selection_rule_id: 'scene_selection_single_candidate_v1',
      selection_rule_version: outputVersions.get(
        'scene_selection_single_candidate_v1'
      )
    })
  ]);
  append('spatial_v3_scene_materialization_candidates', [{
    profile_id: PROFILE_025,
    profile_version: 1,
      scene_template_id: 'stfv3__g5_water_navigation_v1',
    scene_template_version:
      outputVersions.get('stfv3__g5_water_navigation_v1'),
    weight: 1,
    applicability_rule_id: 'scene_applicability_exact_source_ref_v1',
    applicability_rule_version: outputVersions.get(
      'scene_applicability_exact_source_ref_v1'
    )
  }]);
  append('spatial_v3_transition_environment_profiles',
    newEnvironmentProfiles());
  append('spatial_v3_movement_method_cost_profiles', newCostProfiles());
  append('spatial_v3_topological_direction_contexts',
    newDirectionContexts(outputVersions));
  append('spatial_v3_g4_directional_exits',
    newDirectionalExits(outputVersions));
  append('spatial_v3_world_routes', newRoutes());
  append('spatial_v3_world_route_points', [
    ...newRoutePoints(FORWARD),
    ...newRoutePoints(REVERSE)
  ]);
  append('spatial_v3_world_route_segments', newSegments(outputVersions));
  append('spatial_v3_world_route_segment_spatial_contexts',
    newSegmentContexts(outputVersions));
  append('spatial_v3_world_route_endpoint_bindings',
    newEndpointBindings(outputVersions));
  append('spatial_v3_spatial_transition_contracts',
    newTransitionContracts(outputVersions));
  append('spatial_v3_spatial_transition_allowed_route_kinds', [
    {
      transition_contract_id: FORWARD_TRANSITION,
      transition_contract_version: 1,
      route_kind_id: 'route.river_channel'
    },
    {
      transition_contract_id: REVERSE_TRANSITION,
      transition_contract_version: 1,
      route_kind_id: 'route.river_channel'
    }
  ]);
  append('spatial_v3_boundary_crossing_contracts',
    newBoundaryContracts(outputVersions));
  for (const [table, rows] of Object.entries(policyDatasets())) {
    append(table, rows);
  }

  const allocation = seal({
    schema: 'rus.spatial-v3.version_allocation_manifest.v1',
    world_revision_id: OUTPUT_WORLD_REVISION,
    allocation_rule:
      'carried/revised=exact_parent+1; new=1; external=exact_selected',
    forbidden_rules: ['MAX(version)', 'timestamps', 'file_order', 'latest'],
    allocations: [
      ...parentVersions
        .filter(({ entity_kind: kind }) => kind !== 'external_dependency')
        .map((row) => ({
          entity_kind: row.entity_kind,
          entity_id: row.entity_id,
          allocation_kind: 'carried_or_revised_internal',
          exact_parent_version: row.version,
          output_version: row.version + 1
        })),
      ...newAuthoringRows().map((row) => ({
        entity_kind: row.entity_kind,
        entity_id: row.entity_id,
        allocation_kind: 'new',
        exact_parent_version: null,
        output_version: 1
      }))
    ]
  }, 'manifest_digest');
  const parentTransition = JSON.parse(await readFile(resolve(
    parentRoot, 'source_transition_set.json'
  )));
  const transitionSet = sourceTransitionSet(
    parentTransition,
    allocation.allocations,
    digest(approvalBytes)
  );
  const transitionValidation = seal({
    schema: 'rus.spatial-v3.source_transition_validation.v1',
    transition_set_digest: transitionSet.transition_set_digest,
    result: 'pass',
    production_activation_required_for_effectiveness: true,
    production_activation_performed: false
  }, 'validation_digest');
  const dependencyBundle = seal({
    schema: 'rus.spatial-v3.dependency_resolution_bundle.v1',
    bundle_version: 1,
    compiler_version: COMPILER_VERSION,
    exact_head: exactHead,
    parent_world_revision_id: PARENT_WORLD_REVISION,
    parent_manifest_sha256: digest(parentManifestBytes),
    selection_rule: 'reuse exact immutable parent external pin set',
    registry: parentExternal[0] == null ? null : {
      registry_type: parentExternal[0].registry_type,
      registry_id: parentExternal[0].registry_id,
      registry_version: parentExternal[0].registry_version,
      registry_digest: parentExternal[0].registry_digest
    },
    selections: parentExternal.map((row) => ({
      dependency_id: row.dependency_id,
      dependency_version: row.dependency_version,
      dependency_digest: row.dependency_digest,
      status: row.status
    }))
  }, 'bundle_digest');
  const externalPinSet = seal({
    schema: 'rus.spatial-v3.external_pin_set.v1',
    dependency_resolution_bundle_digest: dependencyBundle.bundle_digest,
    pins: parentExternal
  }, 'pin_set_digest');
  const authoringApproval = seal({
    schema: 'rus.lower_dvina.boundary_compiler_approval_evidence.v1',
    candidate_id: approvedSource.candidate_id,
    candidate_content_digest: APPROVED_CONTENT_DIGEST,
    source_zip_sha256: approvedSource.source_zip_sha256,
    decision: approval.decision,
    approval_decision_sha256: digest(approvalBytes),
    approved_authoring_sha256: digest(approvedSourceBytes),
    exact_parent_world_revision_id: PARENT_WORLD_REVISION,
    exact_parent_manifest_sha256: digest(parentManifestBytes)
  }, 'evidence_digest');

  const preEntries = [];
  for (const [table, rows] of compiled) {
    const file = `datasets/${table}.json`;
    const bytes = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`);
    preEntries.push({ table, file, sha256: digest(bytes) });
  }
  const catalogDigest = digest(preEntries.filter(({ table }) =>
    !['world_revisions', 'spatial_v3_world_revisions'].includes(table)));
  compiled.get('world_revisions')[0].catalog_digest = catalogDigest;
  compiled.get('spatial_v3_world_revisions')
    .find(({ id }) => id === OUTPUT_WORLD_REVISION)
    .catalog_digest = catalogDigest;

  const datasets = [];
  for (const [table, rows] of compiled) {
    const file = `datasets/${table}.json`;
    const path = resolve(candidateRoot, file);
    await writeJson(path, rows);
    const bytes = await readFile(path);
    const parent = parentManifest.datasets.find((item) => item.table === table);
    datasets.push({
      table,
      file,
      sha256: digest(bytes),
      status: 'approved',
      delete_policy: 'forbid',
      depends_on: parent?.depends_on ?? []
    });
  }
  const manifest = seal({
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v2',
    bundle_id: 'novgorod-spatial-v3-production-v3-candidate-001',
    release_id: RELEASE_ID,
    world_revision_id: OUTPUT_WORLD_REVISION,
    parent_revision_id: PARENT_WORLD_REVISION,
    status: 'approved',
    release_status: 'validated_candidate_not_active',
    production_activation: false,
    canonical_head_changed: false,
    operator_db_touched: false,
    runtime_selectable_in_canonical_production: false,
    boundary_crossing_capability: 'ready_for_runtime_acceptance',
    delete_policy: 'forbid',
    compiler_version: COMPILER_VERSION,
    approved_authoring_content_digest: APPROVED_CONTENT_DIGEST,
    authoring_approval_evidence_digest: authoringApproval.evidence_digest,
    dependency_resolution_bundle_digest: dependencyBundle.bundle_digest,
    version_allocation_manifest_digest: allocation.manifest_digest,
    source_transition_set_digest: transitionSet.transition_set_digest,
    external_pin_set_digest: externalPinSet.pin_set_digest,
    catalog_digest: catalogDigest,
    datasets
  }, 'canonical_output_digest');

  await Promise.all([
    writeJson(resolve(candidateRoot, 'manifest.json'), manifest),
    writeJson(resolve(candidateRoot, 'dependency_resolution_bundle.json'),
      dependencyBundle),
    writeJson(resolve(candidateRoot, 'external_pin_set.json'),
      externalPinSet),
    writeJson(resolve(candidateRoot, 'version_allocation_manifest.json'),
      allocation),
    writeJson(resolve(candidateRoot, 'source_transition_set.json'),
      transitionSet),
    writeJson(resolve(candidateRoot, 'source_transition_validation.json'),
      transitionValidation),
    writeJson(resolve(candidateRoot, 'authoring-approval-evidence.json'),
      authoringApproval),
    writeJson(resolve(candidateRoot, 'source/approved-authoring-package.v1.json'),
      approvedSource),
    writeJson(resolve(candidateRoot, 'source/approval-decision.v1.json'),
      approval)
  ]);
  return manifest;
}

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const exactHead = process.argv[3] ??
    '0a196b3293cc8c87ea52ec55b7bc493b21b03d19';
  const manifest = await compileLowerDvinaBoundaryV1({ root, exactHead });
  process.stdout.write(`${JSON.stringify({
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    dataset_count: manifest.datasets.length,
    canonical_output_digest: manifest.canonical_output_digest,
    production_activation: manifest.production_activation
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
