import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@rus/kernel';
import { createJourney } from '@rus/travel';
import { createTravelTurnCommandDefinitions } from '../src/index.js';

test('travel.reroute accepts only a replacement plan at the current edge boundary', () => {
  const bundlePayload = { schema_version: 'travel-rules.v1', world_revision_id: 'world:1', region_id: 'region:1', historical_period_id: 'period:1', source_refs: ['source:1'], records: { pace_profiles: [{}] }, bindings: { route_profile_bindings: [{}] }, readiness_report: { pass: true } };
  const rules = { ...bundlePayload, catalog_digest: sha256(bundlePayload) };
  const plan = { journey_id: 'journey:reroute', party_id: 'party:1', actor_id: 'actor:1', mode: 'route', route_id: 'route:1', origin_position: { position_kind: 'node', g4_id: 'g4:a', g5_node_id: null, g5_anchor_id: null, last_route_id: null }, target_ref: { kind: 'g4', id: 'g4:b' }, pace_profile_id: 'pace:1', movement_method: 'on_foot', started_at: '1230-01-01T09:00:00Z', updated_at: '1230-01-01T09:00:00Z', legs: [{ leg_id: 'leg:1', sequence: 1, edge_id: 'edge:1', from_g4_id: 'g4:a', to_g4_id: 'g4:b', route_profile_id: 'route:1', base_time_minutes: 60 }], world_revision_id: 'world:1', region_id: 'region:1', historical_period_id: 'period:1', travel_rules_digest: rules.catalog_digest, environment_catalog_digest: 'e'.repeat(64), algorithm_version: 'travel.v1', rng_version: 'rng:1', state_version: 4, idempotency_key: 'start:1' };
  const context = { state_version: 4, known_edge_ids: ['edge:1', 'edge:alternate'], travel_rules_bundle: rules, required_candidate_sets: { rules: [{}] } };
  const journey = createJourney(plan, context);
  const replacement = { ...plan, target_ref: { kind: 'g4', id: 'g4:alternate' }, updated_at: '1230-01-01T09:05:00Z', idempotency_key: 'reroute:1', legs: [{ ...plan.legs[0], leg_id: 'leg:alternate', edge_id: 'edge:alternate', to_g4_id: 'g4:alternate' }] };
  const handler = createTravelTurnCommandDefinitions().find((definition) => definition.command_id === 'travel.reroute');
  const consequence = handler.consequence({ retrievedState: { party_state: { state_version: 4 }, active_journey: journey, travel_context: context, travel_reroute_request: { journey_plan: replacement, duration_minutes: 0, updated_at: '1230-01-01T09:05:00Z', visible_seed: {}, suggested_actions: [], idempotency_key: 'reroute:1' } } });
  assert.equal(consequence.hidden_update.travel_change_set_proposal.journey.current_leg_id, 'leg:alternate');
});
