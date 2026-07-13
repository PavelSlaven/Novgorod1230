import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRouteAvailability, buildTraversalRequest, calculateTravelTime, validateTraversalResult } from '../src/index.js';

test('movement-routes calculates GU time and explicit blockers', () => {
  const route = { id:'r1', from_node_id:'a', to_node_id:'b', base_gu:2, requires_boat:true, orientation_difficulty:'ordinary' };
  assert.equal(calculateTravelTime(route, { items:{ load_category:'heavy' } }, { poor:true }).final_time_minutes, 270);
  assert.deepEqual(assessRouteAvailability(route, {}).blockers, ['boat_required']);
  const request = buildTraversalRequest(route, { id:'p1' }, { has_boat:true, knowledge_level:'knows_exact' });
  assert.equal(request.availability.available, true);
  assert.equal(validateTraversalResult({ route_id:'r1', status:'completed', position_node_id:'b', elapsed_minutes:120 }, request).ok, true);
});
