import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { createTemporalAdvanceEngine } from '../src/temporal-advance.js';
import { mergeTemporalProposals } from '../src/temporal-proposal-merger.js';

const at = (wholeMinutes) => ({
  whole_minutes: String(wholeMinutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entityKind, entityId, version = 'v1') => ({
  entity_ref: ref(entityKind, entityId),
  authoring_version: version
});
const seal = (payload) => ({
  ...payload,
  canonical_digest: computeSpatialV3CanonicalDigest(payload)
});
const pins = seal({
  pins: [{
    dependency_role: 'dynamic_recheck_policy',
    entity_ref: ref('dynamic_recheck_policy', 'temporal-runtime'),
    version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
  }]
});
const calendarProfileRef = seal({
  profile_ref: versioned('calendar_profile', 'novgorod-calendar')
});
const resolutionPolicyRef = seal({
  policy_ref: versioned('dynamic_recheck_policy', 'temporal-resolution')
});

function candidate(id, minute, extra = {}) {
  return {
    boundary_id: id,
    boundary_kind: 'exact_timer',
    scheduled_at: at(minute),
    source_ref: ref('party_route_plan_execution_event', id),
    primary_subject_ref: ref('actor', 'actor-a'),
    subject_refs: [],
    scope_ref: ref('party', 'party-a'),
    rule_ref: versioned('action_contract', `rule-${id}`),
    policy_ref: versioned('activity_contract', `policy-${id}`),
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'execution_outcome',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', `visibility-${id}`),
    idempotency_key: `boundary-${id}`,
    causal_parent_refs: [],
    ...extra
  };
}

function provider(id, values) {
  const candidates = Array.isArray(values) ? values : [values];
  return {
    provider_ref: versioned('dynamic_recheck_policy', id),
    collect: ({ from_timestamp, limit_timestamp }) => candidates.filter((entry) => entry != null &&
      Number(entry.scheduled_at.whole_minutes) >= Number(from_timestamp.whole_minutes) &&
      Number(entry.scheduled_at.whole_minutes) <= Number(limit_timestamp.whole_minutes))
  };
}

function visibleEnvelope(request, changeSetId, visiblePayload = {
  schema: 'temporal_visible_package.v1',
  perceived_scene: 'Время прошло.',
  perceived_changes: ['Состояние мира изменилось.'],
  sensory_details: [],
  visible_npcs: [],
  visible_objects: [],
  known_context: [],
  uncertainties: [],
  hypotheses: [],
  player_safe_interruption: null,
  allowed_action_affordances: []
}) {
  return {
    package_id: `${request.turn_id}:visible`,
    party_id: request.party_id,
    turn_id: request.turn_id,
    committed_state_version: (BigInt(request.base_state_version) + 1n).toString(),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
    visible_payload: visiblePayload,
    presentation_status: 'pending',
    projection_policy_ref: versioned('visibility_modifier', 'player-safe-projection'),
    dependency_pins: pins,
    idempotency_record_id: request.idempotency_context.record_id
  };
}

function request(providers, limit = 12, extra = {}) {
  return {
    party_id: 'party-a',
    turn_id: extra.turn_id ?? 'turn-a',
    base_state_version: '1',
    clock_before: at(10),
    clock_commit_mode: 'direct_party_clock',
    clock_owner_ref: ref('party', 'party-a'),
    requested_execution_ref: ref('party_timed_activity_execution', 'activity-a'),
    inclusive_limit_timestamp: at(limit),
    active_scope: 'exact_active_g6',
    relevant_state_projection: {
      calendar_profile_ref: calendarProfileRef,
      active_execution_refs: [ref('party_timed_activity_execution', 'activity-a')],
      active_execution_requires_boundary: extra.executionRequiresBoundary === true,
      available_event_ids: extra.availableEventIds ?? []
    },
    catalog_pins: pins,
    temporal_resolution_policy_ref: resolutionPolicyRef,
    idempotency_context: {
      record_id: 'temporal-idempotency-a',
      idempotency_key: extra.idempotencyKey ?? 'temporal-command-a',
      change_set_id: 'temporal-change-a',
      ...(extra.persistedReplay ? { persisted_replay: extra.persistedReplay } : {})
    },
    provider_versions: providers.map(({ provider_ref }) => provider_ref)
  };
}

function engine({
  providers,
  resolve,
  applyContinuous,
  temporalStatus = 'completed',
  visiblePayload
}) {
  return createTemporalAdvanceEngine({
    engine_version: 'temporal-advance-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100, max_iterations: 100 },
    providers,
    handlers: {
      applyContinuous: applyContinuous ?? ((slicePlan) => ({
        proposals: [{
          proposal_id: `continuous:${slicePlan.slice_id}`,
          write_target: `continuous:${slicePlan.slice_id}`
        }]
      })),
      resolve: resolve ?? ((value) => ({
        disposition: 'execute',
        proposals: [{
          proposal_id: `boundary:${value.boundary_id}`,
          write_target: `boundary:${value.boundary_id}`
        }]
      })),
      finalize: ({ request: advanceRequest }) => ({
        temporal_status: temporalStatus,
        execution_state_ref: advanceRequest.requested_execution_ref,
        visible_package_candidate: visibleEnvelope(
          advanceRequest,
          advanceRequest.idempotency_context.change_set_id,
          visiblePayload
        ),
        validation_report: { ok: true }
      })
    }
  });
}

function assertContract(name, value) {
  assert.deepEqual(validateSpatialV3Contract(name, value), [], `${name} must match its formal current-target DTO`);
}

test('completion before timer creates exact formal slices and one clock-owner proposal', () => {
  const providers = [
    provider('completion-provider', candidate('completion', 11)),
    provider('timer-provider', candidate('timer', 12))
  ];
  const advanceRequest = request(providers);
  assertContract('temporal_advance_request', advanceRequest);
  const result = engine({ providers }).advance(advanceRequest);
  assertContract('temporal_advance_result', result);
  assert.deepEqual(result.trace.processed_boundary_ids, ['completion', 'timer']);
  assert.deepEqual(result.clock_after, at(12));
  assert.equal(result.combined_change_set.time_slice_results.length, 2);
  for (const slice of result.combined_change_set.time_slice_results) assertContract('time_slice_result', slice);
  assert.deepEqual(result.combined_change_set.clock_owner_ref, advanceRequest.clock_owner_ref);
});

test('body threshold wins same-time ordering and continuous effects run before the batch', () => {
  const callOrder = [];
  const providers = [
    provider('reaction-provider', candidate('reaction', 11, { resolution_class: 'reaction_decision' })),
    provider('body-provider', candidate('body', 11, {
      boundary_kind: 'body_threshold',
      source_ref: ref('body_state', 'body-a'),
      resolution_class: 'physical_hazard_access'
    }))
  ];
  const result = engine({
    providers,
    applyContinuous: (slice) => {
      callOrder.push(`continuous:${slice.to_timestamp.whole_minutes}`);
      return { proposals: [{ proposal_id: 'continuous-body', write_target: 'continuous-body' }] };
    },
    resolve: (value) => {
      callOrder.push(`boundary:${value.boundary_id}`);
      return { disposition: 'execute', proposals: [{ proposal_id: value.boundary_id, write_target: value.boundary_id }] };
    }
  }).advance(request(providers, 11));
  assert.deepEqual(callOrder, ['continuous:11', 'boundary:body', 'boundary:reaction']);
  assert.deepEqual(result.trace.processed_boundary_ids, ['body', 'reaction']);
});

test('same-time fire, smoke and alarm follow-ups stabilize in one zero-time slice', () => {
  const fire = candidate('fire', 10, { resolution_class: 'cooccurring_fact' });
  const providers = [provider('fire-provider', fire)];
  const result = engine({
    providers,
    resolve: (value) => value.boundary_id === 'fire'
      ? {
        disposition: 'execute',
        proposals: [{ proposal_id: 'fire', write_target: 'fire' }],
        follow_up_candidates: [candidate('smoke', 10, {
          causal_parent_refs: [ref('temporal_boundary_candidate', 'fire')],
          resolution_class: 'propagation_background'
        })]
      }
      : value.boundary_id === 'smoke'
        ? {
          disposition: 'execute',
          proposals: [{ proposal_id: 'smoke', write_target: 'smoke' }],
          follow_up_candidates: [candidate('alarm', 10, {
            causal_parent_refs: [ref('temporal_boundary_candidate', 'smoke')],
            resolution_class: 'interruption_terminal'
          })]
        }
        : { disposition: 'execute', proposals: [{ proposal_id: 'alarm', write_target: 'alarm' }] }
  }).advance(request(providers, 10));
  assert.deepEqual(result.trace.processed_boundary_ids, ['fire', 'smoke', 'alarm']);
  assert.equal(result.combined_change_set.time_slice_results.length, 1);
  assert.equal(result.combined_change_set.time_slice_results[0].result_kind, 'zero_time_cascade');
});

test('stale candidates require explicit cancel, replacement or hard block', () => {
  const old = candidate('old', 10);
  const providers = [provider('stale-provider', old)];
  const cancelled = engine({
    providers,
    resolve: () => ({ disposition: 'cancel', proposals: [] })
  }).advance(request(providers, 10));
  assert.deepEqual(cancelled.trace.dispositions, [{ boundary_id: 'old', disposition: 'cancel' }]);

  const replaced = engine({
    providers,
    resolve: (value) => value.boundary_id === 'old'
      ? { disposition: 'replace', replacement: candidate('new', 10), proposals: [] }
      : { disposition: 'execute', proposals: [{ proposal_id: 'new', write_target: 'new' }] }
  }).advance(request(providers, 10));
  assert.deepEqual(replaced.trace.processed_boundary_ids, ['old', 'new']);
  assert.throws(() => engine({
    providers,
    resolve: () => ({ disposition: 'hard_block', code: 'temporal_candidate_stale' })
  }).advance(request(providers, 10)), (error) => error.code === 'temporal_candidate_stale');
});

test('cycles, missing mandatory execution boundary and input mutation hard-fail', () => {
  const noCandidateProviders = [provider('empty-provider', [])];
  assert.throws(
    () => engine({ providers: noCandidateProviders }).advance(request(noCandidateProviders, 11, { executionRequiresBoundary: true })),
    (error) => error.code === 'temporal_execution_unbounded'
  );

  const cycleProviders = [provider('cycle-provider', candidate('a', 10))];
  assert.throws(() => engine({
    providers: cycleProviders,
    resolve: () => ({
      disposition: 'execute',
      follow_up_candidates: [candidate('a', 10, {
        causal_parent_refs: [ref('temporal_boundary_candidate', 'a')]
      })]
    })
  }).advance(request(cycleProviders, 10)), (error) => error.code === 'temporal_boundary_cycle');

  const mutatingProviders = [{
    provider_ref: versioned('dynamic_recheck_policy', 'mutating-provider'),
    collect: (input) => {
      input.changed = true;
      return [];
    }
  }];
  assert.throws(
    () => engine({ providers: mutatingProviders }).advance(request(mutatingProviders, 10)),
    /read only|frozen|Cannot add property/u
  );
});

test('persisted idempotency replay returns the exact prior result across engine reload', () => {
  const providers = [provider('replay-provider', candidate('replay', 11))];
  const advanceRequest = request(providers, 11);
  const first = engine({ providers }).advance(advanceRequest);
  const record = {
    id: advanceRequest.idempotency_context.record_id,
    party_id: advanceRequest.party_id,
    operation_kind: 'temporal_advance',
    idempotency_key: advanceRequest.idempotency_context.idempotency_key,
    canonical_input_digest: first.trace.idempotency.canonical_input_digest,
    expected_state_versions_digest: first.trace.idempotency.expected_state_versions_digest,
    result_change_set_id: advanceRequest.idempotency_context.change_set_id,
    status: 'committed',
    state_version: 1
  };
  assertContract('idempotency_record', record);
  const replayRequest = request(providers, 11, { persistedReplay: { record, result: first } });
  assert.deepEqual(engine({ providers }).advance(replayRequest), first);
  const changedRequest = request(providers, 12, { persistedReplay: { record, result: first } });
  assert.throws(() => engine({ providers }).advance(changedRequest), (error) => error.code === 'idempotency_conflict');
});

test('finalizer controls domain status and hidden visible payload is rejected', () => {
  const providers = [provider('decision-provider', candidate('decision', 10))];
  const decision = engine({ providers, temporalStatus: 'decision_required' }).advance(request(providers, 10));
  assert.equal(decision.temporal_status, 'decision_required');
  assertContract('temporal_advance_result', decision);
  assert.throws(() => engine({
    providers,
    visiblePayload: { npc_motive: 'secret' }
  }).advance(request(providers, 10)), (error) => error.code === 'hidden_information_leak');
});

test('proposal merger rejects every temporal conflict and hidden-data class', () => {
  const conflict = (proposals, code) => assert.throws(
    () => mergeTemporalProposals({
      proposals,
      expected_clock_owner_ref: ref('party', 'party-a')
    }),
    (error) => error.code === code
  );
  conflict([{ write_target: 'x' }, { write_target: 'x' }], 'temporal_change_set_conflict');
  conflict([
    { clock_owner_ref: ref('party', 'party-a') },
    { clock_owner_ref: ref('party', 'party-b') }
  ], 'time_owner_conflict');
  conflict([
    { status_transition: { subject_ref: ref('actor', 'a'), from: 'x', to: 'y' } },
    { status_transition: { subject_ref: ref('actor', 'a'), from: 'z', to: 'q' } }
  ], 'temporal_change_set_conflict');
  conflict([
    { move: { subject_ref: ref('actor', 'a') } },
    { move: { subject_ref: ref('actor', 'a') } }
  ], 'temporal_change_set_conflict');
  conflict([
    { resource_consumption: { resource_ref: ref('item', 'a'), amount: '1' } },
    { resource_consumption: { resource_ref: ref('item', 'a'), amount: '1' } }
  ], 'temporal_change_set_conflict');
  conflict([{ event_dependencies: ['missing'] }], 'temporal_change_set_conflict');
  conflict([{ visible_data: { npc_motive: 'secret' } }], 'hidden_information_leak');
  conflict([{ visible_package_candidate: { unperceivedKnowledge: 'secret' } }], 'hidden_information_leak');
});
