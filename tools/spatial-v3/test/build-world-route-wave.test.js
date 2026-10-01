import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateWorldRouteWave } from '../build-world-route-wave.mjs';

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
