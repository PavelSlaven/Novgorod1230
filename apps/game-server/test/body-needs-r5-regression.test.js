import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyBodyTimeEffectProposals } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { addElapsedTime } from '@rus/time-events-history';
import { bindTurnStepPreparedConsequence, buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate, runTurnStepLoop } from '@rus/turn';
import { directPlan } from '../../../packages/turn/test/turn-step-prepared-effects-fixture.js';
import { buildTurnStepDraftConsequence } from '../../../packages/turn/src/turn-step-workflow-draft.js';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { validatePreparedEffectCommit } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-validation.js';
import { preparedBodyHistoryInput, prepareTurnStepBodyHistory,
  validateTurnStepBodyTimeProposal } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { assertTurnStepBodyHistoryRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js';
import { createTracePhase2TemporalAdvance } from '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTraceTurnRuntime } from '../src/runtime/releases/spatial-v3-production-trace-runtime.js';

// D102: r5-replan regressions before the shared body-owner implementation.
// Real approved owners and full guards. SQL readback uses explicit row fixtures;
// no database, model call, persisted scalar reload, or commit between root slices.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const at = (minutes, numerator = '0', denominator = '1') => ({
  whole_minutes: String(minutes), subminute_numerator: numerator,
  subminute_denominator: denominator });
const rational = (numerator, denominator = '1') => ({
  numerator: String(numerator), denominator: String(denominator) });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (kind, id) => ({ entity_ref: ref(kind, id), authoring_version: '1' });

test('r5: 7x1 and 1x7 pass full prepared guard, history and readback', async (t) => {
  const bundle = await approvedBundle();
  const state = initialState();
  const single = commitInput(await runRoot(bundle, state, [7]), state);
  const split = commitInput(await runRoot(bundle, state, Array(7).fill(1)), state);
  const expected = { health: 100, satiety: 69.837963,
    energy: 79.837963, active_conditions: [] };
  // 7 * 5/216; rounded once from the exact root body, half-even at 6 places.
  for (const [name, input] of [['1x7', single], ['7x1', split]]) {
    assert.deepEqual(input.envelope.body_update.state_after, expected);
    assert.deepEqual(input.envelope.body_update.proposal.exact_changes.satiety.decrease,
      rational(35, 216));
    await t.test(`${name}: full prepared commit guard`, () => {
      assert.equal(validatePreparedEffectCommit({ ...input,
        turnStepApprovedOwners: bundle.owners }).prepared, true);
    });
    await t.test(`${name}: history and readback`, async () => {
      const history = makeHistory(bundle, input);
      assert.equal(history.snapshot.effect_ref.state_after_digest,
        canonicalDigest(expected));
      assert.equal(history.snapshot.effect_ref.component_effects.length,
        input.envelope.time_update.prepared_effect_ledger.slices.length);
      await readback(bundle, input, history.snapshot);
    });
  }
  assert.deepEqual(split.envelope.body_update.state_after,
    single.envelope.body_update.state_after);
});

