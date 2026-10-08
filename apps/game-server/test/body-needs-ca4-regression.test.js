import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyBodyTimeEffectProposals } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { bindTurnStepPreparedConsequence, buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate, runTurnStepLoop } from '@rus/turn';
import { directPlan } from '../../../packages/turn/test/turn-step-prepared-effects-fixture.js';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { validatePreparedSemanticSlices } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-authority.js';
import { validatePreparedEffectCommit } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-validation.js';
import { createTracePhase2TemporalAdvance } from '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTraceTurnRuntime } from '../src/runtime/releases/spatial-v3-production-trace-runtime.js';

// D102: sol regressions for REVIEW-body-needs-bind-ca4, before production fixes.
// Real approved profiles and runtime body owners; no model or database calls.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const at = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const rational = (minutes) => ({ numerator: String(minutes), denominator: '1' });
const cumulativeSatiety = [69.976852, 69.953704, 69.930556, 69.907407,
  69.884259, 69.861111, 69.837963];
const cumulativeEnergy = [79.976852, 79.953704, 79.930556, 79.907407,
  79.884259, 79.861111, 79.837963];

test('BNB4-01: seven approved one-minute slices equal one seven-minute slice', async () => {
  const owners = await approvedOwners();
  const seven = await runChain(owners, 7);
  const one = await runChain(owners, 1);
  assert.equal(seven.prepared_effect_ledger.slices.length, 7);
  assert.equal(one.prepared_effect_ledger.slices.length, 1);
  const state = initialState();
  const split = buildTurnStepPreparedBodyUpdate(seven.prepared_effect_ledger, state.body_state);
  const single = buildTurnStepPreparedBodyUpdate(one.prepared_effect_ledger, state.body_state);
  assert.deepEqual(single.state_after, { health: 100, satiety: 69.837963,
    energy: 79.837963, active_conditions: [] });
  assert.deepEqual(split.proposal.exact_changes, single.proposal.exact_changes);
  assert.deepEqual(split.proposal.exact_changes.satiety.decrease,
    { numerator: '35', denominator: '216' });
  assert.deepEqual(split.state_after, single.state_after,
    'one commit must not depend on its internal interval partition');
  assert.deepEqual(seven.prepared_effect_ledger.slices.at(-1).body_update.state_after,
    split.state_after, 'the last slice and committed body must agree');
});

test('BNB4-01: each real prepared slice rounds from the exact cumulative change', async () => {
  const result = await runChain(await approvedOwners(), 7);
  // Approved ordinary rate 25/18 per hour = 5/216 per minute.
  // Each entry is half-even(70 - k*5/216, 6), never priorRounded - 5/216.
  assert.deepEqual(result.prepared_effect_ledger.slices.map(({ body_update }) =>
    body_update.state_after.satiety), cumulativeSatiety);
  assert.deepEqual(result.prepared_effect_ledger.slices.map(({ body_update }) =>
    body_update.state_after.energy), cumulativeEnergy);
});

test('BNB4-02: approved proposal is accepted and exact forgery is rejected', async (t) => {
  const owners = await approvedOwners();
  const fixture = authorityFixture(owners);
  await t.test('unchanged approved owner proposal', () => {
    assert.doesNotThrow(() => validate(owners, fixture, fixture.slice));
  });
  for (const name of ['metric amount', 'exact changes', 'profile pin', 'binding pin']) {
    await t.test(name, () => {
      const forged = structuredClone(fixture.slice);
      const proposal = forged.body_update.proposal;
      if (name === 'metric amount') {
        const amount = proposal.component_proposals[0].metric_changes[0].amount;
        Object.assign(amount, plusOneBillionth(amount));
        const replay = applyBodyTimeEffectProposals(
          proposal.fixed_effect_proposals.at(-1).state_after,
          proposal.component_proposals);
        assert.equal(replay.ok, true);
        assert.deepEqual(replay.state_after, fixture.slice.body_update.state_after,
          'the forgery preserves the same rounded scalar body');
        proposal.exact_changes = replay.exact_changes;
      } else if (name === 'exact changes') {
        proposal.exact_changes.satiety.decrease = plusOneBillionth(
          proposal.exact_changes.satiety.decrease);
      } else {
        const pin = proposal.component_proposals[0][
          name === 'profile pin' ? 'profile_pin' : 'binding_pin'];
        pin.digest = pin.digest === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
      }
      assert.deepEqual(forged.body_update.state_after, fixture.slice.body_update.state_after);
      assert.notEqual(canonicalDigest(proposal), canonicalDigest(fixture.slice.body_update.proposal));
      assert.throws(() => validate(owners, fixture, forged), (error) =>
        ['TRACE_TURN_STEP_PREPARED_EFFECT_RECONCILIATION_FAILED',
          'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'].includes(error.code),
      `${name} must match the exact approved owner proposal, even with the same state_after`);
    });
  }
});

