import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@rus/kernel';
import {
  TravelError,
  advanceJourney,
  createJourney,
  interruptJourney,
  resumeJourney,
  validateTravelRulesBundle,
  validateJourney,
  validateTravelPosition
} from '../src/index.js';

const position = Object.freeze({
  position_kind: 'node',
  g4_id: 'g4:start',
  g5_node_id: null,
  g5_anchor_id: null,
  last_route_id: null
});

function travelRulesBundle(overrides = {}) {
  const bundle = {
    schema_version: 'travel-rules.v1',
    world_revision_id: 'world:1',
    region_id: 'region:1',
    historical_period_id: 'period:1',
    source_refs: ['source:1'],
    records: { pace_profiles: [{ profile_id: 'pace:normal' }], route_profiles: [{ profile_id: 'route-profile:1' }] },
    bindings: { route_profile_bindings: [{ binding_id: 'binding:1' }] },
    readiness_report: { pass: true },
    ...overrides
  };
  const { catalog_digest: ignored, ...digestPayload } = bundle;
  return Object.freeze({ ...bundle, catalog_digest: overrides.catalog_digest ?? sha256(digestPayload) });
}

const rules = travelRulesBundle();

const plan = Object.freeze({
  journey_id: 'journey:1',
  party_id: 'party:1',
  actor_id: 'actor:1',
  mode: 'route',
  route_id: 'route:1',
  origin_position: position,
  target_ref: { kind: 'g4', id: 'g4:target' },
  pace_profile_id: 'pace:normal',
  legs: [{
    leg_id: 'leg:1', sequence: 1, edge_id: 'edge:1', from_g4_id: 'g4:start', to_g4_id: 'g4:target',
    route_profile_id: 'route-profile:1', base_gu: 1, base_time_minutes: 60
  }],
  world_revision_id: 'world:1',
  region_id: 'region:1',
  historical_period_id: 'period:1',
  travel_rules_digest: rules.catalog_digest,
  environment_catalog_digest: 'b'.repeat(64),
  algorithm_version: 'travel.v1',
  rng_version: 'mulberry32_v1',
  state_version: 4,
  idempotency_key: 'intent:1'
});

function context(overrides = {}) {
  return Object.freeze({
    state_version: 4,
    known_edge_ids: ['edge:1'],
    travel_rules_bundle: rules,
    required_candidate_sets: { travel_rules: [{ option_id: 'rule:1' }] },
    ...overrides
  });
}

test('position union rejects mixed node and edge-progress fields', () => {
  assert.throws(() => validateTravelPosition({ ...position, edge_id: 'edge:1', progress_permille: 1 }), TravelError);
});

test('journey invariants reject an active journey without a current leg and a completed partial leg', () => {
  assert.throws(() => validateJourney({ ...createJourney(plan, context()), current_leg_id: null }), TravelError);
  assert.throws(() => validateJourney({ ...createJourney(plan, context()), legs: [{ ...createJourney(plan, context()).legs[0], status: 'completed', progress_permille: 999 }] }), TravelError);
});

test('a journey cannot advance after arrival and detects stale context', () => {
  const arrived = { ...createJourney(plan, context()), status: 'arrived', current_leg_id: null };
  assert.throws(() => advanceJourney({ journey: arrived, context: context() }), TravelError);
  assert.throws(() => advanceJourney({ journey: createJourney(plan, context()), context: context({ state_version: 3 }) }), TravelError);
});

test('empty required candidate sets hard-block journey creation', () => {
  assert.throws(() => createJourney(plan, context({ required_candidate_sets: { travel_rules: [] } })), (error) => error instanceof TravelError && error.code === 'TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY');
});

test('travel rules bundle hard-blocks missing, stale or unready approved data', () => {
  assert.throws(() => createJourney(plan, context({ travel_rules_bundle: null })), (error) => error instanceof TravelError && error.code === 'TRAVEL_RULE_BUNDLE_MISSING');
  assert.throws(() => createJourney(plan, context({ travel_rules_bundle: travelRulesBundle({ readiness_report: { pass: false } }) })), (error) => error instanceof TravelError && error.code === 'TRAVEL_DATA_GAP');
  assert.equal(validateTravelRulesBundle({ bundle: rules, world_revision_id: 'world:1', region_id: 'region:1', historical_period_id: 'period:1', catalog_digest: rules.catalog_digest }).pass, true);
  assert.equal(validateTravelRulesBundle({ bundle: rules, world_revision_id: 'world:1', region_id: 'region:wrong', historical_period_id: 'period:1', catalog_digest: rules.catalog_digest }).errors[0].code, 'TRAVEL_DATA_GAP');
});

test('a second active journey for the same actor hard-blocks creation', () => {
  assert.throws(() => createJourney(plan, context({ active_journeys: [{ journey_id: 'journey:existing', actor_id: 'actor:1', status: 'active' }] })), (error) => error instanceof TravelError && error.code === 'TRAVEL_ACTIVE_JOURNEY_CONFLICT');
});

test('interruption and resume preserve actual and perceived navigation state without input mutation', () => {
  const journey = createJourney(plan, context());
  const before = structuredClone(journey);
  const interrupted = interruptJourney({ journey, interruption: { interruption_id: 'weather:1', kind: 'weather' }, context: context() });
  const resumed = resumeJourney({ journey: interrupted, context: context() });
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(resumed.status, 'active');
  assert.deepEqual(journey, before);
  assert.notEqual(resumed.actual_position, resumed.perceived_position);
});

test('partial advance accepts an explicit perceived position without exposing or inventing a route', () => {
  const journey = createJourney(plan, context());
  const perceivedPosition = {
    position_kind: 'edge_progress', journey_id: 'journey:1', journey_leg_id: 'leg:1', edge_id: 'edge:1',
    from_g4_id: 'g4:start', to_g4_id: 'g4:target', progress_permille: 100, last_confirmed_g4_id: 'g4:start',
    g5_node_id: null, g5_anchor_id: null
  };
  const advanced = advanceJourney({ journey, context: context(), progress_permille: 250, perceived_position: perceivedPosition });
  assert.equal(advanced.actual_position.progress_permille, 250);
  assert.equal(advanced.perceived_position.progress_permille, 100);
  assert.throws(() => advanceJourney({ journey, context: context(), progress_permille: 250, perceived_position: { ...perceivedPosition, edge_id: 'edge:invented' } }), (error) => error instanceof TravelError && error.code === 'TRAVEL_POSITION_INVALID');
});

test('journey creation is deterministic for an identical formal input', () => {
  assert.deepEqual(createJourney(plan, context()), createJourney(plan, context()));
});
