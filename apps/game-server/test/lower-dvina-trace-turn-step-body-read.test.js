import assert from 'node:assert/strict';
import test from 'node:test';
import { applyApprovedFixedBodyEffect,
  applyBodyTimeEffectProposals } from '@rus/body-state';
import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedEffectLedger,
  buildTurnStepPreparedTimeUpdate
} from '@rus/turn';
import { prepareTurnStepBodyHistory } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { buildTurnStepBodyEffectRef } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { validateBodyComponentOrder, validateBodyEventCommit } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit-validation.js';
import { assertTurnStepBodyHistoryRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js';
import { loadTargetBodyNeedsProfile } from
  '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from
  '../src/runtime/body-needs-temporal.js';
import { validatePreparedSemanticSlices } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-authority.js';

test('M1 body temporal write round-trips exact owner and causal bindings',
  async () => {
    const factual = bodyCommit();
    const prepared = prepareTurnStepBodyHistory({
      partyId: 'p', state: state(), factual,
      batch: { root_turn_id: 'turn:p:1' },
      changeSetId: 'change-1', idemId: 'idem-1'
    });
    const payload = restartPayload(prepared.snapshot, factual);
    await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), payload, bodyRow()
    ));
    for (const tamper of [
      (row) => { row.effect_ref.component_effects[0].profile_ref = 'forged'; },
      (row) => { row.change_set_id = 'change-forged'; },
      (row) => { row.idempotency_record_id = 'idem-forged'; },
      (row) => { row.occurred_at_whole_minutes = '21'; },
      (row) => { row.subject_id = 'actor-forged'; }
    ]) {
      const row = structuredClone(prepared.snapshot);
      tamper(row);
      await assert.rejects(() => assertTurnStepBodyHistoryRows(
        pool([row]), payload, bodyRow()
      ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    }
  });

test('M1 autonomous semantic activity keeps the player body owner', async () => {
  const factual = bodyCommit();
  factual.consequence.phase7 = { autonomous: { request: {
    npc_ref: 'npc-1'
  } } };
  const batch = { root_turn_id: 'turn:p:1', operations: [] };
  const prepared = prepareTurnStepBodyHistory({
    partyId: 'p', state: state(), factual, batch,
    changeSetId: 'change-1', idemId: 'idem-1'
  });
  assert.equal(prepared.snapshot.subject_kind, 'player_character');
  assert.equal(prepared.snapshot.subject_id, 'actor-1');
  const payload = restartPayload(prepared.snapshot, factual);
  payload.npcs = [{ instance_id: 'npc-1' }];
  payload.last_turn.turn_step_operation_batch = batch;
  await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
    pool([structuredClone(prepared.snapshot)]), payload, bodyRow()
  ));
});

test('M1 body restart cross-binds envelope, snapshot and normalized row',
  async () => {
    const factual = bodyCommit();
    const prepared = prepareTurnStepBodyHistory({
      partyId: 'p', state: state(), factual,
      batch: { root_turn_id: 'turn:p:1' },
      changeSetId: 'change-1', idemId: 'idem-1'
    });
    const expected = restartPayload(prepared.snapshot, factual);
    const normalized = bodyRow();
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), { ...expected, turn_step_body_history: [] }, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedSnapshot = structuredClone(expected);
    forgedSnapshot.body_state.health = 77;
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), forgedSnapshot, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedRow = { ...normalized, body_health: '77' };
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), expected, forgedRow
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedProfile = structuredClone(expected);
    forgedProfile.last_turn.turn_step_commit.body_update.proposal.profile_ref =
      'body:forged';
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), forgedProfile, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 body restart accepts prepared effects owned by the domain writer',
  async () => {
    const factual = preparedBodyCommit();
    const payload = restartPayload(null, factual);
    payload.turn_step_body_history = [];
    await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
      pool([]), payload, bodyRow()
    ));

    const foreignHistory = prepareTurnStepBodyHistory({ partyId: 'p', state: state(), factual: bodyCommit(),
      batch: { root_turn_id: 'turn:p:1' }, changeSetId: 'change-1', idemId: 'idem-1' }).snapshot;
    await assert.rejects(() => assertTurnStepBodyHistoryRows(pool([foreignHistory]),
      { ...payload, turn_step_body_history: [foreignHistory] }, bodyRow()),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

    const tampered = structuredClone(payload);
    tampered.last_turn.turn_step_commit.body_update
      .prepared_effect_ledger_digest = 'b'.repeat(64);
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), tampered, bodyRow()
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

    const missingLedger = structuredClone(payload);
    delete missingLedger.last_turn.turn_step_commit.time_update
      .prepared_effect_ledger;
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), missingLedger, bodyRow()
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 body restart leaves no-batch effects with the domain writer',
  async () => {
    const factual = bodyCommit();
    const prepared = prepareTurnStepBodyHistory({
      partyId: 'p', state: state(), factual,
      batch: { root_turn_id: 'turn:p:1' },
      changeSetId: 'change-1', idemId: 'idem-1'
    });
    const payload = restartPayload(null, factual);
    payload.turn_step_body_history = [];
    delete payload.last_turn.turn_step_operation_batch;
    await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
      pool([]), payload, bodyRow()
    ));

    const forged = structuredClone(payload);
    forged.turn_step_body_history = [prepared.snapshot];
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([prepared.snapshot]), forged, bodyRow()
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

