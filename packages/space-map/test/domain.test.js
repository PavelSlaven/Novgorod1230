import test from 'node:test';
import assert from 'node:assert/strict';
import { createV2SpatialFixtureAdapter } from '../src/spatial-v2-compat.js';

test('space-map validates hierarchy and indexes graph without route semantics', () => {
  const { buildGraphIndex, normalizePosition, resolveAdjacentEdges, validateGraphEdge, validatePositionChain } = createV2SpatialFixtureAdapter({ mode: 'shadow_fixture' });
  const position = normalizePosition({ region_id:'r', place_id:'p', location_id:'l' });
  assert.equal(validatePositionChain(position).ok, true);
  assert.equal(validatePositionChain({ region_id:'r', location_id:'l' }).ok, false);
  const nodes = [{ id:'a' }, { id:'b' }];
  const edge = { id:'e', from_node_id:'a', to_node_id:'b', scale_level:'G4', edge_type:'door' };
  assert.equal(validateGraphEdge(edge, new Set(['a','b'])).ok, true);
  const index = buildGraphIndex(nodes, [edge]);
  assert.equal(resolveAdjacentEdges(index, 'a')[0].id, 'e');
});