test('r5: exact root body reaches integer and fractional boundaries in the same-time batch', async (t) => {
  const bundle = await approvedBundle();
  for (const entry of [
    { name: 'energy zero at 3456 after 1 + 3455', metric: 'energy',
      durations: [1, 3455], singleDuration: 3456, zeroAt: at(3456),
      total: rational(3456), second: rational(3455), healthElapsed: rational(432),
      state: initialState(), after: { health: 90, satiety: 0, energy: 0, active_conditions: [] } },
    { name: 'satiety zero at 3024 after 1 + 3023', metric: 'satiety',
      durations: [1, 3023], singleDuration: 3024, zeroAt: at(3024),
      total: rational(3024), second: rational(3023), healthElapsed: null,
      state: initialState(), after: { health: 100, satiety: 0, energy: 10, active_conditions: [] } },
    { name: 'fractional energy zero at 14904/5 after the first minute', metric: 'energy',
      durations: [1, 4000], singleDuration: 4001, zeroAt: at(2980, '4', '5'),
      total: rational(14904, 5), second: rational(14899, 5), healthElapsed: null,
      state: initialState(70, 69), after: { health: 100, satiety: 1, energy: 0, active_conditions: [] } }
  ]) {
    await t.test(entry.name, async (caseTest) => {
      const candidate = coincidentBoundary(entry.zeroAt);
      const state = withCandidate(entry.state, candidate);
      const single = await runRoot(bundle, state, [entry.singleDuration],
        await temporalAdvance(bundle.profile, candidate));
      const split = await runRoot(bundle, state, entry.durations,
        await temporalAdvance(bundle.profile, candidate));
      await caseTest.test('single exact interval: positive control', () => {
        assert.deepEqual(buildTurnStepPreparedTimeUpdate(single.prepared_effect_ledger)
          .exact_elapsed.exact_minutes, entry.total);
        assert.deepEqual(single.prepared_effect_ledger.slices.at(-1)
          .time_update.clock_after, entry.zeroAt);
        assert.deepEqual(buildTurnStepPreparedBodyUpdate(single.prepared_effect_ledger,
          state.body_state).state_after, entry.after);
        assertCoincidentBatch(single, state, candidate, entry);
      });
      assert.equal(split.prepared_effect_ledger.slices.length, 2,
        'both intervals belong to one root ledger, without a scalar reload');
      await caseTest.test('exact elapsed and clock', () => {
        assert.deepEqual(buildTurnStepPreparedTimeUpdate(split.prepared_effect_ledger)
          .exact_elapsed.exact_minutes, entry.total);
        assert.deepEqual(split.prepared_effect_ledger.slices[1].time_update
          .exact_elapsed.exact_minutes, entry.second);
        assert.deepEqual(split.prepared_effect_ledger.slices[1].time_update.clock_after,
          entry.zeroAt);
      });
      await caseTest.test('body and independent starvation elapsed', () => {
        const update = buildTurnStepPreparedBodyUpdate(split.prepared_effect_ledger,
          state.body_state);
        assert.deepEqual(update.state_after, entry.after);
        const health = update.proposal.component_proposals.filter((proposal) =>
          proposal.metric_changes[0].metric === 'health');
        if (entry.healthElapsed === null) assert.deepEqual(health, []);
        else {
          assert.equal(health.length, 1);
          // satiety zero = 70*216/5 = 3024; harm only for 3456-3024=432.
          assert.deepEqual(health[0].exact_elapsed, entry.healthElapsed);
          assert.deepEqual(health[0].metric_changes[0].amount, rational(10));
        }
      });
      await caseTest.test('coincident event and body crossing execute in one batch', () => {
        assertCoincidentBatch(split, state, candidate, entry);
      });
    });
  }
});

function assertCoincidentBatch(loop, state, candidate, entry) {
  const expectedIds = [candidate.boundary_id,
    `body-threshold:${state.actor_id}:${entry.metric}-0`].sort();
  const batches = loop.prepared_effect_ledger.slices.flatMap((slice) =>
    (slice.time_update.temporal_results ?? []).flatMap((temporal) =>
      temporal.combined_change_set.time_slice_results));
  const batch = batches.find((slice) => canonicalDigest(slice.clock_after)
    === canonicalDigest(entry.zeroAt));
  assert.ok(batch, 'the exact threshold timestamp must be visited');
  assert.deepEqual(batch.processed_boundary_refs.map(({ entity_id }) =>
    entity_id).sort(), expectedIds,
  'a tiny scalar drift must not move the body crossing out of its same-time batch');
}