test('dot-ca4: exact fractional energy-zero stops pass the prepared commit guard', async (t) => {
  const owners = await approvedOwners();
  const advance = await productionTemporalAdvance();
  const first = initialState();
  first.body_state.satiety = 80;
  first.body_state.energy = 69;
  await t.test('integer elapsed commit control', async () => {
    const control = await runChain(owners, 1, { state: first,
      duration: 1, temporalAdvance: advance });
    assertPreparedCommit(owners, preparedCommitInput(control, first));
  });
  const beforeShortWait = initialState();
  beforeShortWait.body_state.satiety = 90;
  const shortWait = await runChain(owners, 1, { state: beforeShortWait, duration: 1 });
  const savedBody = buildTurnStepPreparedBodyUpdate(shortWait.prepared_effect_ledger,
    beforeShortWait.body_state).state_after;
  assert.deepEqual(savedBody, { health: 100, satiety: 89.976852,
    energy: 79.976852, active_conditions: [] });
  // Persisted scalar round-trip before the long wait, without claiming a PG reload.
  const reloaded = JSON.parse(JSON.stringify({ ...beforeShortWait,
    body_state: savedBody, clock: at(1), party_state: { state_version: 2, turn_number: 2 } }));
  for (const [name, state, elapsed, duration] of [
    ['energy 69', first, { numerator: '14904', denominator: '5' }, 2980.8],
    ['short wait then scalar reload', reloaded,
      { numerator: '539843751', denominator: '156250' }, 3455.0000064]
  ]) {
    await t.test(name, async () => {
      const loop = await runChain(owners, 1, { state, duration: 4000, temporalAdvance: advance });
      const ledger = loop.prepared_effect_ledger;
      assert.equal(ledger.slices.length, 1);
      const timeUpdate = buildTurnStepPreparedTimeUpdate(ledger);
      assert.deepEqual(timeUpdate.exact_elapsed.exact_minutes, elapsed);
      const temporal = ledger.slices[0].time_update.temporal_results[0];
      assert.equal(temporal.temporal_status, 'paused');
      assert.equal(temporal.trace.stopped_after_current_batch, true);
      const bodyUpdate = buildTurnStepPreparedBodyUpdate(ledger, state.body_state);
      assert.deepEqual(bodyUpdate.state_after, { health: 100,
        satiety: name === 'energy 69' ? 11 : 10, energy: 0, active_conditions: [] });
      const input = preparedCommitInput(loop, state);
      assert.equal(input.envelope.consequence.duration_minutes, duration);
      assertPreparedCommit(owners, input);
    });
  }
});

test('dot-ca4: an extreme activity stopped at its start does not spend health', async (t) => {
  const owners = await approvedOwners();
  const state = initialState();
  state.body_state.energy = 0;
  const advance = await productionTemporalAdvance();
  for (const attempt of [1, 2]) {
    await t.test(`zero-time attempt ${attempt}`, async () => {
      const loop = await runChain(owners, 1, { state, duration: 1,
        effort: 'extreme', temporalAdvance: advance });
      const ledger = loop.prepared_effect_ledger;
      assert.deepEqual(buildTurnStepPreparedTimeUpdate(ledger).exact_elapsed.exact_minutes,
        rational(0));
      const temporal = ledger.slices[0].time_update.temporal_results[0];
      assert.equal(temporal.temporal_status, 'paused');
      assert.equal(temporal.trace.stopped_after_current_batch, true);
      const update = buildTurnStepPreparedBodyUpdate(ledger, state.body_state);
      assert.deepEqual(update.state_after, state.body_state,
        'an activity that did not start cannot apply its extreme fixed penalty');
    });
  }
  await t.test('executed extreme activity still spends the approved health point', () => {
    const fixture = authorityFixture(owners);
    assert.equal(fixture.slice.body_update.state_after.health, 99);
    assert.equal(fixture.slice.body_update.proposal.fixed_effect_proposals[0].exact_deltas.health, -1);
  });
});

