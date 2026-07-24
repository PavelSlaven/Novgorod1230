import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3ExecutionEngine } from '../src/spatial-v3-execution.js';
import {
  createTemporalCarrierProposalEngine,
  selectCarrierClockCommitMode
} from '../src/temporal-carriers.js';

const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (payload) => Object.freeze({ ...payload, canonical_digest: digest(payload) });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id, authoring_version = 'v1') => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version
});
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const timestamp = (whole_minutes = '0', subminute_numerator = '0', subminute_denominator = '1') => ({
  whole_minutes,
  subminute_numerator,
  subminute_denominator
});
const profileRef = vr('activity_profile', 'profile-1');
const progressPolicyRef = vr('action_contract', 'progress-1');
const resourcePolicyRef = vr('action_contract', 'resource-1');
const dependencyPin = (dependency_role, value) => ({
  dependency_role,
  entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version }
});
const pins = () => seal({
  pins: [
    dependencyPin('activity_contract', profileRef),
    dependencyPin('activity_contract', progressPolicyRef),
    dependencyPin('activity_contract', resourcePolicyRef)
  ]
});
const capacitySnapshot = (carriers = [{
  carrier_kind: 'transport',
  carrier_id: 'cart-1',
  capacity: 2,
  state_version: 3
}]) => seal({ carriers });
const actorLocation = (actor_id = 'actor-1', scene_position_id = 'node-1', state_version = 1, change_set_id = 'change-0') => ({
  party_id: 'party-1',
  owner_kind: 'actor',
  owner_id: actor_id,
  location: { location_kind: 'scene', scene_position_id },
  last_confirmed_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: scene_position_id },
  state_version,
  updated_change_set_id: change_set_id
});
const attachment = (overrides = {}) => ({
  id: 'attachment-1',
  party_id: 'party-1',
  subject_kind: 'actor',
  subject_id: 'actor-1',
  carrier_kind: 'transport',
  carrier_id: 'cart-1',
  formation_slot_id: null,
  status: 'active',
  state_version: 1,
  created_change_set_id: 'change-1',
  released_change_set_id: null,
  ...overrides
});
const position = (overrides = {}) => ({
  party_id: 'party-1',
  actor_id: 'actor-1',
  root_carrier_ref: ref('transport', 'cart-1'),
  local_position_node_id: 'node-1',
  attachment_dependency_pins: pins(),
  state_version: 1,
  updated_change_set_id: 'change-1',
  ...overrides
});
const state = (overrides = {}) => seal({
  party_id: 'party-1',
  dependency_pins: pins(),
  attachments: [],
  positions: [],
  journey_locations: [actorLocation()],
  cohort_memberships: [],
  carrier_capacity_snapshot: capacitySnapshot(),
  idempotency_records: [],
  approved_anchor_refs: [{ endpoint_kind: 'scene_position', endpoint_id: 'node-1' }],
  ...overrides
});
const limits = {
  max_depth: 2,
  max_attachments: 16,
  max_capacity: 16,
  max_idempotency_records: 128
};
const engine = (resolver) => createTemporalCarrierProposalEngine({
  resolveSynchronizedSlice: resolver,
  limits
});

function expectedVersionsDigest(payload) {
  return digest({
    expected_state_digest: payload.expected_state_digest,
    expected_state_versions: payload.expected_state_versions ?? null
  });
}

function withIdempotencyRecord(payload, {
  key = 'carrier-key-1',
  recordId = 'record-1'
} = {}) {
  return {
    ...payload,
    idempotency_record: {
      id: recordId,
      party_id: 'party-1',
      operation_kind: 'temporal_carrier',
      idempotency_key: key,
      parent_idempotency_key: null,
      canonical_input_digest: digest(payload),
      expected_state_versions_digest: expectedVersionsDigest(payload),
      result_change_set_id: null,
      failure_code: null,
      failure_digest: null,
      status: 'pending',
      lease_expires_at: '2026-07-24T12:00:00.000Z',
      state_version: 1
    }
  };
}

