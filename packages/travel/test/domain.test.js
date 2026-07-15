import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@rus/kernel';
import {
  TravelError,
  advanceJourney,
  applyTravelLifecycleMetadata,
  buildTravelAdvanceResult,
  buildTravelArrivalRequest,
  buildTravelChangeSetProposal,
  calculateNextTravelBoundary,
  campJourney,
  createJourney,
  interruptJourney,
  rerouteJourney,
  resumeJourney,
  validateTravelRulesBundle,
  validateTravelAdvanceRequest,
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
  movement_method: 'on_foot',
  started_at: '1230-01-01T09:00:00Z',
  updated_at: '1230-01-01T09:00:00Z',
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

test('advance requires explicit progress and never completes a leg through a default', () => {
  assert.throws(
    () => advanceJourney({ journey: createJourney(plan, context()), context: context() }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID'
  );
});

test('empty required candidate sets hard-block journey creation', () => {
  assert.throws(() => createJourney(plan, context({ required_candidate_sets: { travel_rules: [] } })), (error) => error instanceof TravelError && error.code === 'TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY');
});

test('journey plan requires persistence-normalized travel metadata and leg timing', () => {
  assert.throws(() => createJourney({ ...plan, movement_method: null }, context()), (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID');
  assert.throws(() => createJourney({ ...plan, legs: [{ ...plan.legs[0], base_time_minutes: null }] }, context()), (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID');
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
  assert.throws(
    () => interruptJourney({ journey, interruption: { interruption_id: 'weather:1', kind: 'weather' }, context: context() }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID'
  );
  const interrupted = interruptJourney({ journey, interruption: {
    schema_version: 'travel-interruption.v1', interruption_id: 'weather:1',
    causal_source: { source_type: 'weather', source_id: 'weather:front-1' }
  }, context: context() });
  const resumed = resumeJourney({ journey: interrupted, context: context() });
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(resumed.status, 'active');
  assert.deepEqual(journey, before);
  assert.notEqual(resumed.actual_position, resumed.perceived_position);
});

test('camp pauses the existing edge-progress journey without creating a canonical location', () => {
  const journey = createJourney(plan, context());
  const camped = campJourney({
    journey,
    camp: { camp_id: 'travel-scene:1', reason: 'nightfall' },
    context: context()
  });
  assert.equal(camped.status, 'camped');
  assert.equal(camped.current_leg_id, 'leg:1');
  assert.equal(camped.actual_position.position_kind, 'edge_progress');
  assert.equal(camped.actual_position.g4_id, undefined);
  assert.equal(camped.legs[0].status, 'interrupted');
  assert.equal(resumeJourney({ journey: camped, context: context() }).status, 'active');
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

test('travel change-set proposal is version-bound and contains only normalized travel state', () => {
  const before = createJourney(plan, context());
  const after = advanceJourney({ journey: before, context: context(), progress_permille: 250 });
  const proposal = buildTravelChangeSetProposal({ before, after, idempotency_key: 'travel:advance:1' });
  assert.equal(proposal.base_state_version, 4);
  assert.equal(proposal.next_state_version, 5);
  assert.equal(proposal.position.position_kind, 'edge_progress');
  assert.deepEqual(proposal.journey_leg_ids, ['leg:1']);
  assert.equal('environment_state' in proposal, false);
  assert.throws(
    () => buildTravelChangeSetProposal({ before, after, idempotency_key: 'travel:advance:wrong', expected_state_version: 3 }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_STATE_VERSION_MISMATCH'
  );
});

test('final canonical leg produces a formal arrival request and partial travel cannot', () => {
  const before = createJourney(plan, context());
  const arrived = advanceJourney({ journey: before, context: context(), progress_permille: 1000 });
  const request = buildTravelArrivalRequest({ before, after: arrived });
  assert.deepEqual(request, {
    schema_version: 'travel-arrival-request.v1',
    party_id: 'party:1',
    actor_id: 'actor:1',
    journey_id: 'journey:1',
    from_g4_id: 'g4:start',
    to_g4_id: 'g4:target',
    destination_position: {
      position_kind: 'node', g4_id: 'g4:target', g5_node_id: null, g5_anchor_id: null, last_route_id: 'route-profile:1'
    },
    world_revision_id: 'world:1',
    travel_rules_digest: rules.catalog_digest,
    environment_catalog_digest: 'b'.repeat(64),
    algorithm_version: 'travel.v1',
    rng_version: 'mulberry32_v1'
  });
  const partial = advanceJourney({ journey: before, context: context(), progress_permille: 500 });
  assert.throws(
    () => buildTravelArrivalRequest({ before, after: partial }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID'
  );
});

test('advance request and result bind the selected boundary to one journey leg and state version', () => {
  const before = createJourney(plan, context());
  const request = {
    schema_version: 'travel-advance-request.v1',
    journey_id: 'journey:1',
    journey_leg_id: 'leg:1',
    expected_state_version: 4,
    progress_permille: 500,
    duration_minutes: 30,
    updated_at: '1230-01-01T09:30:00Z',
    idempotency_key: 'advance:1',
    boundary: { boundary_id: 'boundary:leg', boundary_type: 'leg_completion', at_elapsed_minutes: 30, priority: 0 }
  };
  assert.equal(validateTravelAdvanceRequest(request).journey_leg_id, 'leg:1');
  const after = advanceJourney({ journey: before, context: context(), progress_permille: 500 });
  const result = buildTravelAdvanceResult({ before, after, request });
  assert.equal(result.schema_version, 'travel-advance-result.v1');
  assert.equal(result.clock_advance_request.duration_minutes, 30);
  assert.equal(result.arrival_request, null);
  assert.throws(
    () => buildTravelAdvanceResult({ before, after, request: { ...request, expected_state_version: 3 } }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_STATE_VERSION_MISMATCH'
  );
  assert.throws(
    () => validateTravelAdvanceRequest({ ...request, boundary: { ...request.boundary, at_elapsed_minutes: 29 } }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID'
  );
});

test('lifecycle metadata advances elapsed time and timestamps completed and next legs from explicit clock input', () => {
  const twoLegPlan = { ...plan, legs: [plan.legs[0], { ...plan.legs[0], leg_id: 'leg:2', sequence: 2, edge_id: 'edge:2', from_g4_id: 'g4:target', to_g4_id: 'g4:end' }] };
  const before = createJourney(twoLegPlan, context({ known_edge_ids: ['edge:1', 'edge:2'] }));
  const after = advanceJourney({ journey: before, context: context({ known_edge_ids: ['edge:1', 'edge:2'] }), progress_permille: 1000 });
  const persisted = applyTravelLifecycleMetadata({ before, after, elapsed_minutes: 60, updated_at: '1230-01-01T10:00:00Z' });
  assert.equal(persisted.elapsed_minutes, 60);
  assert.equal(persisted.legs[0].completed_at, '1230-01-01T10:00:00Z');
  assert.equal(persisted.legs[1].started_at, '1230-01-01T10:00:00Z');
});

test('reroute supersedes only unstarted legs from an explicit pinned replacement plan', () => {
  const journey = createJourney(plan, context());
  const replacement = { ...plan, legs: [{ ...plan.legs[0], leg_id: 'leg:replacement', edge_id: 'edge:replacement', to_g4_id: 'g4:alternate' }], target_ref: { kind: 'g4', id: 'g4:alternate' }, idempotency_key: 'reroute:1', updated_at: '1230-01-01T09:05:00Z' };
  const rerouted = rerouteJourney({ journey, plan: replacement, context: context({ known_edge_ids: ['edge:1', 'edge:replacement'] }) });
  assert.equal(rerouted.current_leg_id, 'leg:replacement');
  assert.equal(rerouted.legs.find((leg) => leg.leg_id === 'leg:1').status, 'superseded');
  assert.equal(rerouted.actual_position.edge_id, 'edge:replacement');
  assert.throws(() => rerouteJourney({ journey: advanceJourney({ journey, context: context(), progress_permille: 1 }), plan: replacement, context: context({ known_edge_ids: ['edge:1', 'edge:replacement'] }) }), (error) => error instanceof TravelError && error.code === 'TRAVEL_INPUT_INVALID');
});

test('next travel boundary selects only the earliest explicit candidate deterministically', () => {
  const input = {
    journey_id: 'journey:1',
    current_leg_id: 'leg:1',
    candidates: [
      { boundary_id: 'sunset:1', boundary_type: 'sunset', at_elapsed_minutes: 50, priority: 2 },
      { boundary_id: 'weather:1', boundary_type: 'weather_transition', at_elapsed_minutes: 20, priority: 5 },
      { boundary_id: 'timer:1', boundary_type: 'due_timer', at_elapsed_minutes: 20, priority: 1 }
    ]
  };
  assert.deepEqual(calculateNextTravelBoundary(input), {
    boundary_id: 'timer:1', boundary_type: 'due_timer', at_elapsed_minutes: 20, priority: 1
  });
  assert.throws(
    () => calculateNextTravelBoundary({ ...input, candidates: [] }),
    (error) => error instanceof TravelError && error.code === 'TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY'
  );
});
