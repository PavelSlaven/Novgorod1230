import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContainmentIndex,
  buildG1GridIndex,
  buildSpatialTopologyIndex,
  createFactualSpatialContextSnapshot,
  interpolateOrientationProfile,
  normalizeAzimuthMdeg,
  transformLocalAzimuthToWorld,
  validateContainmentRecords,
  validateSpatialClassification,
  validateSpatialRef
} from '@rus/space-map';
import { adaptV2PositionForSpatialV3Fixture } from '@rus/space-map/spatial-v2-compat';

test('P17 validates closed spatial refs and direct containment without invented levels', () => {
  assert.deepEqual(validateSpatialRef({ spatial_kind: 'canonical_g4', spatial_id: 'g4' }).errors, []);
  assert.equal(validateSpatialRef({ spatial_kind: 'canonical_g7', spatial_id: 'g7' }).ok, false);

  const records = [
    { id: 'g0', kind: 'canonical_g0' },
    { id: 'g1', kind: 'canonical_g1', parent_id: 'g0', grid_x: 0, grid_y: 0, grid_convention_id: 'grid-v1' },
    { id: 'g2', kind: 'canonical_g2', parent_id: 'g1' },
    { id: 'g3', kind: 'canonical_g3', parent_id: 'g2' },
    { id: 'g4', kind: 'canonical_g4', parent_id: 'g3' },
    { id: 'g5', kind: 'canonical_g5', parent_id: 'g4' },
    { id: 'site', kind: 'party_g5_site', parent_id: 'g5' },
    { id: 'g6', kind: 'party_g6', host_kind: 'g5_site', host_id: 'site' },
    { id: 'position', kind: 'scene_position', parent_id: 'g6' }
  ];
  assert.equal(validateContainmentRecords(records).ok, true);
  assert.equal(validateContainmentRecords([{ id: 'a', kind: 'canonical_g4', parent_id: 'b' }, { id: 'b', kind: 'canonical_g4', parent_id: 'a' }]).ok, false);
  assert.equal(validateContainmentRecords([{ id: 'g4', kind: 'canonical_g4', parent_id: 'missing' }]).ok, false);
  assert.equal(validateContainmentRecords([{ id: 'g6', kind: 'party_g6', host_kind: 'g5_site', host_id: 'missing' }]).ok, false);
  assert.deepEqual(buildContainmentIndex(records).ancestorIds('position'), ['g6', 'site', 'g5', 'g4', 'g3', 'g2', 'g1', 'g0']);
  assert.equal(buildG1GridIndex([records[1]]).ok, true);
  assert.equal(validateSpatialClassification({ spatial_kind: 'canonical_g4', spatial_class_id: 'spatial.g4.sector', facets: [{ dimension_id: 'access', value_id: 'controlled.access.public' }] }).ok, true);
  assert.equal(validateSpatialClassification({ spatial_kind: 'canonical_g4', spatial_class_id: 'spatial.g5.parcel' }).ok, false);
});

test('P17 keeps physical, visual and acoustic topology distinct and typed', () => {
  const topology = buildSpatialTopologyIndex({
    endpoint_inventory: {
      scene_positions: [{ id: 'p1', kind: 'scene_position' }, { id: 'p2', kind: 'scene_position' }],
      sites: [{ id: 's1', kind: 'party_g5_site' }, { id: 's2', kind: 'party_g5_site' }],
      route_points: [{ id: 'r1', kind: 'world_route_point' }, { id: 'r2', kind: 'world_route_point' }],
      g6: [{ id: 'g6a', kind: 'party_g6' }, { id: 'g6b', kind: 'party_g6' }]
    },
    scene_edges: [{ id: 'walk', from_position_id: 'p1', to_position_id: 'p2' }],
    site_connections: [{ id: 'gate', from_site_id: 's1', to_site_id: 's2', parent_g4_id: 'g4' }],
    route_segments: [{ id: 'road', from_route_point_id: 'r1', to_route_point_id: 'r2' }],
    visibility_links: [{ id: 'sight', from_position_id: 'p1', to_position_id: 'p2' }],
    acoustic_edges: [{ id: 'sound', from_g6_id: 'g6a', to_g6_id: 'g6b' }]
  });
  assert.equal(topology.ok, true);
  assert.deepEqual(topology.outgoingSceneEdges('p1').map(({ id }) => id), ['walk']);
  assert.deepEqual(topology.outgoingVisibilityLinks('p1').map(({ id }) => id), ['sight']);
  assert.equal(buildSpatialTopologyIndex({ visibility_links: [{ id: 'bad', from_position_id: 'p', to_position_id: 'p' }], endpoint_inventory: { scene_positions: [{ id: 'p', kind: 'party_g5_site' }] } }).ok, false);
  assert.equal(buildSpatialTopologyIndex({ scene_edges: [{ id: 'dangling', from_position_id: 'p1', to_position_id: 'unknown' }], endpoint_inventory: { scene_positions: [{ id: 'p1', kind: 'scene_position' }] } }).ok, false);
});

test('P17 orientation is integer-millidegree, wraps and interpolates explicit arcs', () => {
  assert.equal(normalizeAzimuthMdeg(-1), 359999);
  assert.equal(transformLocalAzimuthToWorld(359000, 2000), 1000);
  const profile = {
    profile_kind: 'curved',
    points: [
      { progress_ppm: 0, local_azimuth_mdeg: 350000, interpolation_to_next: 'clockwise_arc' },
      { progress_ppm: 1_000_000, local_azimuth_mdeg: 10000 }
    ]
  };
  assert.equal(interpolateOrientationProfile(profile, 500000), 0);
  assert.throws(() => interpolateOrientationProfile({ profile_kind: 'curved', points: [{ progress_ppm: 0, local_azimuth_mdeg: 0 }, { progress_ppm: 1_000_000, local_azimuth_mdeg: 1 }] }, 2), /interpolation/);
});

test('P17 creates factual snapshots from supplied facts only and exposes v2 adapter explicitly', () => {
  const snapshot = createFactualSpatialContextSnapshot({
    context_ref: { entity_kind: 'world_route_segment', entity_id: 'segment' },
    dependency_pins: [], g0_id: 'g0', g1_id: 'g1', weather_scope_id: 'weather'
  });
  assert.match(snapshot.canonical_digest, /^sha256:/);
  assert.equal(snapshot.g4_id, null);
  assert.throws(() => adaptV2PositionForSpatialV3Fixture({ region_id: 'r' }, { mode: 'production' }), /migration or shadow fixture/);
  assert.deepEqual(
    adaptV2PositionForSpatialV3Fixture({ location_id: 'legacy-place' }, { mode: 'migration', mappings: { 'legacy-place': { spatial_kind: 'canonical_g5', spatial_id: 'g5' } } }),
    { spatial_kind: 'canonical_g5', spatial_id: 'g5' }
  );
});
