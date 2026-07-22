import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ddl = await readFile('infra/world-base/schema/13.sql', 'utf8');

test('P10 DDL keeps explicit directed topology and never derives routes from legacy graph edges', () => {
  assert.match(ddl, /world_route_points/u);
  assert.match(ddl, /world_route_segments/u);
  assert.match(ddl, /world_route_endpoint_bindings/u);
  assert.match(ddl, /CHECK \(directionality = 'directed'\)/u);
  assert.match(ddl, /UNIQUE\(world_route_id,world_route_version,endpoint_role\)/u);
  assert.doesNotMatch(ddl, /INSERT\s+INTO\s+world_base\.graph_edges|UPDATE\s+world_base\.graph_edges/iu);
});

test('P10 DDL records the frozen orientation, route and boundary safeguards', () => {
  for (const expected of ['north_offset_mdeg BETWEEN 0 AND 359999', 'progress_ppm BETWEEN 0 AND 1000000', "profile_kind IN ('fixed','curved')", 'route_chain_discontinuous', 'route_cycle_or_branch', 'boundary_crossing_contract_gap', "transition_kind IN ('g1_adjacency','g0_external','jurisdiction_only','combined')", "base_minutes > 0"]) assert.match(ddl, new RegExp(expected.replaceAll('(', '\\(').replaceAll(')', '\\)'), 'u'));
});