function p19SliceInput({
  elapsed = rational('1', '2'),
  root_result_kind = 'progressed',
  locals = [seal({
    id: 'local-result-1',
    party_id: 'party-1',
    activity_execution_id: 'activity-1',
    actual_time: rational('1', '2'),
    result_kind: 'completed'
  })]
} = {}) {
  const root = seal({
    id: 'root-result-1',
    party_id: 'party-1',
    route_plan_execution_id: 'execution-1',
    actual_time: elapsed,
    result_kind: root_result_kind
  });
  return {
    id: 'slice-1',
    party_id: 'party-1',
    root_transport_execution_id: 'execution-1',
    change_set_id: 'change-1',
    idempotency_record_id: 'record-1',
    dependency_pins: pins(),
    root,
    locals,
    world_time_before: timestamp(),
    atomic_trace: seal({
      root_result_id: root.id,
      root_transport_execution_id: 'execution-1',
      local_result_ids: locals.map(({ id }) => id),
      change_set_id: 'change-1',
      idempotency_record_id: 'record-1'
    })
  };
}

function sliceCommand(currentState, slice_input, interruption_outcome = null) {
  return withIdempotencyRecord({
    kind: 'synchronized_slice',
    expected_state_digest: currentState.canonical_digest,
    slice_input,
    interruption_outcome
  });
}

function interruptionOutcome(overrides = {}) {
  return {
    interruption_level: 'emergency',
    outcome_kind: 'fail',
    execution_ref: ref('party_route_plan_execution', 'execution-1'),
    boundary_ref: null,
    exact_anchor_ref: null,
    elapsed: { exact_minutes: rational('1', '2') },
    reason_code: 'root-hazard',
    progress_preservation_policy_ref: progressPolicyRef,
    resource_preservation_policy_ref: resourcePolicyRef,
    player_decision_required: false,
    dependency_pins: pins(),
    ...overrides
  };
}

test('moving root delegates exactly once to P19 and remains the sole clock owner', () => {
  const p19 = createSpatialV3ExecutionEngine();
  let calls = 0;
  const resolver = (input) => {
    calls += 1;
    return p19.resolveSynchronizedSlice(input);
  };
  const currentState = state();
  const result = engine(resolver).propose(currentState, sliceCommand(currentState, p19SliceInput()));
  assert.equal(calls, 1);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(validateSpatialV3Contract('synchronized_time_slice_result', result.result_set.slice), []);
  assert.equal(result.result_set.root_result.clock_commit_mode, 'direct_party_clock');
  assert.deepEqual(result.result_set.local_results.map(({ clock_commit_mode }) => clock_commit_mode), ['shared_root_transport_clock']);
  assert.deepEqual(result.result_set.local_results.map(({ crossed_whole_minute_boundaries }) => crossed_whole_minute_boundaries), ['0']);
});

test('P19 slice preserves local completion, local zero-block and root-hazard interruption without stopping or duplicating root time', () => {
  const p19 = createSpatialV3ExecutionEngine();
  const currentState = state();

  const completed = engine((input) => p19.resolveSynchronizedSlice(input)).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput())
  );
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.result_set.local_results[0].result_kind, 'completed');

  const locallyBlocked = engine((input) => p19.resolveSynchronizedSlice(input)).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput({
      locals: [seal({
        id: 'local-result-1',
        party_id: 'party-1',
        activity_execution_id: 'activity-1',
        actual_time: rational('0'),
        result_kind: 'blocked'
      })]
    }))
  );
  assert.equal(locallyBlocked.ok, true);
  assert.deepEqual(locallyBlocked.result_set.slice.exact_elapsed, rational('1', '2'));
  assert.deepEqual(locallyBlocked.result_set.local_results[0].actual_time, rational('0'));

  const hazard = engine((input) => p19.resolveSynchronizedSlice(input)).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput({
      locals: [seal({
        id: 'local-result-1',
        party_id: 'party-1',
        activity_execution_id: 'activity-1',
        actual_time: rational('0'),
        result_kind: 'failed'
      })]
    }), interruptionOutcome())
  );
  assert.equal(hazard.ok, true);
  assert.equal(hazard.result_set.local_results[0].result_kind, 'failed');
});