function preparedBodyCommit() {
  const before = { health: 100, satiety: 90, energy: 80 };
  const after = { health: 99, satiety: 90, energy: 80 };
  const clockBefore = { whole_minutes: '19',
    subminute_numerator: '0', subminute_denominator: '1' };
  const clockAfter = { whole_minutes: '20',
    subminute_numerator: '0', subminute_denominator: '1' };
  const ledger = buildTurnStepPreparedEffectLedger({
    rootTurnId: 'turn:p:1',
    committedStateVersion: 1,
    effects: [{
      effect: {
        step_index: 1,
        effect_kind: 'domain_command',
        owner_ref: 'test.domain-owner',
        operation_ref: 'test.operation',
        availability: {},
        consequence: { duration_minutes: 1 },
        time_update: {
          schema: 'turn_time_update',
          clock_before: clockBefore,
          clock_after: clockAfter,
          exact_elapsed: { exact_minutes: {
            numerator: '1', denominator: '1'
          } }
        },
        body_update: {
          schema: 'turn_body_update',
          applied: true,
          proposal: { profile_ref: 'test.body-effect' },
          state_after: after
        },
        body_state_before: before
      },
      working_projection_before: { clock: clockBefore },
      working_projection_after: { clock: clockAfter }
    }]
  });
  return {
    root_turn_id: 'turn:p:1',
    base_state_version: 1,
    consequence: {
      duration_minutes: 1,
      prepared_effect_ledger_digest: ledger.ledger_digest
    },
    body_update: buildTurnStepPreparedBodyUpdate(ledger),
    time_update: buildTurnStepPreparedTimeUpdate(ledger)
  };
}

function bodyCommit() {
  const profilePin = pin();
  const stateAfter = { health: 99, satiety: 90, energy: 80 };
  const component = {
    schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
    profile_ref: 'body:impact:minor', profile_pin: profilePin,
    selected_context: { kind: 'direct_body_event', mechanism: 'impact',
      severity: 'minor', body_part_ref: 'left_arm' },
    exact_deltas: { health: -1, satiety: 0, energy: 0 },
    condition_transitions: [], state_after: stateAfter,
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden'
  };
  return {
    root_turn_id: 'turn:p:1',
    consequence: { body_effect_ref: 'body:composite', state_changes: [{
      kind: 'direct_body_event', operation_id: 'body-op',
      body_effect_profile_ref: component.profile_ref,
      profile_pin: profilePin,
      body_effect_context: component.selected_context
    }] },
    body_update: { applied: true, proposal: {
      schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
      profile_ref: 'body:composite', profile_pin: profilePin,
      component_proposals: [component],
      exact_deltas: component.exact_deltas,
      selection_policy: 'ordered_committed_step_components',
      rng_consumption: 'forbidden'
    }, state_after: stateAfter },
    time_update: { clock_after: { whole_minutes: '20',
      subminute_numerator: '0', subminute_denominator: '1' } }
  };
}

