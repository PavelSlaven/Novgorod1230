import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { advanceTemporalBoundaryBatch, createTemporalAdvanceEngine } from
  '../src/temporal-advance.js';
import { mergeTemporalProposals } from '../src/temporal-proposal-merger.js';
import {
  createSpatialV3PerceptionBoundaryParticipant
} from '../src/spatial-v3-perception-boundary-participant.js';

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

test('batch uses evolving projection', () => {
  const calls = [];
  const hazard = candidate('hazard', 11,
    { resolution_class: 'physical_hazard_access' });
  const execution = candidate('carrier-rebind', 11,
    { boundary_kind: 'carrier_sync', resolution_class: 'execution_outcome' });
  const sourceProvider = provider('hazard-p', hazard);
  const registeredProvider = provider('execution-p', execution);
  const providers = [sourceProvider, registeredProvider];
  const advanced = advanceTemporalBoundaryBatch({
    request: request(providers, 12),
    engine_version: 'temporal-advance-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100, max_iterations: 100 },
    source_provider_ref: sourceProvider.provider_ref,
    source_candidates: [hazard],
    registered_provider_ref: registeredProvider.provider_ref,
    registered_candidates: [execution],
    apply_continuous: (slice, { projection }) => ({
      proposals: [{ proposal_id: 'progress-to-boundary',
        write_target: 'activity-progress' }],
      state_projection: { ...projection, progress_minutes: 10 }
    }),
    resolve_source_candidate(value, { projection }) {
      calls.push({ replacement_available: projection.replacement_available,
        active_carriers: projection.active_carriers ?? ['player'] });
      if (value.boundary_id === 'hazard') {
        return {
          disposition: 'execute',
          proposals: [{ proposal_id: 'hazard-effect',
            write_target: 'replacement-access' }],
          state_projection: { ...projection, replacement_available: false },
          follow_up_candidates: [candidate('reaction', 11, {
            resolution_class: 'reaction_decision',
            causal_parent_refs: [ref('temporal_boundary_candidate', 'hazard')]
          })]
        };
      }
      return {
        disposition: 'execute',
        proposals: [{ proposal_id: 'reaction-effect',
          write_target: 'npc-reaction' }],
        state_projection: projection
      };
    },
    resolve_registered_candidate(_value, { projection }) {
      calls.push({ replacement_available: projection.replacement_available,
        active_carriers: projection.active_carriers ?? ['player'] });
      return {
        disposition: projection.replacement_available === false
          ? 'cancel' : 'execute',
        proposals: [{ proposal_id: 'carrier-outcome',
          write_target: 'carrier-group' }],
        state_projection: { ...projection,
          active_carriers: projection.replacement_available === false
            ? ['player'] : ['replacement'] }
      };
    },
    finalize: ({ request: advanceRequest }) => ({
      temporal_status: 'completed',
      execution_state_ref: advanceRequest.requested_execution_ref,
      visible_package_candidate: visibleEnvelope(advanceRequest,
        advanceRequest.idempotency_context.change_set_id),
      validation_report: { ok: true }
    })
  });
  const result = advanced.result;

  assert.deepEqual(result.trace.processed_boundary_ids,
    ['hazard', 'carrier-rebind', 'reaction']);
  assert.deepEqual(result.trace.dispositions, [
    { boundary_id: 'hazard', disposition: 'execute' },
    { boundary_id: 'carrier-rebind', disposition: 'cancel' },
    { boundary_id: 'reaction', disposition: 'execute' }
  ]);
  assert.equal(result.clock_after.whole_minutes, '11');
  assert.deepEqual(calls.slice(1), [
    { replacement_available: false, active_carriers: ['player'] },
    { replacement_available: false, active_carriers: ['player'] }
  ]);
});

