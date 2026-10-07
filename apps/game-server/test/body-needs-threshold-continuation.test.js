import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBodyTimeEffectProposals } from '@rus/body-state';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';

// D102: sol acceptance tests for A-13 / PLAN-OK-delta-14, before implementation.
// Real runtime registrations, adapter and temporal owner; no model or database calls.
const rational = (value) => ({ numerator: String(value), denominator: '1' });
const at = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (kind, id) => ({ entity_ref: ref(kind, id), authoring_version: '1' });
const contracts = { activity: {
  nearest_temporal_boundary_rule: 'split_before_earliest_boundary'
} };

test('waiting continues across normal and penalized body thresholds', async (t) => {
  for (const entry of [
    { band: 'normal', satiety: 70, energy: 80, minutes: 1000,
      after: { health: 100, satiety: 46.851852, energy: 56.851852 } },
    { band: 'relevant_actions_penalized', satiety: 30, energy: 80, minutes: 540,
      after: { health: 100, satiety: 17.5, energy: 67.5 } }
  ]) {
    await t.test(entry.band, async () => {
      const run = await wait(entry);
      const temporal = onlyTemporalResult(run);
      assert.deepEqual({
        elapsed: run.result.exact_elapsed.exact_minutes,
        stopped: temporal.trace.stopped_after_current_batch,
        effects: run.candidates.map((candidate) => candidate.interrupt_effect)
      }, { elapsed: rational(entry.minutes), stopped: false,
        effects: run.candidates.map(() => 'background') });
      assert.ok(run.candidates.length > 0, 'the real body threshold handler was reached');
      assert.equal(temporal.temporal_status, 'completed');
      assert.deepEqual(savedBody(run), entry.after);
    });
  }
});

test('satiety zero inside the window continues with harm only for time after zero', async () => {
  const run = await wait({ satiety: 10, energy: 80, minutes: 540 });
  const temporal = onlyTemporalResult(run);
  assert.deepEqual(run.result.exact_elapsed.exact_minutes, rational(540));
  assert.deepEqual(run.result.clock_after, at(540));
  assert.equal(temporal.temporal_status, 'completed');
  assert.equal(temporal.trace.stopped_after_current_batch, false);
  assert.deepEqual(temporal.combined_change_set.time_slice_results
    .filter((slice) => slice.processed_boundary_refs.length > 0)
    .map((slice) => slice.clock_after), [at(432)]);
  // Zero at 432; only the remaining 108 minutes charge 108/60 * 25/18 = 2.5.
  assert.deepEqual(savedBody(run), { health: 97.5, satiety: 0, energy: 67.5 });
  assert.equal(temporal.combined_change_set.proposals.some(
    (proposal) => proposal.reason_code === 'event_effect_gap'), false,
  'approved starvation must continue without a missing-consequence gap');
});