test('root zero forbids local progress and forged second clock owners or noncanonical slices fail closed', () => {
  const p19 = createSpatialV3ExecutionEngine();
  const currentState = state();
  const zero = engine((input) => p19.resolveSynchronizedSlice(input)).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput({
      elapsed: rational('0'),
      root_result_kind: 'blocked_before_progress',
      locals: []
    }))
  );
  assert.equal(zero.ok, true, JSON.stringify(zero));
  assert.deepEqual(zero.result_set.slice.exact_elapsed, rational('0'));

  const validResponse = p19.resolveSynchronizedSlice(p19SliceInput());
  const secondOwner = structuredClone(validResponse);
  secondOwner.local_results[0].clock_commit_mode = 'direct_party_clock';
  const ownerConflict = engine(() => secondOwner).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput())
  );
  assert.equal(ownerConflict.error.code, 'time_owner_conflict');

  const malformed = structuredClone(validResponse);
  malformed.slice.exact_elapsed = rational('2', '4');
  const malformedResult = engine(() => malformed).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput())
  );
  assert.equal(malformedResult.error.code, 'temporal_change_set_conflict');
});

test('stationary carrier selects direct party-clock mode while moving root selects shared mode without doing time math', () => {
  assert.deepEqual(selectCarrierClockCommitMode({ root_transport_execution_ref: null }), {
    clock_commit_mode: 'direct_party_clock',
    root_transport_execution_ref: null
  });
  assert.deepEqual(selectCarrierClockCommitMode({
    root_transport_execution_ref: ref('party_route_plan_execution', 'execution-1')
  }), {
    clock_commit_mode: 'shared_root_transport_clock',
    root_transport_execution_ref: ref('party_route_plan_execution', 'execution-1')
  });
});

function boardCommand(currentState, overrides = {}) {
  const payload = {
    kind: 'board',
    expected_state_digest: currentState.canonical_digest,
    change_set_id: 'change-1',
    attachment: attachment(),
    position: position(),
    expected_state_versions: {
      attachment: null,
      position: null,
      journey_location: 1
    },
    carrier_capacity_snapshot_digest: currentState.carrier_capacity_snapshot.canonical_digest,
    ...overrides
  };
  return withIdempotencyRecord(payload);
}

