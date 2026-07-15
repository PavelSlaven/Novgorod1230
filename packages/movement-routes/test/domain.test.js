import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRouteAvailability,
  buildTraversalRequest,
  calculatePartialTraversal,
  calculateTravelTime,
  validateRouteTraversalInput,
  validateTraversalResult
} from '../src/index.js';

const profile = Object.freeze({
  profile_id: 'route-profile:1',
  condition_multipliers: { normal: 1, poor: 1.5, bad: 2, severe: 3 },
  load_multipliers: { light: 1, moderate: 1.25, heavy: 1.5, overloaded: 2 },
  pace_multipliers: { cautious: 1.25, normal: 1, forced: 0.75 }
});

const route = Object.freeze({
  id: 'r1', from_node_id: 'a', to_node_id: 'b', scale: 'regional', base_gu: 2,
  route_profile_id: 'route-profile:1', requires_transport_category: 'boat'
});

const actor = Object.freeze({ id: 'p1', load_category: 'heavy' });
const context = Object.freeze({
  knowledge_level: 'knows_exact',
  condition_key: 'poor',
  route_profile: profile,
  pace: 'normal',
  transport_instance_refs: [{ transport_instance_id: 'boat:1', category_id: 'boat', condition: 'sound', current_position: { node_id: 'a' }, route_compatible: true }]
});

test('movement-routes calculates only from explicit approved profile data and concrete transport', () => {
  assert.equal(calculateTravelTime(route, actor, context).final_time_minutes, 270);
  assert.deepEqual(assessRouteAvailability(route, context).blockers, []);
  const request = buildTraversalRequest(route, actor, context);
  assert.equal(request.availability.available, true);
  assert.equal(validateTraversalResult({ route_id:'r1', status:'completed', position_node_id:'b', elapsed_minutes:120 }, request).ok, true);
});

test('missing scale, base time and load category hard-block instead of selecting defaults', () => {
  assert.throws(() => calculateTravelTime({ ...route, scale: null }, actor, context), { code: 'ROUTE_SCALE_REQUIRED' });
  assert.throws(() => calculateTravelTime({ ...route, base_gu: null, base_time_minutes: null }, actor, context), { code: 'ROUTE_BASE_TIME_REQUIRED' });
  assert.throws(() => calculateTravelTime(route, { id: 'p1' }, context), { code: 'ROUTE_LOAD_CATEGORY_REQUIRED' });
});

test('unknown profile condition, boolean transport and missing profile binding are rejected', () => {
  assert.throws(() => validateRouteTraversalInput(route, actor, { ...context, condition_key: 'fog' }), { code: 'ROUTE_CONDITION_PROFILE_INVALID' });
  assert.throws(() => assessRouteAvailability(route, { ...context, transport_instance_refs: [], has_boat: true }), { code: 'ROUTE_TRANSPORT_INSTANCE_REQUIRED' });
  assert.throws(() => buildTraversalRequest({ ...route, route_profile_id: null }, actor, context), { code: 'ROUTE_PROFILE_BINDING_REQUIRED' });
});

test('partial traversal remains on the canonical edge and closed or seasonal routes block', () => {
  const partial = calculatePartialTraversal({ route, elapsed_minutes: 90, total_minutes: 270 });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.progress_permille, 333);
  assert.deepEqual(assessRouteAvailability({ ...route, closed: true }, context).blockers, ['route_closed']);
  assert.deepEqual(assessRouteAvailability({ ...route, seasonally_blocked: true }, context).blockers, ['seasonally_blocked']);
});
