import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { collectInputs, validateWorldRouteDependencyEdges, validateWorldRouteWave } from '../build-world-route-wave.mjs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('world route wave is deterministic, mirrored, minute-exact and draft-only', () => {
  const first = validateWorldRouteWave();
  const second = validateWorldRouteWave();
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  const { datasets, manifest, report } = first;
  const routes = datasets.spatial_v3_world_routes;
  const points = datasets.spatial_v3_world_route_points;
  const segments = datasets.spatial_v3_world_route_segments;
  const endpoints = datasets.spatial_v3_world_route_endpoint_bindings;
  assert.deepEqual(report.scope, {
    pairs: 24, directed_routes: 48, directed_segments: 60, internal_points: 12, endpoints: 96,
  });
  assert.equal(routes.length, 48);
  assert.equal(points.length, 108);
  assert.equal(segments.length, 60);
  assert.equal(endpoints.length, 96);
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.delete_policy, 'forbid');
  assert.ok(manifest.datasets.every((entry) => entry.status === 'draft'));
  assert.ok(manifest.datasets.every((entry) => entry.file.startsWith('datasets/')));

  const derived = new Map(json('data/world-catalogs/novgorod/m2c-place-coordinates/derived-report.json')
    .lines.map((row) => [row.id, row.proposed_minutes]));
  const routeByRef = new Map(routes.map((route) => [`${route.id}@${route.version}`, route]));
  const pointsByRoute = new Map();
  for (const point of points) {
    const key = `${point.world_route_id}@${point.world_route_version}`;
    pointsByRoute.set(key, [...(pointsByRoute.get(key) ?? []), point]);
  }
  const byRoute = new Map();
  for (const segment of segments) {
    const key = `${segment.world_route_id}@${segment.world_route_version}`;
    byRoute.set(key, [...(byRoute.get(key) ?? []), segment]);
    assert.ok(Number.isInteger(segment.base_minutes) && segment.base_minutes > 0);
    assert.match(segment.baseline_movement_method_id, /^movement_method\./u);
    assert.match(segment.line_kind_profile_id, /^lkp__/u);
    assert.ok(segment.line_name.length > 0);
    assert.ok(segment.line_direction_id.startsWith('direction.'));
  }
  for (const route of routes) {
    const key = `${route.id}@${route.version}`;
    const reverse = routeByRef.get(`${route.reverse_route_id}@${route.reverse_route_version}`);
    assert.ok(reverse, `${route.id}: reciprocal route exists`);
    assert.equal(reverse.reverse_route_id, route.id);
    assert.equal(reverse.reverse_route_version, route.version);
    const routeSegments = byRoute.get(key).sort((a, b) => a.ordinal - b.ordinal);
    const routePoints = pointsByRoute.get(key).sort((a, b) => a.ordinal - b.ordinal);
    assert.deepEqual(routeSegments.map((row) => row.ordinal), routeSegments.map((_, index) => index));
    assert.equal(routePoints.length, routeSegments.length + 1);
    for (let index = 0; index < routeSegments.length; index += 1) {
      assert.equal(routeSegments[index].from_point_id, routePoints[index].id);
      assert.equal(routeSegments[index].to_point_id, routePoints[index + 1].id);
      if (index > 0)
      assert.equal(routeSegments[index - 1].to_point_id, routeSegments[index].from_point_id);
    }
    assert.equal(routeSegments.reduce((sum, segment) => sum + segment.base_minutes, 0), derived.get(route.id));
  }
});

test('offroad adds only its profile/cost and reuses the existing environment', () => {
  const { datasets } = validateWorldRouteWave();
  const profiles = datasets.spatial_v3_line_kind_profiles;
  const offroad = profiles.find((row) => row.id === 'lkp__offroad');
  assert.ok(offroad);
  assert.equal(offroad.transition_environment_profile_id, 'env.offroad');
  assert.equal(offroad.transition_environment_profile_version, 1);
  assert.equal(offroad.movement_method_cost_profile_id, 'cost.line_offroad');
  assert.equal(offroad.baseline_movement_method_id, 'movement_method.walk');
  assert.equal(datasets.spatial_v3_transition_environment_profiles.filter((row) => row.id === 'env.offroad').length, 1);
  assert.equal(datasets.spatial_v3_movement_method_cost_profiles.filter((row) => row.id === 'cost.line_offroad').length, 1);
});