test('journey providers observe the latest immutable working projection between slices and same-time handlers', () => {
  const observed = [];
  const providers = [
    {
      provider_ref: versioned('dynamic_recheck_policy', 'journey-traversal-provider'),
      collect: ({ from_timestamp, relevant_state_projection }) => {
        observed.push(`traversal:${from_timestamp.whole_minutes}:${relevant_state_projection.journey_phase}`);
        return relevant_state_projection.journey_phase === 'moving'
          ? [candidate('segment-recheck', 11, {
            boundary_kind: 'traversal',
            source_ref: ref('party_route_plan_execution_event', 'journey-a')
          })]
          : [];
      }
    },
    {
      provider_ref: versioned('dynamic_recheck_policy', 'journey-body-provider'),
      collect: ({ from_timestamp, relevant_state_projection }) => {
        observed.push(`body:${from_timestamp.whole_minutes}:${relevant_state_projection.journey_phase}`);
        return relevant_state_projection.journey_phase === 'after-recheck'
          ? [candidate('body-threshold', 12, {
            boundary_kind: 'body_threshold',
            source_ref: ref('body_state', 'body-a'),
            resolution_class: 'physical_hazard_access'
          })]
          : [];
      }
    }
  ];
  const advanceRequest = request(providers, 12);
  advanceRequest.relevant_state_projection.journey_phase = 'moving';
  const seenByHandlers = [];
  const seenBoundaryClocks = [];
  const result = engine({
    providers,
    applyContinuous: (slice, { projection }) => ({
      proposals: [{
        proposal_id: `progress:${slice.slice_id}`,
        write_target: `progress:${slice.slice_id}`
      }],
      state_projection: {
        ...projection,
        continuous_to: slice.to_timestamp.whole_minutes
      }
    }),
    resolve: (value, { projection, clock_before, slice_plan }) => {
      seenByHandlers.push(`${value.boundary_id}:${projection.journey_phase}:${projection.continuous_to}`);
      seenBoundaryClocks.push(
        `${value.boundary_id}:${clock_before.whole_minutes}:${slice_plan.from_timestamp.whole_minutes}`
      );
      if (value.boundary_id === 'segment-recheck') {
        return {
          disposition: 'execute',
          proposals: [{ proposal_id: value.boundary_id, write_target: value.boundary_id }],
          state_projection: {
            ...projection,
            journey_phase: 'after-recheck'
          },
          follow_up_candidates: [candidate('perception-follow-up', 11, {
            boundary_kind: 'perception_follow_up',
            source_ref: ref('perception_result', 'perception-a'),
            causal_parent_refs: [ref('temporal_boundary_candidate', 'segment-recheck')],
            resolution_class: 'propagation_background'
          })]
        };
      }
      return {
        disposition: 'execute',
        proposals: [{ proposal_id: value.boundary_id, write_target: value.boundary_id }],
        state_projection: value.boundary_id === 'perception-follow-up'
          ? { ...projection, perception_processed: true }
          : projection
      };
    }
  }).advance(advanceRequest);

  assert.deepEqual(result.trace.processed_boundary_ids, [
    'segment-recheck',
    'perception-follow-up',
    'body-threshold'
  ]);
  assert.deepEqual(seenByHandlers, [
    'segment-recheck:moving:11',
    'perception-follow-up:after-recheck:11',
    'body-threshold:after-recheck:12'
  ]);
  assert.deepEqual(seenBoundaryClocks, [
    'segment-recheck:11:10',
    'perception-follow-up:11:10',
    'body-threshold:12:11'
  ]);
  assert.ok(observed.includes('body:11:after-recheck'));
});

test('perception follow-up participates in the same-time cascade and yields one mapped pending decision proposal', () => {
  const perceptionCandidate = candidate('perception-boundary', 10, {
    boundary_kind: 'perception_follow_up',
    source_ref: ref('action_contract', 'signal-event'),
    primary_subject_ref: ref('npc', 'npc-a'),
    resolution_class: 'propagation_background'
  });
  const participant = createSpatialV3PerceptionBoundaryParticipant({
    resolveBoundary: (input) => {
      assert.equal(Object.isFrozen(input), true);
      return {
        ok: true,
        status: 'awaiting_bounded_decision',
        decision_mode: 'bounded_selection',
        perception_result: { perception_id: 'perception-a' },
        perception_replay_evidence: { perception_id: 'perception-a' },
        knowledge_merge_result: { proposal_id: 'knowledge-a' },
        reaction_option_proposal: {
          request_id: 'reaction-a',
          decision_request: { request_id: 'reaction-a' }
        },
        reaction_proposal: null,
        decision_request: { request_id: 'reaction-a' }
      };
    },
    buildInitialWriteSet: () => ({
      ok: true,
      write_set: {
        appends: [{ target_table: 'party_npc_reaction_option_proposals' }],
        inserts: [],
        updates: []
      },
      expected_state_versions: [],
      physical_keys: [
        'party_runtime.party_npc_reaction_option_proposals:reaction-a'
      ]
    }),
    buildCompletionWriteSet: () => {
      throw new Error('pending work must use the initial write mapper');
    }
  });
  const providers = [
    provider('perception-provider', perceptionCandidate)
  ];
  const advanceRequest = request(providers, 10);
  advanceRequest.relevant_state_projection.perception_boundary_work_items = [{
    boundary_id: perceptionCandidate.boundary_id,
    cycle_input: {
      perception_request: {
        perceiver_ref: perceptionCandidate.primary_subject_ref,
        event_ref: perceptionCandidate.source_ref,
        perceived_at: perceptionCandidate.scheduled_at
      }
    },
    write_context: {
      party_id: advanceRequest.party_id,
      change_set_id: advanceRequest.idempotency_context.change_set_id,
      idempotency_record_id:
        advanceRequest.idempotency_context.record_id
    }
  }];
  const result = engine({
    providers,
    temporalStatus: 'decision_required',
    resolve: (value, context) => participant.resolve(value, context)
  }).advance(advanceRequest);
  const proposal = result.combined_change_set.proposals.find(
    ({ boundary_id }) => boundary_id === perceptionCandidate.boundary_id
  );
  assert.equal(proposal.status, 'awaiting_bounded_decision');
  assert.equal(
    proposal.write_set.appends[0].target_table,
    'party_npc_reaction_option_proposals'
  );
  assert.equal(result.temporal_status, 'decision_required');
  assert.equal(
    result.trace.processed_boundary_ids.includes(
      perceptionCandidate.boundary_id
    ),
    true
  );
});

test('working projection updates fail closed when a handler returns a non-object', () => {
  const providers = [provider('projection-provider', candidate('projection', 11))];
  assert.throws(
    () => engine({
      providers,
      applyContinuous: () => ({
        proposals: [],
        state_projection: 'hidden-mutable-state'
      })
    }).advance(request(providers, 11)),
    (error) => error.code === 'temporal_change_set_conflict'
  );
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
