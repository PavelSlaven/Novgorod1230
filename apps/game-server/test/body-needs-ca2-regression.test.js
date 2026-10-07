import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBodyTimeEffectProposals } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedEffectLedger } from '@rus/turn';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter, deriveTrustedBodyNeedsBindingPin } from
  '../src/runtime/body-needs-temporal.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { buildTurnStepBodyEffectRef } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';

// D102: sol regressions for REVIEW-body-needs-bind-ca2, before production fixes.
// Actual approved profiles and owners; no database, model or provider calls.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const rational = (value) => ({ numerator: String(value), denominator: '1' });
const at = (value) => ({ whole_minutes: String(value),
  subminute_numerator: '0', subminute_denominator: '1' });
const reference = (entity_kind, entity_id) => ({ entity_kind, entity_id });

test('BNB2-01: extreme fixed health loss survives prepared body aggregation and history replay', async () => {
  const profile = await loadTargetBodyNeedsProfile({ rootDir, worldRevisionId });
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  const catalog = JSON.parse(await readFile(resolve(rootDir,
    'data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json'), 'utf8'));
  const profiles = catalog.profiles.turn_step;
  const pin = { artifact_id: profiles.profile_set_id, revision: profiles.revision,
    digest: canonicalDigest(profiles) };
  const owners = createLowerDvinaTraceTurnStepGenericOwners({ profiles,
    artifactPin: pin, selectedProfilePin: pin, bodyTimeEffectAdapter: adapter });
  const state = initialState({ health: 100, satiety: 80, energy: 70,
    active_conditions: [] });
  const activity = { owner: 'semantic', duration_class: 'moment', effort: 'extreme',
    requested_duration_minutes: 1 };
  const selected = owners.semanticActivityOwner.resolve({ activity,
    actor: { body: state.body_state } });
  const activityId = 'activity:ca2-extreme';
  const consequence = { body_effect_ref: selected.body_effect_ref, duration_minutes: 1,
    state_changes: [{ kind: 'semantic_activity', activity_id: activityId, effort: 'extreme',
      body_effect_profile_ref: selected.body_effect_profile_ref, profile_pin: selected.profile_pin,
      body_effect_context: { kind: 'semantic_activity', duration_class: 'moment', effort: 'extreme' } }] };
  const timeUpdate = { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
    clock_before: state.clock, clock_after: at(1),
    exact_elapsed: { exact_minutes: rational(1) }, nearest_boundary: null };
  const ownerUpdate = owners.bodyEffect.apply({ committed_state: state,
    consequence, time_update: timeUpdate });
  assert.equal(ownerUpdate.state_after.health, 99, 'the approved extreme owner charges health -1');
  assert.ok(ownerUpdate.state_after.satiety < state.body_state.satiety);
  assert.ok(ownerUpdate.state_after.energy < state.body_state.energy);
  const effect = { step_index: 1, effect_kind: 'semantic_activity',
    owner_ref: selected.profile_ref, operation_ref: activityId, availability: null,
    consequence, time_update: timeUpdate,
    body_update: { version: 1, schema: 'turn_body_update', ...ownerUpdate },
    body_state_before: state.body_state };
  const rootTurnId = 'turn:ca2-extreme';
  const ledger = buildTurnStepPreparedEffectLedger({ rootTurnId,
    committedStateVersion: 1, effects: [{ effect,
      working_projection_before: { clock: state.clock },
      working_projection_after: { clock: at(1) } }] });
  const aggregate = buildTurnStepPreparedBodyUpdate(ledger, state.body_state);
  assert.deepEqual(aggregate.proposal.fixed_effect_proposals,
    ownerUpdate.proposal.fixed_effect_proposals);
  assert.deepEqual(aggregate.proposal.component_proposals,
    ownerUpdate.proposal.component_proposals);
  const history = (bodyUpdate) => {
    try {
      buildTurnStepBodyEffectRef({ factual: { body_update: bodyUpdate,
        consequence, time_update: timeUpdate },
      batch: { root_turn_id: rootTurnId, operations: [] }, state,
      trustedBodyNeedsBindingPin: adapter.trustedBindingPin });
      return { accepted: true, code: null };
    } catch (error) {
      return { accepted: false, code: error.code };
    }
  };
  assert.deepEqual(history(ownerUpdate), { accepted: true, code: null });
  assert.deepEqual({ state_after: aggregate.state_after, history: history(aggregate) },
    { state_after: ownerUpdate.state_after, history: { accepted: true, code: null } },
    'the ledger must preserve fixed and continuous owner results and permit history replay');
});