async function approvedOwners() {
  const profile = await loadTargetBodyNeedsProfile({ rootDir,
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001' });
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  const catalog = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json',
    import.meta.url), 'utf8'));
  const profiles = catalog.profiles.turn_step;
  const pin = { artifact_id: profiles.profile_set_id, revision: profiles.revision,
    digest: canonicalDigest(profiles) };
  return createLowerDvinaTraceTurnStepGenericOwners({ profiles, artifactPin: pin,
    selectedProfilePin: pin, bodyTimeEffectAdapter: adapter });
}

function initialState() {
  return { party_id: 'party-ca4', actor_id: 'actor-ca4', clock: at(0),
    party_state: { state_version: 1, turn_number: 1 }, items: [],
    body_state: { health: 100, satiety: 70, energy: 80, active_conditions: [] },
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight', weather_state: { weather_state_id: 'clear' } },
    npcs: [], npc_schedule_runtime: [], local_fire_runtime: [], temporal_boundary_candidates: [],
    temporal_source_proof: { schema: 'lower_dvina_trace_temporal_source_proof', version: 2,
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      pending_event_count: 0, active_schedule_count: 0, candidate_count: 0, candidates: [],
      admission_policy: 'pass_exact_candidates_to_temporal_activity_owner' } };
}

async function runChain(owners, count, { state = initialState(), duration = 7,
  effort = 'none', temporalAdvance = null } = {}) {
  const runtime = createLowerDvinaTraceTurnStepRuntimePorts({ committedState: state,
    semanticActivityOwner: owners.semanticActivityOwner, bodyEffect: owners.bodyEffect,
    workingProjectionAuthority: { admit: (value) => structuredClone(value) },
    temporalAdvance: temporalAdvance ?? (async ({ clock_before, exact_elapsed }) => ({ clock_before,
      clock_after: at(Number(clock_before.whole_minutes)
        + Number(exact_elapsed.exact_minutes.numerator)), exact_elapsed,
      nearest_boundary: null, temporal_results: [] })) });
  return runTurnStepLoop({ requestId: `request:ca4:${count}`, rootTurnId: `turn:ca4:${count}`,
    committedStateVersion: state.party_state.state_version,
    rootPlayerAction: 'Наблюдаю за берегом.',
    actor: { actor_id: state.actor_id, body: state.body_state },
    initialWorkingProjection: { actor_id: state.actor_id, clock: state.clock },
    maxInternalSteps: 8 }, {
    executionRegistry: runtime.executionRegistry,
    preparedEffectContext: runtime.preparedEffectContext,
    preparedEffectTimeOwner: runtime.preparedEffectTimeOwner,
    preparedEffectBodyOwner: runtime.preparedEffectBodyOwner,
    preparedEffectProjectionOwner: runtime.preparedEffectProjectionOwner,
    projectPlayerSafeState: async ({ working_projection }) => working_projection,
    revalidateCommittedState: async () => ({ state_version: state.party_state.state_version }),
    turnStepModel: (request) => directPlan(request, {
      activity: { owner: 'semantic', duration_class: count === 1 ? 'extended' : 'moment',
        effort, ...(count === 1 ? { requested_duration_minutes: duration } : {}) },
      ...(request.step_index < count ? { goal_result: 'pending', continuation: {
        remaining_intent: `Продолжить наблюдение ${request.step_index}`, depends_on_refs: [] } } : {})
    })
  });
}