test('r5: history and readback recompute exact amounts and source pins', async (t) => {
  const bundle = await approvedBundle();
  const state = initialState();
  const prepared = commitInput(await runRoot(bundle, state, [1]), state);
  // Exercise history independently of prepared authority and ledger digest guards.
  const input = rawHistoryInput(prepared);
  const original = makeHistory(bundle, input);
  await t.test('unchanged approved owner proposal', async () => {
    assert.doesNotThrow(() => validateHistory(bundle, input));
    await readback(bundle, input, original.snapshot);
  });
  for (const name of ['amount +1e-9', 'source profile digest']) {
    const forged = { ...input, envelope: structuredClone(input.envelope),
      factual: structuredClone(input.factual) };
    const proposal = forged.envelope.body_update.proposal;
    if (name === 'amount +1e-9') {
      const amount = proposal.component_proposals[0].metric_changes[0].amount;
      Object.assign(amount, plusOneBillionth(amount));
      const replay = applyBodyTimeEffectProposals(state.body_state,
        proposal.component_proposals);
      assert.equal(replay.ok, true);
      assert.deepEqual(replay.state_after, input.envelope.body_update.state_after,
        'exact forgery preserves every rounded scalar');
      proposal.exact_changes = replay.exact_changes;
    } else proposal.component_proposals[0].profile_pin.digest = 'f'.repeat(64);
    forged.factual = structuredClone(forged.envelope);
    await t.test(`${name}: history rejects`, () => {
      assert.throws(() => validateHistory(bundle, forged), {
        code: 'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED'
      }, 'authentic binding pin cannot approve a different source amount or digest');
      assert.throws(() => makeHistory(bundle, forged), {
        code: 'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED'
      });
    });
    await t.test(`${name}: independently consistent readback rejects`, async () => {
      const record = synchronizedHistoryRecord(original.snapshot, proposal);
      await assert.rejects(() => readback(bundle, forged, record), {
        code: 'TRACE_PHASE_2_SESSION_READ_INVALID'
      }, 'matching history/row digests do not replace approved source-profile validation');
    });
  }
});

async function approvedBundle() {
  const profile = await loadTargetBodyNeedsProfile({ rootDir,
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001' });
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  const catalog = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json',
    import.meta.url), 'utf8'));
  const profiles = catalog.profiles.turn_step;
  const pin = { artifact_id: profiles.profile_set_id, revision: profiles.revision,
    digest: canonicalDigest(profiles) };
  const owners = createLowerDvinaTraceTurnStepGenericOwners({ profiles,
    artifactPin: pin, selectedProfilePin: pin, bodyTimeEffectAdapter: adapter });
  return { profile, adapter, owners };
}

function initialState(satiety = 70, energy = 80) {
  return { party_id: 'party-r5', actor_id: 'actor-r5', clock: at(0), items: [],
    party_state: { state_version: 1, turn_number: 1 },
    body_state: { health: 100, satiety, energy, active_conditions: [] },
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight', weather_state: { weather_state_id: 'clear' } },
    npcs: [], npc_schedule_runtime: [], local_fire_runtime: [], temporal_boundary_candidates: [],
    temporal_source_proof: { schema: 'lower_dvina_trace_temporal_source_proof', version: 2,
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      pending_event_count: 0, active_schedule_count: 0, candidate_count: 0, candidates: [],
      admission_policy: 'pass_exact_candidates_to_temporal_activity_owner' } };
}

async function runRoot(bundle, state, durations, advance = null) {
  const runtime = createLowerDvinaTraceTurnStepRuntimePorts({ committedState: state,
    semanticActivityOwner: bundle.owners.semanticActivityOwner,
    bodyEffect: bundle.owners.bodyEffect,
    workingProjectionAuthority: { admit: (value) => structuredClone(value) },
    temporalAdvance: advance ?? (async ({ clock_before, exact_elapsed }) => ({ clock_before,
      clock_after: addElapsedTime(clock_before, exact_elapsed), exact_elapsed,
      nearest_boundary: null, temporal_results: [] })) });
  return runTurnStepLoop({ requestId: 'request:r5', rootTurnId: 'turn:r5',
    committedStateVersion: state.party_state.state_version,
    rootPlayerAction: 'Наблюдаю за берегом.', actor: { actor_id: state.actor_id, body: state.body_state },
    initialWorkingProjection: { actor_id: state.actor_id, clock: state.clock }, maxInternalSteps: 8 }, {
    executionRegistry: runtime.executionRegistry,
    preparedEffectContext: runtime.preparedEffectContext,
    preparedEffectTimeOwner: runtime.preparedEffectTimeOwner,
    preparedEffectBodyOwner: runtime.preparedEffectBodyOwner,
    preparedEffectProjectionOwner: runtime.preparedEffectProjectionOwner,
    projectPlayerSafeState: async ({ working_projection }) => working_projection,
    revalidateCommittedState: async () => ({ state_version: state.party_state.state_version }),
    turnStepModel: (request) => directPlan(request, {
      activity: { owner: 'semantic', duration_class: durations[request.step_index - 1] === 1
        ? 'moment' : 'extended', effort: 'none',
      requested_duration_minutes: durations[request.step_index - 1] },
      ...(request.step_index < durations.length ? { goal_result: 'pending', continuation: {
        remaining_intent: `Продолжить наблюдение ${request.step_index}.`, depends_on_refs: [] } } : {})
    })
  });
}