function restartPayload(history, envelope) {
  return { party_id: 'p', actor_id: 'actor-1',
    party_state: { body_state_version: 2 },
    body_state: structuredClone(envelope.body_update.state_after),
    turn_step_body_history: [history],
    last_turn: {
      turn_step_commit: envelope,
      turn_step_operation_batch: { root_turn_id: envelope.root_turn_id },
      turn_step_idempotency_record_id: 'idem-1',
      visible_package: { change_set_id: 'change-1' }
    } };
}

function bodyRow() {
  return { body_state_version: '2', body_health: '99', body_energy: '80',
    body_satiety: '90', body_updated_change_set_id: 'change-1' };
}

function state() {
  return { actor_id: 'actor-1', party_state: { turn_number: 3 } };
}

function pin() {
  return { artifact_id: 'owner-profiles', revision: 1,
    digest: '1'.repeat(64) };
}

function pool(rows) {
  return { async query() { return { rows, rowCount: rows.length }; } };
}


test('two moderate semantic activities commit and recover exact body history', async () => {
  const { fixture, loadScenarioBundle } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const { plan, genericCheck } = await import('./lower-dvina-trace-turn-step-runtime-ports-fixture.js');
  const bundle = await loadScenarioBundle(13);
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    turnStepModel: (request) => plan(request, request.step_index === 1 ? {
      goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
      continuation: { remaining_intent: 'Проверяю опору весом тела.', depends_on_refs: [] }
    } : { resolution: 'generic_check', goal_result: 'pending', check: { ...genericCheck(), skill_ref: null },
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' } }) });
  f.state.inventory = { items: [], load_category: 'light', occupied_hands: 0 };
  const input = { request_id: 'two-moderate', idempotency_key: 'two-moderate',
    raw_text: 'Оглядываюсь, затем проверяю опору весом тела.' };
  await f.runtime.submitTurn({ partyId: f.partyId, input });
  const payload = structuredClone(f.state);
  const normalized = { body_state_version: String(payload.party_state.body_state_version),
    body_health: String(payload.body_state.health), body_energy: String(payload.body_state.energy),
    body_satiety: String(payload.body_state.satiety),
    body_updated_change_set_id: payload.last_turn.visible_package.change_set_id };
  const history = payload.turn_step_body_history;
  assert.equal(history.length, 1);
  assert.equal(payload.last_turn.turn_step_commit.time_update.prepared_effect_ledger.slices.length, 2);
  await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(pool(history), payload, normalized));
  await assert.doesNotReject(() => f.runtime.submitTurn({ partyId: f.partyId, input }));
  assert.equal(f.commitCount(), 1);
  for (const tamper of [
    (value) => { value.turn_step_body_history[0].effect_ref.component_effects[0].component_ref = 'wrong-activity'; },
    (value) => { value.last_turn.turn_step_commit.body_update.proposal.exact_deltas.energy -= 1; },
    (value) => { value.last_turn.turn_step_operation_batch.operations = []; },
    (value) => { value.turn_step_body_history = []; }
  ]) {
    const forged = structuredClone(payload); tamper(forged);
    await assert.rejects(() => assertTurnStepBodyHistoryRows(pool(forged.turn_step_body_history), forged, normalized),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
});

test('continuous body readback rejects altered after-state and profile pin', async (t) => {
  const profile = await loadTargetBodyNeedsProfile({
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001'
  });
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  const before = { health: 100, satiety: 60, energy: 80,
    active_conditions: [] };
  const activityId = 'activity-1';
  const exactElapsed = { numerator: '60', denominator: '1' };
  const calculated = adapter.calculateProposals({
    party_id: 'p', state_version: 1,
    observed_at: timestamp(0),
    body_state: Object.fromEntries(Object.entries(before)
      .filter(([metric]) => ['health', 'satiety', 'energy'].includes(metric))
      .map(([metric, value]) =>
        [metric, { numerator: String(value), denominator: '1' }])),
    body_state_ref: { entity_kind: 'body_state', entity_id: 'actor-1' },
    scope_ref: { entity_kind: 'party', entity_id: 'p' },
    environment_fact: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight',
      weather_state: { weather_state_id: 'clear' } },
    active_conditions: [], effort: 'moderate', exact_elapsed: exactElapsed
  });
  assert.equal(calculated.ok, true);
  const componentProposals = calculated.proposals.map((proposal) => ({
    ...proposal, activity_id: activityId, effort: 'moderate'
  }));
  const applied = applyBodyTimeEffectProposals(before, calculated.proposals);
  const fixedContext = { kind: 'semantic_activity', effort: 'moderate' };
  const fixedProfilePin = { artifact_id: 'body:generic', revision: 1,
    digest: 'a'.repeat(64) };
  const fixed = applyApprovedFixedBodyEffect({ body_state: before,
    body_effect_profile: { schema: 'rus.body_state.fixed_approved_effect.v1',
      profile_ref: 'body:generic', profile_pin: fixedProfilePin,
      status: 'approved', applicability: fixedContext,
      exact_deltas: { health: 0, satiety: 0, energy: 0 },
      condition_outcomes: [], selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden' }, selected_context: fixedContext });
  const fixedEffectProposal = { ...fixed.proposal,
    state_after: fixed.state_after };
  const factual = {
    root_turn_id: 'turn:p:1',
    body_update: { applied: true, proposal: {
      proposal_kind: 'body_time_effect_composite',
      fixed_effect_proposals: [fixedEffectProposal],
      component_proposals: componentProposals,
      exact_changes: applied.exact_changes
    }, state_after: applied.state_after },
    consequence: { state_changes: [{ kind: 'semantic_activity',
      activity_id: activityId, effort: 'moderate',
      body_effect_profile_ref: 'body:generic', profile_pin: fixedProfilePin,
      body_effect_context: fixedContext }] },
    time_update: { exact_elapsed: { exact_minutes: exactElapsed },
      clock_after: timestamp(60) }
  };
  const batch = { root_turn_id: 'turn:p:1', operations: [{
    target: 'party_events', value: { activity_id: activityId }
  }] };
  const stateBefore = { actor_id: 'actor-1', body_state: before,
    party_state: { turn_number: 0 } };
  assert.doesNotThrow(() => validateBodyComponentOrder(batch, factual,
    stateBefore, adapter.trustedBindingPin));
  const preparedBodyContext = { kind: 'semantic_activity',
    duration_class: 'brief', effort: 'moderate' };
  const preparedFixedEffect = applyApprovedFixedBodyEffect({
    body_state: before,
    body_effect_profile: { schema: 'rus.body_state.fixed_approved_effect.v1',
      profile_ref: 'body:generic', profile_pin: fixedProfilePin,
      status: 'approved', applicability: preparedBodyContext,
      exact_deltas: { health: 0, satiety: 0, energy: 0 },
      condition_outcomes: [], selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden' },
    selected_context: preparedBodyContext });
  const preparedBodyUpdate = { ...structuredClone(factual.body_update),
    proposal: { ...structuredClone(factual.body_update.proposal),
      fixed_effect_proposals: [{ ...preparedFixedEffect.proposal,
        state_after: preparedFixedEffect.state_after }] } };
  const activityProfilePin = fixedProfilePin;
  const activity = { activity_id: activityId, step_index: 1,
    profile_ref: 'activity:generic', duration_class: 'brief',
    effort: 'moderate', duration_minutes: 60 };
  const preparedBatch = { ...batch, operations: [{ target: 'party_events',
    value: activity }] };
  const preparedSlice = { step_index: 1,
    effect_kind: 'semantic_activity', owner_ref: activity.profile_ref,
    operation_ref: activityId,
    consequence: { ...factual.consequence, duration_minutes: 60,
      state_changes: [{ kind: 'semantic_activity', activity_id: activityId,
        profile_ref: activity.profile_ref, profile_pin: activityProfilePin,
        duration_class: activity.duration_class, effort: activity.effort,
        body_effect_profile_ref: 'body:generic',
        body_effect_context: preparedBodyContext }] },
    time_update: { ...factual.time_update, clock_before: timestamp(0) },
    body_update: preparedBodyUpdate };
  const preparedState = { ...stateBefore, clock: timestamp(0) };
  const preparedOwners = {
    semanticActivityOwner: { resolve: () => ({
      profile_ref: activity.profile_ref, profile_pin: activityProfilePin,
      duration_minutes: activity.duration_minutes,
      body_effect_profile_ref: 'body:generic', body_effect_ref: null }) },
    bodyEffect: { supportsBodyTimeEffects: true,
      apply: () => structuredClone(preparedSlice.body_update) },
    bodyNeedsBindingPin: adapter.trustedBindingPin
  };
  const validatePreparedSlice = (slice) => validatePreparedSemanticSlices({
    ledger: { slices: [slice] }, batch: preparedBatch,
    envelope: { loop_trace: { step_traces: [{ step_index: 1, applied: true,
      plan_request: { player_safe_state: { clock: timestamp(0) } } }] } },
    state: preparedState, turnStepApprovedOwners: preparedOwners
  });
  await t.test('prepared semantic body slices require valid exact elapsed', () => {
    assert.doesNotThrow(() => validatePreparedSlice(preparedSlice));
    for (const tamper of [
      (slice) => { delete slice.time_update.exact_elapsed; },
      (slice) => { slice.time_update.exact_elapsed.exact_minutes.numerator = 'bad'; }
    ]) {
      const invalidSlice = structuredClone(preparedSlice);
      tamper(invalidSlice);
      assert.throws(() => validatePreparedSlice(invalidSlice),
        { code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED' });
    }
  });
  const invalidInternalProposal = structuredClone(factual);
  invalidInternalProposal.body_update.proposal.component_proposals[0]
    .metric_changes[0].metric = 'forged';
  assert.throws(() => validateBodyComponentOrder(batch,
    invalidInternalProposal, stateBefore, adapter.trustedBindingPin),
  (error) => error.code === 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
    && error.details.reason.includes(
      'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED')
    && error.details.reason.includes(
      'continuous ordered component owner is invalid'));
  const extremeBefore = { health: 100, satiety: 0, energy: 80 };
  const extremeContext = { kind: 'semantic_activity', effort: 'extreme' };
  const extremeFixed = applyApprovedFixedBodyEffect({ body_state: extremeBefore,
    body_effect_profile: { schema: 'rus.body_state.fixed_approved_effect.v1',
      profile_ref: 'body:generic', profile_pin: fixedProfilePin,
      status: 'approved', applicability: extremeContext,
      exact_deltas: { health: -1, satiety: 0, energy: 0 },
      condition_outcomes: [], selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden' }, selected_context: extremeContext });
  const directContext = { kind: 'direct_body_event', mechanism: 'wound',
    severity: 'minor', body_part_ref: 'arm' };
  const directPin = { artifact_id: 'body:direct', revision: 1,
    digest: 'b'.repeat(64) };
  const directFixed = applyApprovedFixedBodyEffect({
    body_state: extremeFixed.state_after,
    body_effect_profile: { schema: 'rus.body_state.fixed_approved_effect.v1',
      profile_ref: 'body:direct', profile_pin: directPin,
      status: 'approved', applicability: directContext,
      exact_deltas: { health: 0, satiety: 0, energy: 0 },
      condition_outcomes: [], selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden' }, selected_context: directContext });
  const extremeCalculated = adapter.calculateProposals({
    party_id: 'p', state_version: 1, observed_at: timestamp(0),
    body_state: Object.fromEntries(Object.entries(directFixed.state_after)
      .filter(([key]) => ['health', 'satiety', 'energy'].includes(key))
      .map(([metric, value]) => [metric,
        { numerator: String(value), denominator: '1' }])),
    body_state_ref: { entity_kind: 'body_state', entity_id: 'actor-1' },
    scope_ref: { entity_kind: 'party', entity_id: 'p' },
    environment_fact: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight',
      weather_state: { weather_state_id: 'clear' } },
    active_conditions: [], effort: 'extreme', exact_elapsed: exactElapsed
  });
  const extremeApplied = applyBodyTimeEffectProposals(directFixed.state_after,
    extremeCalculated.proposals);
  const extremeFactual = structuredClone(factual);
  extremeFactual.body_update.state_after = extremeApplied.state_after;
  extremeFactual.body_update.proposal = {
    proposal_kind: 'body_time_effect_composite',
    fixed_effect_proposals: [{ ...extremeFixed.proposal,
      state_after: extremeFixed.state_after },
    { ...directFixed.proposal, state_after: directFixed.state_after }],
    component_proposals: extremeCalculated.proposals.map((proposal) => ({
      ...proposal, activity_id: activityId, effort: 'extreme' })),
    exact_changes: extremeApplied.exact_changes
  };
  extremeFactual.consequence.state_changes[0].effort = 'extreme';
  extremeFactual.consequence.state_changes[0].body_effect_context = extremeContext;
  extremeFactual.consequence.state_changes.push({ kind: 'direct_body_event',
    operation_id: 'body-event-1', body_effect_profile_ref: 'body:direct',
    profile_pin: directPin, body_effect_context: directContext });
  const directPayload = { body_effect_ref: 'body:direct',
    profile_pin: directPin, selected_context: directContext,
    exact_deltas: directFixed.proposal.exact_deltas,
    state_after: directFixed.state_after,
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden' };
  const eventOperation = { operation_id: 'body-event-1', payload: {
    actor_ref: 'actor-1', body_effect_ref: 'body:direct',
    payload: directPayload } };
  extremeFactual.hidden_update = { direct_body_event: directPayload };
  const extremeState = { ...stateBefore, body_state: extremeBefore };
  const extremeBatch = { root_turn_id: 'turn:p:1', operations: [
    ...batch.operations,
    { target: 'party_state', value: { operation_kind: 'apply_body_event',
      operation_id: 'body-event-1', payload: eventOperation.payload } }
  ] };
  assert.doesNotThrow(() => validateBodyComponentOrder(extremeBatch,
    extremeFactual, extremeState, adapter.trustedBindingPin));
  assert.doesNotThrow(() => validateBodyEventCommit(eventOperation,
    extremeFactual, extremeState));
  for (const tamper of [
    (value) => { value.body_update.proposal.component_proposals.pop(); },
    (value) => { value.body_update.proposal.component_proposals[0].activity_id = 'forged'; },
    (value) => { value.body_update.proposal.component_proposals[0]
      .binding_pin.candidate_path += '.forged'; }
  ]) {
    const forged = structuredClone(factual);
    tamper(forged);
    assert.throws(() => validateBodyComponentOrder(batch, forged,
      stateBefore, adapter.trustedBindingPin),
    { code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED' });
  }
  const historyInput = { partyId: 'p',
    state: stateBefore, factual, batch,
    changeSetId: 'change-1', idemId: 'idem-1' };
  assert.throws(() => buildTurnStepBodyEffectRef({ factual, batch,
    state: stateBefore, trustedBodyNeedsBindingPin: null
  }), (error) => error.code ===
    'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED'
      && error.details?.failed_condition === 'trusted_pin_invalid');
  const extraActivity = structuredClone(factual);
  extraActivity.consequence.state_changes.push({
    ...structuredClone(extraActivity.consequence.state_changes[0]),
    activity_id: 'activity-2'
  });
  assert.throws(() => buildTurnStepBodyEffectRef({ factual: extraActivity,
    batch, state: stateBefore,
    trustedBodyNeedsBindingPin: adapter.trustedBindingPin
  }), (error) => error.code ===
    'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED'
      && error.details?.failed_condition === 'activity_group_count'
      && error.details?.proposal_group_count === 1
      && error.details?.activity_count === 2);
  const secondaryPinFields = Object.keys(adapter.trustedBindingPin)
    .filter((key) => !['candidate_sha256',
      'approval_attestation_sha256'].includes(key));
  const mismatchedTrustedPins = secondaryPinFields.map((key) => ({
    ...adapter.trustedBindingPin,
    [key]: typeof adapter.trustedBindingPin[key] === 'number'
      ? adapter.trustedBindingPin[key] + 1
      : `${adapter.trustedBindingPin[key]}-forged`
  }));
  mismatchedTrustedPins.push({ ...adapter.trustedBindingPin,
    forged: true });
  for (const trustedBodyNeedsBindingPin of [null,
    { ...adapter.trustedBindingPin, candidate_sha256: 'f'.repeat(64) },
    { ...adapter.trustedBindingPin,
      approval_attestation_sha256: 'f'.repeat(64) },
    ...mismatchedTrustedPins]) {
    assert.throws(() => prepareTurnStepBodyHistory({ ...historyInput,
      trustedBodyNeedsBindingPin
    }), { code: 'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED' });
  }
  const prepared = prepareTurnStepBodyHistory({ ...historyInput,
    trustedBodyNeedsBindingPin: adapter.trustedBindingPin });
  const payload = { party_id: 'p', actor_id: 'actor-1',
    party_state: { body_state_version: 2 },
    body_state: applied.state_after,
    turn_step_body_history: [prepared.snapshot],
    last_turn: { turn_step_commit: factual,
      turn_step_operation_batch: batch,
      turn_step_idempotency_record_id: 'idem-1',
      visible_package: { change_set_id: 'change-1' } } };
  const history = payload.turn_step_body_history;
  const normalized = { body_state_version: '2',
    body_health: String(applied.state_after.health),
    body_energy: String(applied.state_after.energy),
    body_satiety: String(applied.state_after.satiety),
    body_updated_change_set_id: 'change-1' };
  const trustedPin = adapter.trustedBindingPin;
  await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
    pool([structuredClone(history[0])]), payload, normalized, trustedPin
  ));
  const invalidReadbackEffect = structuredClone(payload);
  invalidReadbackEffect.last_turn.turn_step_commit.body_update.proposal
    .component_proposals[0].metric_changes[0].metric = 'forged';
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(invalidReadbackEffect.turn_step_body_history), invalidReadbackEffect,
    normalized, trustedPin
  ), (error) => error.code === 'TRACE_PHASE_2_SESSION_READ_INVALID'
    && error.details?.reason?.includes(
      'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED')
    && error.details.reason.includes(
      'continuous ordered component owner is invalid'));
  const invalidReadbackShape = structuredClone(payload);
  invalidReadbackShape.last_turn.turn_step_commit.body_update.proposal
    .unexpected = true;
  const actualProposalKeys = Object.keys(invalidReadbackShape.last_turn
    .turn_step_commit.body_update.proposal).sort();
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(invalidReadbackShape.turn_step_body_history), invalidReadbackShape,
    normalized, trustedPin
  ), (error) => error.code === 'TRACE_PHASE_2_SESSION_READ_INVALID'
    && error.details?.reason?.includes(
      'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED')
    && error.details.reason.includes(
      'continuous body-time composite owner is invalid')
    && error.details.reason.includes('failed_condition=shape_keys')
    && error.details.reason.includes(
      `keys=${JSON.stringify(actualProposalKeys)}`));
  const missingReadbackComponents = structuredClone(payload);
  missingReadbackComponents.last_turn.turn_step_commit.consequence
    .state_changes = [];
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(missingReadbackComponents.turn_step_body_history),
    missingReadbackComponents, normalized, trustedPin
  ), (error) => error.code === 'TRACE_PHASE_2_SESSION_READ_INVALID'
    && error.details?.reason?.includes(
      'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED')
    && error.details.reason.includes(
      'continuous body-time composite owner is invalid')
    && error.details.reason.includes('failed_condition=components_empty')
    && error.details.reason.includes('state_change_kinds=[]'));
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(history), payload, normalized
  ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  const allBindingPinMismatches = ['candidate_sha256',
    'approval_attestation_sha256', ...secondaryPinFields].map((key) => ({
    ...trustedPin,
    [key]: typeof trustedPin[key] === 'number'
      ? trustedPin[key] + 1 : `${trustedPin[key]}-forged`
  }));
  allBindingPinMismatches.push({ ...trustedPin, forged: true });
  for (const mismatchedPin of allBindingPinMismatches) {
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool(history), payload, normalized, mismatchedPin
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }

  const alteredAfterState = structuredClone(payload);
  alteredAfterState.last_turn.turn_step_commit.body_update.state_after.energy += 1;
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(alteredAfterState.turn_step_body_history), alteredAfterState, normalized,
    trustedPin
  ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

  const alteredPin = structuredClone(payload);
  alteredPin.last_turn.turn_step_commit.body_update.proposal
    .component_proposals[0].binding_pin.approval_attestation_sha256 = 'f'.repeat(64);
  await assert.rejects(() => assertTurnStepBodyHistoryRows(
    pool(history), alteredPin, normalized, trustedPin
  ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

function bodyRowFor(payload) {
  return { body_state_version: String(payload.party_state.body_state_version),
    body_health: String(payload.body_state.health), body_energy: String(payload.body_state.energy),
    body_satiety: String(payload.body_state.satiety), body_updated_change_set_id: 'change-1' };
}

function timestamp(minutes) {
  return { whole_minutes: String(minutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}
