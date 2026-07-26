import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CANDIDATE_ROOT,
  compileLowerDvinaBoundaryV1
} from '../../tools/spatial-v3/lower-dvina-boundary-v1-compiler.mjs';
import {
  applyLowerDvinaBoundaryFailure,
  resolveLowerDvinaBoundaryCheck,
  resolveLowerDvinaBoundaryContext,
  selectLowerDvinaBoundaryContext
} from '../../packages/turn/src/lower-dvina-boundary-policy.js';

const root = process.cwd();
const dataset = async (name) => JSON.parse(await readFile(
  `${root}/${CANDIDATE_ROOT}/datasets/${name}.json`
));

test('approved package compiles two independent continuous routes with four segments', async () => {
  await compileLowerDvinaBoundaryV1({ root, exactHead: process.env.GITHUB_SHA
    ?? '0a196b3293cc8c87ea52ec55b7bc493b21b03d19' });
  const routes = (await dataset('spatial_v3_world_routes'))
    .filter(({ id }) => id.startsWith('wrv3__lower_dvina_'));
  const points = (await dataset('spatial_v3_world_route_points'))
    .filter(({ id }) => id.startsWith('wrpointv3__lower_dvina_'));
  const segments = (await dataset('spatial_v3_world_route_segments'))
    .filter(({ id }) => id.startsWith('wrsegv3__lower_dvina_'));
  assert.equal(routes.length, 2);
  assert.equal(points.length, 6);
  assert.equal(segments.length, 4);
  for (const route of routes) {
    const routeSegments = segments
      .filter(({ world_route_id: id }) => id === route.id)
      .sort((left, right) => left.ordinal - right.ordinal);
    assert.equal(routeSegments.length, 2);
    assert.equal(routeSegments[0].to_point_id, routeSegments[1].from_point_id);
    assert.equal(route.reverse_route_version, 1);
  }
  assert.deepEqual(
    segments.map(({ base_minutes: minutes }) => minutes),
    [10, 30, 20, 10]
  );
});

test('endpoint and policy references resolve exactly without geometry or fallback', async () => {
  const bindings = (await dataset('spatial_v3_world_route_endpoint_bindings'))
    .filter(({ id }) => id.startsWith('wrebv3__lower_dvina_'));
  const segments = (await dataset('spatial_v3_world_route_segments'))
    .filter(({ id }) => id.startsWith('wrsegv3__lower_dvina_'));
  const environments = new Set((await dataset(
    'spatial_v3_transition_environment_profiles'
  )).map(({ id, version }) => `${id}@${version}`));
  const costs = new Set((await dataset(
    'spatial_v3_movement_method_cost_profiles'
  )).map(({ id, version }) => `${id}@${version}`));
  const risks = new Set((await dataset(
    'spatial_v3_traversal_risk_profiles'
  )).map(({ id, version }) => `${id}@${version}`));
  const availability = new Set((await dataset(
    'spatial_v3_traversal_availability_policies'
  )).map(({ id, version }) => `${id}@${version}`));
  assert.equal(bindings.length, 4);
  assert.deepEqual(new Set(bindings.map(({ scene_endpoint_slot_key: key }) => key)),
    new Set(['arrival', 'departure']));
  for (const segment of segments) {
    assert.ok(environments.has(
      `${segment.transition_environment_profile_id}@${segment.transition_environment_profile_version}`
    ));
    assert.ok(costs.has(
      `${segment.movement_method_cost_profile_id}@${segment.movement_method_cost_profile_version}`
    ));
    assert.ok(risks.has(`${segment.risk_profile_id}@${segment.risk_profile_version}`));
    assert.ok(availability.has(
      `${segment.availability_condition_set_id}@${segment.availability_condition_set_version}`
    ));
  }
  const approval = JSON.parse(await readFile(
    `${root}/${CANDIDATE_ROOT}/source/approval-decision.v1.json`
  ));
  assert.equal(approval.decision, 'APPROVE_LOWER_DVINA_BOUNDARY_AUTHORING_V1');
  assert.equal(
    approval.candidate_content_digest,
    'cde64b5e6317cd580a16b9178e7291c326a9c2c478811c31851eb7e45e5e8f4b'
  );
  const packageRecord = JSON.parse(await readFile(
    `${root}/${CANDIDATE_ROOT}/source/approved-authoring-package.v1.json`
  ));
  assert.equal(packageRecord.geometry_claim, 'topological_only');
  assert.equal(packageRecord.fallback, 'forbidden');
  assert.equal(JSON.stringify(packageRecord).includes('exact_distance'), false);
});