function commitInput(loop, state) {
  const ledger = loop.prepared_effect_ledger;
  assert.ok(ledger, 'the real prepared loop must produce a ledger');
  const consequence = bindTurnStepPreparedConsequence(
    buildTurnStepDraftConsequence({ loop_result: loop }), ledger);
  const envelope = { root_turn_id: ledger.root_turn_id,
    base_state_version: ledger.committed_state_version, consequence,
    time_update: buildTurnStepPreparedTimeUpdate(ledger),
    body_update: buildTurnStepPreparedBodyUpdate(ledger, state.body_state),
    player_input: null, mode_resolution: null,
    loop_trace: { step_traces: loop.step_traces,
      completed_steps: loop.completed_steps, clarification: loop.clarification } };
  const batch = { root_turn_id: ledger.root_turn_id,
    committed_state_version: ledger.committed_state_version,
    operations: ledger.slices.map((slice) => ({ target: 'party_events', value: {
      ...slice.consequence.state_changes.find(({ kind }) => kind === 'semantic_activity'),
      step_index: slice.step_index, profile_ref: slice.owner_ref,
      duration_minutes: slice.consequence.duration_minutes } })) };
  return { state, batch, envelope, factual: structuredClone(envelope) };
}

function rawHistoryInput(input) {
  const envelope = structuredClone(input.envelope);
  delete envelope.time_update.prepared_effect_ledger;
  for (const key of ['time_update', 'body_update', 'consequence'])
    delete envelope[key].prepared_effect_ledger_digest;
  return { ...input, envelope, factual: structuredClone(envelope) };
}

function historyInput(bundle, input) {
  const slices = input.envelope.time_update.prepared_effect_ledger?.slices ?? [];
  return { partyId: input.state.party_id, state: input.state,
    ...preparedBodyHistoryInput({ factual: input.factual, batch: input.batch, bodySlices: slices }),
    changeSetId: 'change:r5', idemId: 'idem:r5',
    trustedBodyNeedsBindingPin: bundle.adapter.trustedBindingPin,
    // Trusted loaded source context for r5 replay; legacy APIs currently ignore it.
    trustedBodyNeedsProfile: bundle.profile };
}
function makeHistory(bundle, input) { return prepareTurnStepBodyHistory(historyInput(bundle, input)); }
function validateHistory(bundle, input) { return validateTurnStepBodyTimeProposal(historyInput(bundle, input)); }

async function readback(bundle, input, record) {
  const body = input.envelope.body_update.state_after;
  const payload = { party_id: input.state.party_id, actor_id: input.state.actor_id,
    party_state: { state_version: 2, body_state_version: 2 }, body_state: body,
    turn_step_body_history: [record], last_turn: { turn_step_commit: input.envelope,
      turn_step_operation_batch: input.batch, turn_step_idempotency_record_id: 'idem:r5',
      visible_package: { change_set_id: 'change:r5' } } };
  const row = { body_state_version: '2', body_health: String(body.health),
    body_energy: String(body.energy), body_satiety: String(body.satiety),
    body_updated_change_set_id: 'change:r5' };
  const pool = { async query(sql) {
    if (sql.includes('party_body_temporal_history')) return { rows: [structuredClone(record)] };
    if (sql.includes('party_state_snapshots')) return { rows: [{
      state_payload: structuredClone(input.state), state_digest: canonicalDigest(input.state)
    }] };
    throw new Error('unexpected readback query');
  } };
  return assertTurnStepBodyHistoryRows(pool, payload, row,
    bundle.adapter.trustedBindingPin, bundle.profile);
}