test('waiting visits satiety zero and every threshold before stopping at energy zero', async () => {
  const run = await wait({ satiety: 70, energy: 80, minutes: 3600 });
  const temporal = onlyTemporalResult(run);
  assert.deepEqual(run.result.exact_elapsed.exact_minutes, rational(3456));
  assert.equal(temporal.temporal_status, 'paused');
  assert.equal(temporal.trace.stopped_after_current_batch, true);
  const slices = temporal.combined_change_set.time_slice_results.filter(
    (slice) => slice.processed_boundary_refs.length > 0);
  assert.deepEqual(slices.map((slice) => slice.clock_after),
    [864, 1296, 2160, 2592, 3024, 3456].map(at));
  assert.deepEqual(slices.map((slice) => slice.processed_boundary_refs.length),
    [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(slices.flatMap((slice) => slice.processed_boundary_refs
    .map((boundary) => boundary.entity_id)), temporal.trace.processed_boundary_ids);
  assert.equal(temporal.trace.dispositions.length, 6);
  assert.ok(temporal.trace.dispositions.every((entry) => entry.disposition === 'execute'));
  // Starvation from 3024 to energy zero at 3456: 432/60 * 25/18 = 10.
  assert.deepEqual(savedBody(run), { health: 90, satiety: 0, energy: 0 });
  assert.ok(temporal.combined_change_set.proposals.some(
    (proposal) => proposal.reason_code === 'event_effect_gap'));
  assert.ok(run.candidates.every((candidate) => Number(candidate.scheduled_at.whole_minutes) <= 3456),
    'the predicted set ends at energy zero, not satiety zero');
});

test('critical zero at the requested end completes the same-time batch without overrun', async () => {
  const run = await wait({ satiety: 70, energy: 80, minutes: 3024 });
  const temporal = onlyTemporalResult(run);
  assert.deepEqual(run.result.exact_elapsed.exact_minutes, rational(3024));
  assert.deepEqual(run.result.clock_after, at(3024));
  assert.equal(temporal.temporal_status, 'completed');
  const lastSlice = temporal.combined_change_set.time_slice_results.at(-1);
  assert.deepEqual(lastSlice.clock_after, at(3024));
  assert.equal(lastSlice.processed_boundary_refs.length, 1,
    'the critical threshold at the inclusive end must still be resolved');
  assert.deepEqual(savedBody(run), { health: 100, satiety: 0, energy: 10 });
});

test('a separately registered genuine hard interruption still stops and preserves accrued body', async () => {
  const candidate = genuineInterruption();
  const run = await wait({ satiety: 70, energy: 80, minutes: 60,
    candidates: [candidate], registrations: [{
      rule_ref: candidate.rule_ref, policy_ref: candidate.policy_ref,
      resolve(_candidate, { projection }) {
        return { disposition: 'execute', proposals: [], state_projection: projection,
          follow_up_candidates: [], stop_after_current_batch: true };
      }
    }] });
  const temporal = onlyTemporalResult(run);
  assert.deepEqual(run.result.exact_elapsed.exact_minutes, rational(7));
  assert.equal(temporal.temporal_status, 'paused');
  assert.equal(temporal.trace.stopped_after_current_batch, true);
  assert.deepEqual(temporal.trace.processed_boundary_ids, [candidate.boundary_id]);
  assert.deepEqual(savedBody(run), {
    health: 100, satiety: 69.837963, energy: 79.837963
  });
});

async function wait({ satiety, energy, minutes, candidates = [], registrations = [] }) {
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001'
  });
  let ports;
  createTraceTurnRuntime({
    partyPool: { query() { throw new Error('unexpected database query'); }, connect() {} },
    committer: { commit() { throw new Error('unexpected database commit'); } }, env: {},
    config: { traceTurnDecisionSecret: 'test-body-threshold-secret', llmTurnBudget: {},
      llmDiagnostics: { telemetry: null, turnBudget: {} },
      temporalBoundaryRegistrations: registrations },
    ordinaryMaterializationProfile: null, ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: null, actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null, bodyNeedsProfile, worldKnowledge: null,
    createNpcRuntimePorts: () => ({}),
    createNarrationService: () => ({ run() { throw new Error('unexpected narration call'); } }),
    createPhase2RuntimeFactory: (input) => { ports = input; return {}; }
  });
  assert.equal(typeof ports?.temporalAdvanceOwner?.advance, 'function');
  assert.equal(ports.bodyTimeEffectAdapter.approved, true);
  const state = initialState(satiety, energy, candidates);
  let observedCandidates;
  const advance = createTracePhase2TemporalAdvance({ contracts,
    bodyTimeEffectAdapter: ports.bodyTimeEffectAdapter,
    temporalAdvanceOwner: { advance(input) {
      observedCandidates = structuredClone(input.source_candidates);
      return ports.temporalAdvanceOwner.advance(input);
    } }
  });
  const result = await advance({ clock_before: state.clock,
    exact_elapsed: { exact_minutes: rational(minutes) }, effect_kind: 'semantic_activity',
    consequence: { state_changes: [{ kind: 'semantic_activity', activity_id: 'wait', effort: 'none' }] },
    relevant_state: state });
  return { result, state, adapter: ports.bodyTimeEffectAdapter, candidates: observedCandidates };
}

function onlyTemporalResult({ result }) {
  assert.equal(result.temporal_results?.length, 1);
  return result.temporal_results[0];
}

function savedBody({ result, state, adapter }) {
  // This is the real downstream body owner input: actual elapsed, never requested duration.
  const calculated = adapter.calculateProposals({
    effort: 'none', exact_elapsed: result.exact_elapsed.exact_minutes,
    body_state: state.body_state, body_state_ref: ref('body_state', state.actor_id),
    scope_ref: ref('party', state.party_id), environment_fact: state.environment_snapshot,
    party_id: state.party_id, state_version: state.party_state.state_version,
    observed_at: state.clock, active_conditions: []
  });
  assert.equal(calculated.ok, true);
  const applied = applyBodyTimeEffectProposals(state.body_state, calculated.proposals);
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.state_after.active_conditions, state.body_state.active_conditions);
  const { health, satiety, energy } = applied.state_after;
  return { health, satiety, energy };
}

function initialState(satiety, energy, candidates) {
  return { party_id: 'party-1', actor_id: 'actor-1',
    party_state: { state_version: 1, turn_number: 1 }, clock: at(0),
    body_state: { health: 100, satiety, energy, active_conditions: [] },
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight', weather_state: { weather_state_id: 'clear' } },
    temporal_boundary_candidates: candidates,
    temporal_source_proof: { schema: 'lower_dvina_trace_temporal_source_proof', version: 2,
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      pending_event_count: 0, active_schedule_count: 0,
      candidate_count: candidates.length, candidates,
      admission_policy: 'pass_exact_candidates_to_temporal_activity_owner' },
    npcs: [], npc_schedule_runtime: [], local_fire_runtime: [] };
}

function genuineInterruption() {
  // Same registered source mechanism as the unchanged conversation interruption suite.
  return { boundary_id: 'boundary:genuine-interruption', boundary_kind: 'exact_timer',
    scheduled_at: at(7), source_ref: ref('party_route_plan_execution_event', 'timer:genuine'),
    primary_subject_ref: ref('actor', 'actor-1'), subject_refs: [], scope_ref: ref('party', 'party-1'),
    rule_ref: versioned('action_contract', 'rule:genuine-interruption'),
    policy_ref: versioned('activity_contract', 'policy:genuine-interruption'),
    preconditions_digest: 'a'.repeat(64), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: versioned('visibility_modifier', 'visible:genuine-interruption'),
    idempotency_key: 'timer:genuine-interruption:1', causal_parent_refs: [] };
}
