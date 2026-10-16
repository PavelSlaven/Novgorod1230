import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyBodyTimeEffectProposals } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedEffectLedger } from '@rus/turn';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { preparedBodyHistoryInput, prepareTurnStepBodyHistory } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { validateBodyComponentOrder } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-commit-validation.js';

// D102: sol regressions for REVIEW-body-needs-bind-dot1, before production fixes.
// Production owners and approved profiles; no database or model calls.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const rational = (minutes) => ({ numerator: String(minutes), denominator: '1' });
const at = (minutes, numerator = '0', denominator = '1') => ({
  whole_minutes: String(minutes), subminute_numerator: numerator,
  subminute_denominator: denominator });

test('dot1-04: ordinary waits resolve exact fractional body thresholds', async (t) => {
  const profile = await loadTargetBodyNeedsProfile({ rootDir,
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001' });
  const ports = runtimePorts(profile);
  await t.test('integer threshold control', async () => {
    const state = initialState(70, 80);
    const result = await wait(ports, state, 1000, at(864));
    assert.deepEqual(bodyAfter(ports.bodyTimeEffectAdapter, state, result), {
      health: 100, satiety: 46.851852, energy: 56.851852, active_conditions: [] });
  });
  await t.test('initial satiety 69', async () => {
    const state = initialState(69, 80);
    const result = await wait(ports, state, 1000, at(820, '4', '5'));
    assert.deepEqual(bodyAfter(ports.bodyTimeEffectAdapter, state, result), {
      health: 100, satiety: 45.851852, energy: 56.851852, active_conditions: [] });
  });
  await t.test('one minute then saved scalar state', async () => {
    const initial = initialState(70, 80);
    const first = await wait(ports, initial, 1);
    const savedBody = bodyAfter(ports.bodyTimeEffectAdapter, initial, first);
    assert.deepEqual(savedBody, { health: 100, satiety: 69.976852,
      energy: 79.976852, active_conditions: [] });
    // Round-trip the real owner's persisted scalar DTO. This is not a PG reload.
    const state = JSON.parse(JSON.stringify({ ...initial, clock: first.clock_after,
      body_state: savedBody, party_state: { state_version: 2, turn_number: 2 } }));
    const result = await wait(ports, state, 1000, at(864, '1', '156250'));
    assert.deepEqual(bodyAfter(ports.bodyTimeEffectAdapter, state, result), {
      health: 100, satiety: 46.828704, energy: 56.828704, active_conditions: [] });
  });
});

test('dot1-05: history and commit replay two real body substeps in causal order', async () => {
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
  const state = initialState(70, 80);
  const rootTurnId = 'turn:dot1-body-chain';
  const effects = [];
  let current = state;
  for (let index = 1; index <= 2; index += 1) {
    const activity = { owner: 'semantic', duration_class: 'moment', effort: 'none',
      requested_duration_minutes: 1 };
    const selected = owners.semanticActivityOwner.resolve({ activity,
      actor: { body: current.body_state } });
    const activityId = `activity:dot1-body-${index}`;
    const consequence = { body_effect_ref: selected.body_effect_ref, duration_minutes: 1,
      state_changes: [{ kind: 'semantic_activity', activity_id: activityId, effort: 'none',
        body_effect_profile_ref: selected.body_effect_profile_ref, profile_pin: selected.profile_pin,
        body_effect_context: { kind: 'semantic_activity', duration_class: 'moment', effort: 'none' } }] };
    const timeUpdate = time(current.clock, at(index), 1);
    const update = owners.bodyEffect.apply({ committed_state: current,
      consequence, time_update: timeUpdate });
    assert.equal(update.applied, true);
    assert.deepEqual(update.proposal.fixed_effect_proposals[0].exact_deltas,
      { health: 0, satiety: 0, energy: 0 }, 'this regression is independent of extreme health loss');
    assert.deepEqual(update.proposal.fixed_effect_proposals[0].state_after,
      current.body_state, 'the next fixed step starts after the preceding continuous effect');
    const effect = { step_index: index, effect_kind: 'semantic_activity',
      owner_ref: selected.profile_ref, operation_ref: activityId, availability: null,
      consequence, time_update: timeUpdate,
      body_update: { version: 1, schema: 'turn_body_update', ...update },
      body_state_before: current.body_state };
    // A single real owner slice is accepted by both existing validators.
    const singleBatch = { root_turn_id: rootTurnId, operations: [event(activityId)] };
    const singleFactual = { consequence, time_update: timeUpdate, body_update: effect.body_update };
    validateBodyComponentOrder(singleBatch, singleFactual, current, adapter.trustedBindingPin,
      adapter.trustedBodyNeedsProfile);
    prepareTurnStepBodyHistory({ partyId: state.party_id, state: current, factual: singleFactual,
      batch: singleBatch, changeSetId: 'change:dot1', idemId: 'idem:dot1',
      trustedBodyNeedsBindingPin: adapter.trustedBindingPin,
      trustedBodyNeedsProfile: adapter.trustedBodyNeedsProfile });
    effects.push({ effect, working_projection_before: { clock: current.clock },
      working_projection_after: { clock: at(index) } });
    current = { ...current, clock: at(index), body_state: update.state_after };
  }
  const ledger = buildTurnStepPreparedEffectLedger({ rootTurnId,
    committedStateVersion: 1, effects });
  const aggregate = buildTurnStepPreparedBodyUpdate(ledger, state.body_state);
  assert.deepEqual(aggregate.state_after, { health: 100, satiety: 69.953704,
    energy: 79.953704, active_conditions: [] });
  const bodySlices = effects.map(({ effect }) => effect);
  const input = preparedBodyHistoryInput({ bodySlices,
    factual: { consequence: {}, time_update: time(state.clock, current.clock, 2),
      body_update: aggregate },
    batch: { root_turn_id: rootTurnId,
      operations: bodySlices.map(({ operation_ref }) => event(operation_ref)) } });
  const accepted = {};
  for (const [name, check] of Object.entries({
    commit: () => validateBodyComponentOrder(input.batch, input.factual, state,
      adapter.trustedBindingPin, adapter.trustedBodyNeedsProfile),
    history: () => {
      const history = prepareTurnStepBodyHistory({ partyId: state.party_id, state,
        ...input, changeSetId: 'change:dot1', idemId: 'idem:dot1',
        trustedBodyNeedsBindingPin: adapter.trustedBindingPin,
        trustedBodyNeedsProfile: adapter.trustedBodyNeedsProfile });
      assert.equal(history.snapshot.effect_ref.state_after_digest,
        canonicalDigest(aggregate.state_after));
      assert.deepEqual(history.snapshot.effect_ref.component_effects.map(
        ({ component_ref }) => component_ref), bodySlices.map(({ operation_ref }) => operation_ref));
    }
  })) {
    try { check(); accepted[name] = true; }
    catch (error) { accepted[name] = { code: error.code, reason: error.details?.reason }; }
  }
  assert.deepEqual(accepted, { commit: true, history: true },
    'both validators must accept fixed → continuous → fixed → continuous owner replay');
});

function event(activityId) {
  return { target: 'party_events', value: { activity_id: activityId } };
}

function time(before, after, minutes) {
  return { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
    clock_before: before, clock_after: after, exact_elapsed: { exact_minutes: rational(minutes) },
    nearest_boundary: null };
}

async function wait(ports, state, minutes, expectedThreshold) {
  const advance = createTracePhase2TemporalAdvance({ contracts: { activity: {
    nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
  bodyTimeEffectAdapter: ports.bodyTimeEffectAdapter,
  temporalAdvanceOwner: { advance(input) {
    if (expectedThreshold) assert.ok(input.source_candidates.some(({ scheduled_at }) =>
      canonicalDigest(scheduled_at) === canonicalDigest(expectedThreshold)),
    'the approved body owner predicts the exact crossing without minute rounding');
    return ports.temporalAdvanceOwner.advance(input);
  } } });
  const result = await advance({ clock_before: state.clock,
    exact_elapsed: { exact_minutes: rational(minutes) }, effect_kind: 'semantic_activity',
    consequence: { state_changes: [{ kind: 'semantic_activity',
      activity_id: 'activity:dot1-wait', effort: 'none' }] }, relevant_state: state });
  assert.deepEqual(result.exact_elapsed.exact_minutes, rational(minutes));
  if (expectedThreshold) {
    const temporal = result.temporal_results[0];
    assert.equal(temporal.temporal_status, 'completed');
    assert.ok(temporal.combined_change_set.time_slice_results.some((slice) =>
      slice.processed_boundary_refs.length > 0
        && canonicalDigest(slice.clock_after) === canonicalDigest(expectedThreshold)),
    'the real temporal owner visits the exact body threshold');
  }
  return result;
}

function bodyAfter(adapter, state, result) {
  const calculated = adapter.calculateProposals({ effort: 'none',
    exact_elapsed: result.exact_elapsed.exact_minutes, body_state: state.body_state,
    body_state_ref: { entity_kind: 'body_state', entity_id: state.actor_id },
    scope_ref: { entity_kind: 'party', entity_id: state.party_id },
    environment_fact: state.environment_snapshot, party_id: state.party_id,
    state_version: state.party_state.state_version, observed_at: state.clock, active_conditions: [] });
  assert.equal(calculated.ok, true);
  const applied = applyBodyTimeEffectProposals(state.body_state, calculated.proposals);
  assert.equal(applied.ok, true);
  return applied.state_after;
}

function initialState(satiety, energy) {
  return { party_id: 'party-dot1', actor_id: 'actor-dot1', clock: at(0),
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

function runtimePorts(bodyNeedsProfile) {
  let ports;
  createTraceTurnRuntime({
    partyPool: { query() { throw new Error('unexpected database query'); }, connect() {} },
    committer: { commit() { throw new Error('unexpected database commit'); } }, env: {},
    config: { traceTurnDecisionSecret: 'dot1-test-fixture-key', llmTurnBudget: {},
      llmDiagnostics: { telemetry: null, turnBudget: {} } },
    ordinaryMaterializationProfile: null, ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: null, actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null, bodyNeedsProfile, worldKnowledge: null,
    createNpcRuntimePorts: () => ({}),
    createNarrationService: () => ({ run() { throw new Error('unexpected model call'); } }),
    createPhase2RuntimeFactory: (input) => { ports = input; return {}; }
  });
  return ports;
}