function synchronizedHistoryRecord(original, proposal) {
  const record = structuredClone(original);
  const effect = record.effect_ref;
  effect.proposal_digest = canonicalDigest(proposal);
  effect.exact_changes_digest = canonicalDigest(proposal.exact_changes);
  effect.profile_pins = [...new Map(proposal.component_proposals.map(({ profile_pin }) =>
    [canonicalDigest(profile_pin), profile_pin])).values(),
  ...proposal.fixed_effect_proposals.map(({ profile_pin }) => profile_pin)];
  for (const activity of effect.component_effects) {
    activity.profile_effects = proposal.component_proposals.filter(({ activity_id }) =>
      activity_id === activity.component_ref).map((component) => ({
        profile_ref: component.profile_ref, time_effect_policy_ref: component.time_effect_policy_ref,
        profile_pin: component.profile_pin, proposal_digest: canonicalDigest(component) }));
  }
  return record;
}

function coincidentBoundary(timestamp) {
  return { boundary_id: 'boundary:r5:coincident', boundary_kind: 'exact_timer',
    scheduled_at: timestamp, source_ref: ref('party_route_plan_execution_event', 'timer:r5'),
    primary_subject_ref: ref('actor', 'actor-r5'), subject_refs: [], scope_ref: ref('party', 'party-r5'),
    rule_ref: versioned('action_contract', 'rule:r5-coincident'),
    policy_ref: versioned('activity_contract', 'policy:r5-coincident'),
    preconditions_digest: 'a'.repeat(64), resolution_class: 'execution_outcome',
    interrupt_effect: 'background', visibility_policy_ref: versioned('visibility_modifier', 'visible:r5'),
    idempotency_key: 'timer:r5:coincident', causal_parent_refs: [] };
}
function withCandidate(state, candidate) {
  return { ...structuredClone(state), temporal_boundary_candidates: [candidate],
    temporal_source_proof: { ...state.temporal_source_proof, candidate_count: 1, candidates: [candidate] } };
}
async function temporalAdvance(profile, candidate) {
  let ports;
  createTraceTurnRuntime({
    partyPool: { query() { throw new Error('unexpected database query'); }, connect() {} },
    committer: { commit() { throw new Error('unexpected database commit'); } }, env: {},
    config: { traceTurnDecisionSecret: 'r5-test-fixture-key', llmTurnBudget: {},
      llmDiagnostics: { telemetry: null, turnBudget: {} }, temporalBoundaryRegistrations: [{
        rule_ref: candidate.rule_ref, policy_ref: candidate.policy_ref,
        resolve(_candidate, { projection }) { return { disposition: 'execute', proposals: [],
          state_projection: projection, follow_up_candidates: [], stop_after_current_batch: false }; }
      }] },
    ordinaryMaterializationProfile: null, ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: null, actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null, bodyNeedsProfile: profile, worldKnowledge: null,
    createNpcRuntimePorts: () => ({}),
    createNarrationService: () => ({ run() { throw new Error('unexpected model call'); } }),
    createPhase2RuntimeFactory: (input) => { ports = input; return {}; }
  });
  return createTracePhase2TemporalAdvance({ contracts: { activity: {
    nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
  temporalAdvanceOwner: ports.temporalAdvanceOwner, bodyTimeEffectAdapter: ports.bodyTimeEffectAdapter });
}

function plusOneBillionth(value) {
  let numerator = BigInt(value.numerator) * 1000000000n + BigInt(value.denominator);
  let denominator = BigInt(value.denominator) * 1000000000n;
  let a = numerator, b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return rational(numerator / a, denominator / a);
}