test('boarding atomically replaces root journey location with formal attachment and derived carrier position', () => {
  const currentState = state();
  const result = engine(() => { throw new Error('slice resolver must not run'); }).propose(
    currentState,
    boardCommand(currentState)
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(validateSpatialV3Contract('party_carrier_attachment', result.result_set.proposed_inserts[0]), []);
  assert.deepEqual(validateSpatialV3Contract('party_actor_carrier_position', result.result_set.proposed_inserts[1]), []);
  assert.deepEqual(result.result_set.proposed_deletes, [{
    contract_name: 'party_journey_location',
    party_id: 'party-1',
    owner_kind: 'actor',
    owner_id: 'actor-1',
    expected_state_version: 1
  }]);
});

test('boarding rejects stale capacity, missing cohort membership and inconsistent terminal root', () => {
  const occupiedAttachment = attachment({
    id: 'attachment-2',
    subject_id: 'actor-2',
    created_change_set_id: 'change-old'
  });
  const occupiedPosition = position({
    actor_id: 'actor-2',
    state_version: 2,
    updated_change_set_id: 'change-old'
  });
  const fullState = state({
    attachments: [occupiedAttachment],
    positions: [occupiedPosition],
    carrier_capacity_snapshot: capacitySnapshot([{
      carrier_kind: 'transport',
      carrier_id: 'cart-1',
      capacity: 1,
      state_version: 4
    }])
  });
  assert.equal(engine(() => {}).propose(fullState, boardCommand(fullState)).error.code, 'state_version_conflict');

  const cohortState = state({
    carrier_capacity_snapshot: capacitySnapshot([{
      carrier_kind: 'cohort',
      carrier_id: 'cohort-1',
      capacity: 4,
      state_version: 1
    }])
  });
  const cohortAttachment = attachment({ carrier_kind: 'cohort', carrier_id: 'cohort-1' });
  const cohortPosition = position({ root_carrier_ref: ref('party_travel_cohort', 'cohort-1') });
  assert.equal(engine(() => {}).propose(cohortState, boardCommand(cohortState, {
    attachment: cohortAttachment,
    position: cohortPosition
  })).error.code, 'attachment_graph_invalid');

  const wrongRoot = position({ root_carrier_ref: ref('transport', 'other-cart') });
  assert.equal(engine(() => {}).propose(state(), boardCommand(state(), { position: wrongRoot })).error.code, 'attachment_graph_invalid');
});

function attachedState(overrides = {}) {
  return state({
    attachments: [attachment()],
    positions: [position()],
    journey_locations: [],
    ...overrides
  });
}

function alightCommand(currentState, overrides = {}) {
  const released = attachment({
    status: 'released',
    state_version: 2,
    released_change_set_id: 'change-2'
  });
  const payload = {
    kind: 'alight',
    expected_state_digest: currentState.canonical_digest,
    change_set_id: 'change-2',
    released_attachment: released,
    handoff_location: actorLocation('actor-1', 'node-1', 1, 'change-2'),
    expected_state_versions: {
      attachment: 1,
      position: 1,
      journey_location: null
    },
    carrier_capacity_snapshot_digest: currentState.carrier_capacity_snapshot.canonical_digest,
    ...overrides
  };
  return withIdempotencyRecord(payload);
}

test('alighting atomically releases the same attachment, deletes derived position and restores exact root location', () => {
  const currentState = attachedState();
  const result = engine(() => {}).propose(currentState, alightCommand(currentState));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(validateSpatialV3Contract('party_carrier_attachment', result.result_set.proposed_updates[0]), []);
  assert.deepEqual(validateSpatialV3Contract('party_journey_location', result.result_set.proposed_inserts[0]), []);
  assert.deepEqual(result.result_set.proposed_deletes, [{
    contract_name: 'party_actor_carrier_position',
    party_id: 'party-1',
    actor_id: 'actor-1',
    expected_state_version: 1
  }]);

  const changedCarrier = attachment({
    carrier_id: 'cart-2',
    status: 'released',
    state_version: 2,
    released_change_set_id: 'change-2'
  });
  assert.equal(engine(() => {}).propose(currentState, alightCommand(currentState, {
    released_attachment: changedCarrier
  })).error.code, 'state_version_conflict');
  assert.equal(engine(() => {}).propose(currentState, alightCommand(currentState, {
    handoff_location: actorLocation('actor-1', 'unapproved-node', 1, 'change-2')
  })).error.code, 'travel_interruption_unresolved');
});

test('strand requires a formal interruption outcome and an approved exact anchor', () => {
  const currentState = state();
  const strand = interruptionOutcome({
    interruption_level: 'strand',
    outcome_kind: 'strand',
    exact_anchor_ref: { endpoint_kind: 'route_anchor_scene', endpoint_id: 'missing' },
    reason_code: 'stranded'
  });
  assert.deepEqual(validateSpatialV3Contract('interruption_outcome', strand), []);
  const result = engine((input) => createSpatialV3ExecutionEngine().resolveSynchronizedSlice(input)).propose(
    currentState,
    sliceCommand(currentState, p19SliceInput(), strand)
  );
  assert.equal(result.error.code, 'travel_interruption_unresolved');
});

test('persisted idempotency replay returns the same result and actual command drift conflicts', () => {
  const initialState = state();
  const command = boardCommand(initialState);
  const first = engine(() => {}).propose(initialState, command);
  assert.equal(first.ok, true);
  const committedRecord = {
    ...command.idempotency_record,
    result_change_set_id: 'change-1',
    status: 'committed',
    lease_expires_at: null,
    state_version: 2
  };
  const replayState = attachedState({
    idempotency_records: [{
      record: committedRecord,
      replay_result: first,
      replay_digest: digest(first)
    }]
  });
  const replay = engine(() => {}).propose(replayState, command);
  assert.deepEqual(replay, first);

  const changedPayload = {
    ...command,
    position: position({ local_position_node_id: 'node-2' })
  };
  delete changedPayload.idempotency_record;
  const changedCommand = withIdempotencyRecord(changedPayload);
  assert.equal(engine(() => {}).propose(replayState, changedCommand).error.code, 'idempotency_conflict');
});