test('dependency edge validation rejects a missing route-kind edge and a mismatched method target', () => {
  const { datasets } = validateWorldRouteWave();
  const route = datasets.spatial_v3_world_routes[0];
  const missingRouteKind = structuredClone(datasets);
  missingRouteKind.spatial_v3_authoring_dependency_edges = missingRouteKind.spatial_v3_authoring_dependency_edges
    .filter((edge) => !(edge.source_entity_kind === 'world_route' && edge.source_entity_id === route.id && edge.source_version === route.version));
  assert.throws(() => validateWorldRouteDependencyEdges(missingRouteKind), /WORLD_ROUTE_KIND_EDGE_COUNT/u);

  const segment = datasets.spatial_v3_world_route_segments[0];
  const mismatchedMethod = structuredClone(datasets);
  mismatchedMethod.spatial_v3_authoring_dependency_edges.push({
    source_entity_kind: 'world_route_segment', source_entity_id: segment.id, source_version: segment.version,
    dependency_role: 'baseline_movement_method', target_entity_kind: 'external_dependency',
    target_entity_id: 'movement.foot', target_version: 1,
  });
  assert.throws(() => validateWorldRouteDependencyEdges(mismatchedMethod), /SEGMENT_METHOD_EDGE_TARGET_MISMATCH/u);
});

test('chord route applies line-name and source-kind checks', () => {
  const mutate = (change) => {
    const inputs = structuredClone(collectInputs());
    const route = inputs.spec.routes.find((row) => row.route_pair_id === 'cross_g4_11');
    change(route);
    assert.throws(() => validateWorldRouteWave(inputs), /GROUP_LINE_NAME|GROUP_KIND_BASIS|SOURCE_LINE_KIND|CHORD_LINE_KIND/u);
  };
  mutate((route) => { route.segments[0].line_name = 'Проход 2'; });
  mutate((route) => { route.segments[0].line_name = ''; });
  mutate((route) => { route.segments[0].kind_basis = '  '; });
  mutate((route) => { route.segments[0].kind_basis = 'reviewed from an unknown source'; });
  mutate((route) => { route.source_line_kind = 'path'; route.segments[0].line_kind = 'path'; });
});

test('chord fallback cannot hide a reverse place-geo trace', () => {
  const inputs = structuredClone(collectInputs());
  const pair = inputs.spec.routes.find((row) => row.route_pair_id === 'cross_g4_11');
  const reverseId = pair.world_route_ids[1];
  inputs.derived.lines.find((row) => row.id === reverseId).route_trace_segments = [{ surface: 'land' }];
  assert.throws(() => validateWorldRouteWave(inputs), /CHORD_HAS_REVERSE_TRACE/u);
});

test('route candidate line names are checked together with wave-1 bindings', () => {
  const generated = validateWorldRouteWave();
  const segment = generated.datasets.spatial_v3_world_route_segments.find((row) => row.world_route_id.includes('cross_g4_11'));
  const endpoint = generated.datasets.spatial_v3_world_route_endpoint_bindings.find((row) => row.world_route_id === segment.world_route_id && row.endpoint_role === 'from');
  const inputs = structuredClone(collectInputs());
  inputs.lineDatasets.spatial_v3_canonical_g5_connection_bindings.push({
    id: 'mutation_duplicate_wave1_label', from_canonical_g5_id: endpoint.canonical_g5_id, line_name: segment.line_name,
    line_discriminator: segment.line_discriminator, line_direction_id: segment.line_direction_id,
  });
  assert.throws(() => validateWorldRouteWave(inputs), /LINE_NAME_SET_INVALID:line_label_duplicate/u);
});

test('long route segments require wave-1 recheck slices no longer than 30 minutes', () => {
  const generated = validateWorldRouteWave();
  const wetland = generated.datasets.spatial_v3_world_route_segments.filter((row) => row.world_route_id.includes('cross_g4_10'));
  assert.equal(wetland.length, 2);
  assert.deepEqual(wetland.map((row) => row.base_minutes), [741, 741]);
  assert.equal(generated.report.minutes.long_segments_over_30_minutes, 53);
  assert.equal(generated.report.minutes.recheck_slices, 475);

  for (const mutate of [
    (policy) => { policy.interval_minutes = 45; },
    (policy) => { policy.policy_kind = 'segment_once'; policy.interval_minutes = null; },
    (_policy, inputs) => { inputs.baseDatasets.spatial_v3_dynamic_recheck_policies = inputs.baseDatasets.spatial_v3_dynamic_recheck_policies
      .filter((row) => row.id !== 'recheck.wetland_15m'); },
  ]) {
    const inputs = structuredClone(collectInputs());
    const policy = inputs.baseDatasets.spatial_v3_dynamic_recheck_policies
      .find((row) => row.id === 'recheck.wetland_15m');
    mutate(policy, inputs);
    assert.throws(() => validateWorldRouteWave(inputs), /RECHECK_POLICY_INVALID|RECHECK_SLICING_REQUIRED/u);
  }
});