test('normal conditions do not roll; approved adverse domains resolve DC 10/12', () => {
  assert.deepEqual(resolveLowerDvinaBoundaryCheck({ adverseFactors: [] }), {
    ok: true,
    check: null
  });
  assert.equal(resolveLowerDvinaBoundaryCheck({
    adverseFactors: ['moderate_supported_wind']
  }).check.target, 10);
  assert.equal(resolveLowerDvinaBoundaryCheck({
    adverseFactors: ['moderate_supported_wind', 'moderate_cross_current']
  }).check.target, 12);
  assert.equal(resolveLowerDvinaBoundaryCheck({
    adverseFactors: ['reduced_but_navigable_visibility']
  }).check.policy_id, 'check.lower_dvina_orientation_v1');
});

test('unsupported factor count or mixed check domains fail closed', () => {
  assert.deepEqual(resolveLowerDvinaBoundaryCheck({
    adverseFactors: [
      'moderate_supported_wind',
      'moderate_cross_current',
      'craft_control_degraded'
    ]
  }), {
    ok: false,
    code: 'boundary_check_factor_set_unsupported'
  });
  assert.deepEqual(resolveLowerDvinaBoundaryCheck({
    adverseFactors: [
      'moderate_supported_wind',
      'reduced_but_navigable_visibility'
    ]
  }), {
    ok: false,
    code: 'boundary_check_domains_ambiguous'
  });
});

test('availability resolver accepts only the exact approved typed context', () => {
  const snapshot = approvedBoundaryCondition();
  const resolved = resolveLowerDvinaBoundaryContext(snapshot);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.check, null);
  assert.equal(resolveLowerDvinaBoundaryContext({
    ...snapshot,
    daylight_state: 'dark'
  }).code, 'boundary_daylight_required');
  assert.deepEqual(resolveLowerDvinaBoundaryContext({
    ...snapshot,
    wind_band: 'unknown'
  }), {
    ok: false,
    code: 'boundary_availability_value_unsupported',
    dimension: 'wind_band'
  });
  assert.equal(selectLowerDvinaBoundaryContext([
    { effective_after_minutes: 15, snapshot }
  ], 0).code, 'boundary_condition_snapshot_missing');
});

test('boundary failure is zero-time before progress and progress-preserving after it', () => {
  assert.deepEqual(applyLowerDvinaBoundaryFailure({
    progressPpm: 0,
    elapsedMinutes: 0,
    unresolvedFailureCount: 0
  }), {
    state: 'blocked_before_progress',
    progressPpm: 0,
    elapsedMinutes: 0,
    energyDelta: 0,
    conditionCandidate: null
  });
  assert.deepEqual(applyLowerDvinaBoundaryFailure({
    progressPpm: 500_000,
    elapsedMinutes: 15,
    unresolvedFailureCount: 0
  }), {
    state: 'paused_in_transit',
    progressPpm: 500_000,
    elapsedMinutes: 20,
    energyDelta: -2,
    conditionCandidate: 'wet'
  });
  const stranded = applyLowerDvinaBoundaryFailure({
    progressPpm: 500_000,
    elapsedMinutes: 20,
    unresolvedFailureCount: 1
  });
  assert.equal(stranded.state, 'stranded_in_transit');
  assert.equal(stranded.craftDestroyed, undefined);
  assert.equal(stranded.fatal, undefined);
  assert.equal(stranded.inventoryWipe, undefined);
});

function approvedBoundaryCondition() {
  return {
    availability_policy_ref: {
      entity_kind: 'traversal_availability_policy',
      entity_id: 'availability.lower_dvina_late_summer_daylight_v1',
      version: 1
    },
    season_mode: 'late_summer_open_water',
    daylight_state: 'daylight',
    water_surface_state: 'open_water',
    wind_band: 'calm',
    visibility_band: 'clear',
    craft_state: 'serviceable',
    load_state: 'within_approved_capacity',
    controller_state: 'approved_boatman_in_control',
    current_band: 'calm',
    craft_control_state: 'stable',
    landmark_confidence: 'sufficient'
  };
}