async function productionTemporalAdvance() {
  const profile = await loadTargetBodyNeedsProfile({ rootDir,
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001' });
  let ports;
  createTraceTurnRuntime({
    partyPool: { query() { throw new Error('unexpected database query'); }, connect() {} },
    committer: { commit() { throw new Error('unexpected database commit'); } }, env: {},
    config: { traceTurnDecisionSecret: 'ca4-test-fixture-key', llmTurnBudget: {},
      llmDiagnostics: { telemetry: null, turnBudget: {} } },
    ordinaryMaterializationProfile: null, ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: null, actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null, bodyNeedsProfile: profile, worldKnowledge: null,
    createNpcRuntimePorts: () => ({}),
    createNarrationService: () => ({ run() { throw new Error('unexpected model call'); } }),
    createPhase2RuntimeFactory: (input) => { ports = input; return {}; }
  });
  return createTracePhase2TemporalAdvance({ contracts: { activity: {
    nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
  temporalAdvanceOwner: ports.temporalAdvanceOwner,
  bodyTimeEffectAdapter: ports.bodyTimeEffectAdapter });
}

function preparedCommitInput(loop, state) {
  const ledger = loop.prepared_effect_ledger;
  const consequence = bindTurnStepPreparedConsequence({ ...ledger.slices[0].consequence,
    visible_seed: { ...ledger.slices[0].consequence.visible_seed,
      completed_steps: loop.completed_steps, clarification: loop.clarification } }, ledger);
  const envelope = { consequence, time_update: buildTurnStepPreparedTimeUpdate(ledger),
    body_update: buildTurnStepPreparedBodyUpdate(ledger, state.body_state),
    player_input: null, mode_resolution: null,
    loop_trace: { step_traces: loop.step_traces,
      completed_steps: loop.completed_steps, clarification: loop.clarification } };
  const slice = ledger.slices[0];
  const activity = slice.consequence.state_changes.find(({ kind }) => kind === 'semantic_activity');
  const batch = { root_turn_id: ledger.root_turn_id,
    committed_state_version: ledger.committed_state_version,
    operations: [{ target: 'party_events', value: { ...activity,
      step_index: slice.step_index, profile_ref: slice.owner_ref,
      duration_minutes: slice.consequence.duration_minutes } }] };
  return { state, batch, envelope, factual: structuredClone(envelope) };
}

function assertPreparedCommit(owners, input) {
  try {
    const result = validatePreparedEffectCommit({ ...input, turnStepApprovedOwners: owners });
    assert.equal(result.prepared, true);
  } catch (error) {
    assert.fail(`prepared commit refused: ${error.code}: ${error.details?.reason ?? error.message}`);
  }
}

function authorityFixture(owners) {
  const state = initialState();
  const activity = { owner: 'semantic', duration_class: 'moment', effort: 'extreme',
    requested_duration_minutes: 1 };
  const selected = owners.semanticActivityOwner.resolve({ activity,
    actor: { body: state.body_state } });
  const activityId = 'activity:ca4-authority';
  const context = { kind: 'semantic_activity', duration_class: 'moment', effort: 'extreme' };
  const consequence = { body_effect_ref: selected.body_effect_ref, duration_minutes: 1,
    state_changes: [{ kind: 'semantic_activity', activity_id: activityId,
      profile_ref: selected.profile_ref, profile_pin: selected.profile_pin,
      duration_class: 'moment', effort: 'extreme',
      body_effect_profile_ref: selected.body_effect_profile_ref, body_effect_context: context }] };
  const timeUpdate = { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
    clock_before: state.clock, clock_after: at(1),
    exact_elapsed: { exact_minutes: rational(1) }, nearest_boundary: null };
  const update = owners.bodyEffect.apply({ committed_state: state,
    consequence, time_update: timeUpdate });
  assert.equal(update.applied, true);
  const slice = { step_index: 1, effect_kind: 'semantic_activity', owner_ref: selected.profile_ref,
    operation_ref: activityId, consequence, time_update: timeUpdate,
    body_update: { version: 1, schema: 'turn_body_update', ...update } };
  const batch = { root_turn_id: 'turn:ca4-authority', operations: [{ target: 'party_events',
    value: { activity_id: activityId, step_index: 1, profile_ref: selected.profile_ref,
      duration_class: 'moment', effort: 'extreme', duration_minutes: 1 } }] };
  const envelope = { loop_trace: { step_traces: [{ step_index: 1, applied: true,
    approved_plan: { activity }, plan_request: { player_safe_state: { clock: state.clock } } }] } };
  return { state, slice, batch, envelope };
}

function validate(owners, fixture, slice) {
  return validatePreparedSemanticSlices({ ledger: { slices: [slice] },
    batch: fixture.batch, envelope: fixture.envelope, state: fixture.state,
    turnStepApprovedOwners: owners });
}

function plusOneBillionth(value) {
  let numerator = BigInt(value.numerator) * 1000000000n + BigInt(value.denominator);
  let denominator = BigInt(value.denominator) * 1000000000n;
  let a = numerator, b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: String(numerator / a), denominator: String(denominator / a) };
}