test('BNB2-02: energy zero blocks the next wait; satiety zero continues with approved harm', async () => {
  const profile = await loadTargetBodyNeedsProfile({ rootDir, worldRevisionId });
  const ports = runtimePorts(profile);
  const advance = createTracePhase2TemporalAdvance({ contracts: { activity: {
    nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
  bodyTimeEffectAdapter: ports.bodyTimeEffectAdapter,
  temporalAdvanceOwner: ports.temporalAdvanceOwner });
  const wait = (state, minutes) => advance({ clock_before: state.clock,
    exact_elapsed: { exact_minutes: rational(minutes) }, effect_kind: 'semantic_activity',
    consequence: { state_changes: [{ kind: 'semantic_activity',
      activity_id: 'activity:ca2-wait', effort: 'none' }] }, relevant_state: state });
  const initial = initialState({ health: 100, satiety: 80, energy: 70, active_conditions: [] });
  const first = await wait(initial, 3024);
  assert.deepEqual(first.exact_elapsed.exact_minutes, rational(3024));
  assert.equal(first.temporal_results[0].temporal_status, 'completed');
  const afterFirst = bodyAfter(initial, first, ports.bodyTimeEffectAdapter);
  assert.deepEqual(afterFirst, { health: 100, satiety: 10, energy: 0, active_conditions: [] });
  const afterZeroAtEnd = { ...initial, clock: first.clock_after, body_state: afterFirst,
    party_state: { state_version: 2, turn_number: 2 } };
  const scenarios = [afterZeroAtEnd,
    initialState({ health: 100, satiety: 80, energy: 0, active_conditions: [] })];
  const actual = [];
  for (const state of scenarios) {
    const result = await wait(state, 60);
    const temporal = result.temporal_results?.[0];
    actual.push({ elapsed: result.exact_elapsed.exact_minutes,
      clock_after: result.clock_after, status: temporal?.temporal_status ?? null,
      gap: temporal?.combined_change_set.proposals.some(
        (proposal) => proposal.reason_code === 'event_effect_gap') ?? false,
      body: bodyAfter(state, result, ports.bodyTimeEffectAdapter) });
  }
  assert.deepEqual(actual, scenarios.map((state) => ({ elapsed: rational(0),
    clock_after: state.clock, status: 'paused', gap: true, body: state.body_state })),
  'already-zero energy permits no positive elapsed without its consequence handler');

  const starving = initialState({ health: 100, satiety: 0, energy: 80,
    active_conditions: [] });
  const result = await wait(starving, 60);
  assert.deepEqual(result.exact_elapsed.exact_minutes, rational(60));
  assert.deepEqual(result.clock_after, at(60));
  assert.notEqual(result.temporal_results?.[0]?.temporal_status, 'paused');
  assert.equal(result.temporal_results?.[0]?.trace.stopped_after_current_batch ?? false, false);
  assert.equal(result.temporal_results?.[0]?.combined_change_set.proposals.some(
    (proposal) => proposal.reason_code === 'event_effect_gap') ?? false, false);
  assert.equal(result.boundary_trace.evaluated_candidate_count, 0,
    'satiety already zero must not emit a start-of-window candidate');
  assert.deepEqual(bodyAfter(starving, result, ports.bodyTimeEffectAdapter), {
    health: 98.611111, satiety: 0, energy: 78.611111, active_conditions: []
  }, 'the approved 25/18 hourly starvation harm starts in the first minute');
});

test('BNB2-03: the real loader without an attestation disables adapter and trusted pin', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'body-needs-ca2-no-attestation-'));
  try {
    for (const path of [
      'data/world-catalogs/novgorod/live-world-runtime-v17/body-needs-binding.v1.json',
      'data/world-catalogs/novgorod/temporal-v4/datasets/body_time_effect_profiles_thresholds.json',
      'data/world-catalogs/novgorod/temporal-v4/approvals/body_time_effect_profiles_thresholds.json'
    ]) {
      const destination = resolve(temporaryRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(rootDir, path), destination);
    }
    const disabled = await loadTargetBodyNeedsProfile({ rootDir: temporaryRoot, worldRevisionId });
    assert.deepEqual([disabled.approved, disabled.import_authorized,
      disabled.activation_authorized, disabled.approval_attestation], [false, false, false, null]);
    assert.equal(runtimePorts(disabled).bodyTimeEffectAdapter, null);
    const enabled = await loadTargetBodyNeedsProfile({ rootDir, worldRevisionId });
    assert.deepEqual(deriveTrustedBodyNeedsBindingPin(enabled),
      createBodyNeedsTemporalAdapter({ body_needs_profile: enabled }).trustedBindingPin);
    assert.throws(() => deriveTrustedBodyNeedsBindingPin({ ...enabled,
      approval_attestation: null }), TypeError, 'an enabled malformed approval remains strict');
    assert.equal(deriveTrustedBodyNeedsBindingPin(disabled), null,
      'the lawful disabled profile must return before strict attestation validation');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function bodyAfter(state, result, adapter) {
  // This temporal-only seam charges the body only for positive elapsed:
  // @rus/body-state rejects zero-duration continuous proposals.
  if (result.exact_elapsed.exact_minutes.numerator === '0') {
    return structuredClone(state.body_state);
  }
  const calculated = adapter.calculateProposals({ effort: 'none',
    exact_elapsed: result.exact_elapsed.exact_minutes, body_state: state.body_state,
    body_state_ref: reference('body_state', state.actor_id),
    scope_ref: reference('party', state.party_id), environment_fact: state.environment_snapshot,
    party_id: state.party_id, state_version: state.party_state.state_version,
    observed_at: state.clock, active_conditions: state.body_state.active_conditions });
  assert.equal(calculated.ok, true);
  const applied = applyBodyTimeEffectProposals(state.body_state, calculated.proposals);
  assert.equal(applied.ok, true);
  return applied.state_after;
}

function initialState(body_state) {
  return { party_id: 'party-ca2', actor_id: 'actor-ca2',
    party_state: { state_version: 1, turn_number: 1 }, clock: at(0), body_state,
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
    config: { traceTurnDecisionSecret: 'ca2-test-fixture-key', llmTurnBudget: {},
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
