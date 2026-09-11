import { assembleTurnStepPlan } from '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop, buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate } from '@rus/turn';
import { createPorts, loopInput, plan, genericCheck, preparedOrdinary, speech, semanticOwners as owners } from
  './lower-dvina-trace-turn-step-runtime-ports-fixture.js';

const body = { health: 100, satiety: 100, energy: 100, active_conditions: [], body_parts: {} };
const at = (value) => ({ whole_minutes: String(value), subminute_numerator: '0', subminute_denominator: '1' });

function setup({ temporalResult = null } = {}) {
  const requests = [], revalidations = [], timeCalls = [], checks = [];
  let rolls = 0;
  const runtime = createPorts({ committedState: {
    party_id: 'party', actor_id: 'mikula', party_state: { turn_number: 0 },
    body_state: body, clock: at(0), items: [] },
    semanticActivityOwner: owners.semanticActivityOwner, bodyEffect: owners.bodyEffect,
    temporalAdvance: async (input) => {
      timeCalls.push(input);
      return { clock_before: input.clock_before,
        clock_after: at(Number(input.clock_before.whole_minutes)
          + Number(input.exact_elapsed.exact_minutes.numerator)),
        exact_elapsed: input.exact_elapsed, nearest_boundary: null,
        temporal_results: temporalResult == null ? [] : [temporalResult] };
    } });
  const input = { ...loopInput(), actor: { ...loopInput().actor, body },
    initialWorkingProjection: { ...loopInput().initialWorkingProjection, clock: at(0) } };
  return { requests, revalidations, timeCalls, checks, runtime, input,
    get rolls() { return rolls; },
    run(model, overrides = {}) {
      return runTurnStepLoop(input, {
        executionRegistry: runtime.executionRegistry,
        preparedEffectContext: runtime.preparedEffectContext,
        preparedEffectTimeOwner: runtime.preparedEffectTimeOwner,
        preparedEffectBodyOwner: runtime.preparedEffectBodyOwner,
        preparedEffectProjectionOwner: runtime.preparedEffectProjectionOwner,
        projectPlayerSafeState: async ({ working_projection: projection }) => projection,
        revalidateCommittedState: async ({ step_index: step }) => {
          revalidations.push(step); return true;
        },
        turnStepModel: (request) => { requests.push(request); return model(request); },
        randomSource: { next() { rolls += 1; return 0.5; } },
        resolveCheckContext: async (value) => { checks.push(value);
          return runtime.resolveCheckContext(value); },
        ...overrides
      });
    } };
}
test('speech then ordinary physical probe executes from advanced clock/body after revalidation', async () => {
  const state = setup();
  const suffix = 'Проверяю палкой плотность земли перед собой.';
  state.input.rootPlayerAction = `Предупреждаю спутников. ${suffix}`;
  const result = await state.run((request) => request.step_index === 1
    ? speech(request, suffix) : plan(request, { resolution: 'generic_check',
      goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
      check: genericCheck() }));
  assert.equal(state.requests[1].remaining_intent, suffix);
  assert.equal(state.requests[1].player_safe_state.clock.whole_minutes, '1');
  assert.deepEqual(state.checks[0].prepared_chain_context.current_body_state, body);
  assert.deepEqual(state.revalidations, [1, 2]);
  assert.equal(state.rolls, 1);
  assert.equal(result.step_traces[1].applied, true);
  assert.equal(result.stop_reason, 'player_response');
  assert.equal(result.write_fragments.length, 2);
  assert.equal(buildTurnStepPreparedTimeUpdate(result.prepared_effect_ledger).clock_after.whole_minutes, '6');
  assert.equal(buildTurnStepPreparedBodyUpdate(result.prepared_effect_ledger).state_after.energy, 99);
});

test('unseen warning then listening continues without a phrase-specific handler', async () => {
  const state = setup();
  const suffix = 'Прислушиваюсь к шуму за дверью.';
  state.input.rootPlayerAction = `Прошу соблюдать тишину. ${suffix}`;
  const result = await state.run((request) => request.step_index === 1
    ? speech(request, suffix) : plan(request));
  assert.equal(state.requests[1].remaining_intent, suffix);
  assert.equal(result.completed_steps.length, 2);
  assert.equal(result.stop_reason, 'terminal');
  assert.equal(result.working_projection.clock.whole_minutes, '2');
});

for (const count of [3, 8]) test(`${count} compatible timed steps continue until terminal or max8`, async () => {
  const state = setup();
  const result = await state.run((request) => plan(request, count === 3 && request.step_index === 3
    ? {} : { goal_result: 'pending', continuation: {
      remaining_intent: `продолжить наблюдение ${request.step_index}`, depends_on_refs: [] } }));
  assert.equal(state.requests.length, count);
  assert.equal(result.prepared_effect_ledger.slices.length, count);
  assert.deepEqual(state.requests.map((request) => request.player_safe_state.clock.whole_minutes),
    Array.from({ length: count }, (_, i) => String(i)));
  assert.equal(result.stop_reason, count === 3 ? 'terminal' : 'step_limit');
  assert.equal(result.working_projection.clock.whole_minutes, String(count));
});

for (const temporalResult of [
  { temporal_status: 'completed', trace: { stopped_after_current_batch: true } },
  { temporal_status: 'paused', trace: {} },
  { temporal_status: 'completed', trace: {}, visible_package_candidate: { player_safe_interruption: { reason: 'noise' } } }
]) test(`temporal decision/interruption retains exact suffix: ${JSON.stringify(temporalResult)}`, async () => {
  const state = setup({ temporalResult });
  const result = await state.run((request) => speech(request, 'осмотреть следы у стены'));
  assert.equal(state.requests.length, 1);
  assert.equal(result.stop_reason, 'player_response');
  assert.equal(result.remaining_intent, 'осмотреть следы у стены');
  assert.equal(result.prepared_effect_ledger.slices.length, 1);
});

test('terminal and first body-changing activities retain conservative boundary', async () => {
  for (const effort of ['none', 'light']) {
    const state = setup();
    const result = await state.run((request) => ({ ...plan(request, {
      activity: { owner: 'semantic', duration_class: 'brief', effort },
      ...(effort === 'light' ? { goal_result: 'pending', continuation: {
        remaining_intent: 'после работы отдохнуть', depends_on_refs: [] } } : {}) }), direct_result_kind: null }));
    assert.equal(state.requests.length, 1);
    assert.equal(result.prepared_effect_ledger, null);
    assert.equal(result.stop_reason, 'player_response');
    assert.equal(state.timeCalls.length, 0);
  }
});

test('stale second step fails before RNG, effect and second time segment', async () => {
  const state = setup();
  await assert.rejects(state.run((request) => request.step_index === 1
    ? speech(request, 'проверить опору') : plan(request, { resolution: 'generic_check', goal_result: 'pending', check: genericCheck() }), {
    revalidateCommittedState: async ({ step_index: step }) => ({ state_version: step === 1 ? 7 : 8 })
  }), { code: 'TURN_STEP_STATE_STALE' });
  assert.equal(state.rolls, 0);
  assert.equal(state.timeCalls.length, 1);
});

test('compound semantic root commits once and exact retry repeats no planner, RNG, time or effect', async () => {
  const { fixture, loadScenarioBundle } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const bundle = await loadScenarioBundle(13);
  const requests = [];
  const suffix = 'Проверяю палкой плотность земли перед собой.';
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    rollValue: 0.5, turnStepModel: (request) => {
      requests.push(request);
      const speaker = request.actor.actor_id ?? request.actor.actor_ref;
      if (request.step_index === 1) return { ...speech(request, suffix),
        utterance: { speaker_ref: speaker, input_mode: 'intent_paraphrase', utterance_text: 'Осторожнее у воды.' } };
      return plan(request, { resolution: 'generic_check', goal_result: 'pending',
        activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
        check: { ...genericCheck(), attribute_ref: 'strength', skill_ref: null } });
    } });
  f.state.inventory = { items: [], load_category: 'light', occupied_hands: 0 };
  const before = structuredClone(f.state);
  const input = { request_id: 'compound-prepared', idempotency_key: 'compound-prepared',
    raw_text: `Предупреждаю спутника. ${suffix}` };
  const first = await f.runtime.submitTurn({ partyId: f.partyId, input });
  const committed = structuredClone(f.state);
  const repeated = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.deepEqual(repeated, first);
  assert.deepEqual(f.state, committed);
  assert.equal(f.commitCount(), 1);
  assert.equal(f.rollCount(), 1);
  assert.equal(f.turnStepCount(), 2);
  assert.equal(requests[1].remaining_intent, suffix);
  assert.equal(Number(requests[1].player_safe_state.clock.whole_minutes),
    Number(requests[0].player_safe_state.clock.whole_minutes) + 1);
  assert.equal(f.lastWritePlan().turn_step_commit.loop_trace.working_revision, 2);
  assert.equal(f.state.body_state.energy, before.body_state.energy - 1);
  assert.equal(f.state.turn_step_activity_history.length, 2);
  assert.equal(f.state.turn_step_body_history.length, 1);
  assert.equal(Number(f.state.clock.whole_minutes), Number(before.clock.whole_minutes) + 6);
});

for (const count of [3, 8]) test(`${count} semantic slices persist in one existing root commit`, async () => {
  const { fixture, loadScenarioBundle } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const bundle = await loadScenarioBundle(13);
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    turnStepModel: (request) => plan(request, count === 3 && request.step_index === 3 ? {}
      : { goal_result: 'pending', continuation: {
        remaining_intent: `продолжить наблюдение ${request.step_index}`, depends_on_refs: [] } }) });
  await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: `semantic-chain-${count}`, idempotency_key: `semantic-chain-${count}`,
    raw_text: 'Тихо предупреждаю, прислушиваюсь и оглядываюсь.' } });
  assert.equal(f.commitCount(), 1);
  assert.equal(f.turnStepCount(), count);
  const envelope = f.lastWritePlan().turn_step_commit;
  assert.equal(envelope.time_update.prepared_effect_ledger.slices.length, count);
  assert.equal(envelope.loop_trace.stop_reason, count === 3 ? 'terminal' : 'step_limit');
});

for (const source of ['prepared', 'invisible']) test(`admission refreshes speech then O1 then A1 (${source})`, async () => {
  const { resolveBoundTurnStepCommand: admit } = await import('../../../packages/turn/src/turn-step-admission.js');
  const { projectLowerDvinaTracePlayerSafeState: project } = await import('../src/runtime/lower-dvina-trace-player-safe-state.js');
  const { createLowerDvinaTraceTurnStepRuntimePorts: createRuntime } = await import('../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js');
  const { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority: createAuthority } = await import('../src/runtime/lower-dvina-trace-player-safe-working.js');
  const { createLowerDvinaTraceTurnStepPlayerSafeProjector: createProjector } = await import('../src/runtime/lower-dvina-trace-phase-2-player-safe.js');
  const authority = createAuthority();
  const { loadLowerDvinaTraceA1Profile } = await import('../src/internal/lower-dvina-trace-a1-profile.js');
  const itemId = 'ordinary_item:chain-board', suffix = 'Приспособить доску как опору.';
  const prepared = preparedOrdinary(itemId);
  let discovered = null, produced = null;
  const state = { party_id: 'party', actor_id: 'mikula', party_state: { turn_number: 0 },
    body_state: body, clock: at(0), position: { location_ref: 'shore' }, items: [],
    current_visible_context: { visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc-watch' },
      display_label: 'Сторож', visible_status: 'Бодрствует', observable_cues: ['держит глаза открытыми'] }] },
    npcs: [{ instance_id: 'npc-watch', location_ref: 'shore', machine_state: { status: 'active' } }] };
  const transition = { npc_id: 'npc-watch', after: {
    causal_state_ref: { routine_state: { status: 'inactive' } },
    npc_snapshot: { machine_state: { status: 'asleep', secret: 'hidden-state' } } } };
  const runtime = createRuntime({ committedState: state,
    ordinaryDiscoveryResolver: async (execution) => {
      discovered = execution;
      prepared.request_identity = `${execution.request.root_turn_id}:ordinary:presence:step:${execution.request.step_index}`;
      return { working_projection: execution.working_projection, write_fragments: [],
        summary: 'ordinary inspection completed', player_response_boundary: false,
        ordinary_materialization_atomic_write_plan: prepared };
    },
    workingProjectionAuthority: authority, semanticActivityOwner: owners.semanticActivityOwner,
    bodyEffect: owners.bodyEffect, temporalAdvance: async ({ clock_before, exact_elapsed }) => ({
      clock_before, clock_after: at(1), exact_elapsed, nearest_boundary: null,
      temporal_results: [{ temporal_status: 'completed', trace: {},
        combined_change_set: { proposals: [{ npc_routine_transition: transition }] } }] }) });
  const requests = [];
  const pending = admit({ registry: { stateBlocks: () => [] },
    semanticBindings: [], playerInput: { party_id: 'party', turn_number: 1,
      raw_text: 'Прошу не шуметь. Осматриваю землю у стены.' },
    routingContext: { actor_id: 'mikula' }, committedState: state,
    actionSet: { state_version: 7, options: [], options_digest: 'a'.repeat(64) },
    services: {
      turnStepExecutionRegistry: runtime.executionRegistry,
      turnStepPreparedDomainEffect: runtime.preparedDomainEffect,
      turnStepPreparedEffectContext: runtime.preparedEffectContext,
      turnStepPreparedEffectTimeOwner: runtime.preparedEffectTimeOwner,
      turnStepPreparedEffectBodyOwner: runtime.preparedEffectBodyOwner,
      turnStepPreparedEffectProjectionOwner: runtime.preparedEffectProjectionOwner,
      stateReader: { revalidate: async () => ({ state_version: 7 }) },
      playerSafeStateProjector: createProjector({
        playerSafeStateProjector: project,
        workingProjectionAuthority: authority, ordinaryDiscoveryEnablementMarker: () => true,
        actionProductionProfile: await loadLowerDvinaTraceA1Profile(),
        createTurnStepActionProductionOwner: () => {},
        ordinaryDiscoveryResolver: () => {}, ordinaryDiscoveryScopeBinding: { position_ref: 'shore', g6_ref: 'g6' } }),
      turnStepOrdinaryDiscoveryResolver: runtime.ordinaryDiscoveryResolver,
      turnStepActionProductionOwner: async (execution) => {
        produced = execution;
        return { working_projection: execution.working_projection, write_fragments: [],
          summary: 'physical continuation completed', player_response_boundary: true };
      },
      turnStepModel(request) {
        requests.push(request);
        if (request.step_index === 3) return plan(request, {
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [{ op: 'request_item_use', actor_ref: 'mikula',
            item_ref: source === 'prepared' ? itemId : 'ordinary_item:invisible',
            use_kind: 'other', target_refs: [] }] });
        return request.step_index === 1 ? speech(request, suffix)
          : assembleTurnStepPlan(plan(request, { resolution: 'domain_request', goal_result: 'pending',
            activity: { owner: 'domain', duration_class: null, effort: null },
            continuation: { remaining_intent: suffix, depends_on_refs: [] },
            operations: [{ op: 'request_discovery', actor_ref: 'mikula', discovery_kind: 'search',
              target_refs: ['shore'], query: 'доска' }] }), request);
      }
    } });
  if (source === 'invisible') {
    await assert.rejects(pending, { code: 'TURN_STEP_PLAN_INVALID' });
    assert.equal(produced, null);
    return;
  }
  const result = await pending;
  const loop = result.executionDraft.loop_result;
  assert.equal(loop.working_revision, 3);
  assert.equal(loop.step_traces[2].applied, true);
  assert.equal(loop.remaining_intent, null);
  for (const id of [requests[2].player_safe_state.current_visible_context.visible_objects[0].entity_ref.entity_id,
    loop.ordinary_materialization_atomic_write_plan.item.item_id, produced.operation.item_ref,
    produced.working_projection.items[0].item_id,
    produced.prepared_ordinary_materialization_atomic_write_plan.item.item_id]) assert.equal(id, itemId);
  assert.equal(requests[1].player_safe_state.npcs, undefined);
  assert.equal(requests[1].player_safe_state.current_visible_context.visible_npc[0].visible_status, 'asleep');
  assert.equal(JSON.stringify(requests[1]).includes('Бодрствует'), false);
  assert.equal(JSON.stringify(requests[1]).includes('держит глаза открытыми'), false);
  assert.equal(JSON.stringify(requests[1]).includes('hidden-state'), false);
  assert.equal(discovered.committed_state.npcs[0].machine_state.status, 'asleep');
  assert.equal(discovered.committed_state.clock.whole_minutes, '1');
  assert.equal(discovered.request.remaining_intent, suffix);
  assert.equal(discovered.operation.discovery_kind, 'inspect');
  assert.equal(loop.prepared_effect_ledger.slices.length, 1);
});

test('a generic outcome continuation starts the same prepared chain', async () => {
  const state = setup();
  const check = genericCheck();
  for (const outcome of Object.values(check.outcomes)) {
    outcome.goal_result = 'pending';
    outcome.continuation = { remaining_intent: 'прислушаться после проверки', depends_on_refs: [] };
  }
  const result = await state.run((request) => request.step_index === 1
    ? plan(request, { resolution: 'generic_check', goal_result: 'pending', check }) : plan(request));
  assert.equal(state.requests[1].remaining_intent, 'прислушаться после проверки');
  assert.equal(state.requests[1].player_safe_state.clock.whole_minutes, '1');
  assert.equal(result.prepared_effect_ledger.slices.length, 2);
  assert.equal(state.rolls, 1);
});


for (const { durationClass, planned, elapsed, rawText, elapsedText } of [
  { durationClass: 'brief', planned: 5, elapsed: 1,
    rawText: 'Предупреждаю спутников, затем проверяю опору перед собой.', elapsedText: 'Прошла 1 минута.' },
  { durationClass: 'short', planned: 15, elapsed: 2,
    rawText: 'Прислушиваюсь к шуму воды, затем осматриваю дальнюю стену.', elapsedText: 'Прошло 2 минуты.' }
]) test(`production temporal owner commits actual ${elapsed} of planned ${planned} minutes once`, async () => {
  const { createTemporalAdvanceOwner } = await import('@rus/turn/temporal-advance');
  const { lowerDvinaTracePhase6TemporalEffectRegistrations } = await import('../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js');
  const { fixture, loadScenarioBundle } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const bundle = await loadScenarioBundle(13);
  const versioned = (entity_kind, entity_id) => ({ entity_ref: { entity_kind, entity_id }, authoring_version: '1' });
  const rule = versioned('action_contract', 'test-decision');
  const policy = versioned('activity_contract', 'test-decision');
  let advances = 0;
  const owner = createTemporalAdvanceOwner({ effect_registrations: lowerDvinaTracePhase6TemporalEffectRegistrations(),
    source_registrations: [{ rule_ref: rule, policy_ref: policy, resolve(candidate, context) {
      advances += 1;
      return { disposition: 'execute', follow_up_candidates: [], state_projection: context.projection,
        stop_after_current_batch: true, proposals: [] };
    } }] });
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle, temporalAdvanceOwner: owner,
    turnStepModel: (request) => plan(request, { goal_result: 'pending',
      activity: { owner: 'semantic', duration_class: durationClass, effort: 'none' },
      continuation: { remaining_intent: 'Затем проверяю опору перед собой.', depends_on_refs: [] } }) });
  f.state.clock = at(0); f.state.clock_weather_light.clock = at(0);
  const candidate = { boundary_id: 'decision-at-one', boundary_kind: 'exact_timer', scheduled_at: at(elapsed),
    source_ref: { entity_kind: 'party_route_plan_execution_event', entity_id: 'decision-at-one' },
    primary_subject_ref: { entity_kind: 'actor', entity_id: f.state.actor_id }, subject_refs: [],
    scope_ref: { entity_kind: 'party', entity_id: f.partyId }, rule_ref: rule, policy_ref: policy,
    preconditions_digest: 'a'.repeat(64), resolution_class: 'execution_outcome', interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', 'test-decision'), idempotency_key: 'decision-at-one', causal_parent_refs: [] };
  f.state.temporal_boundary_candidates = [candidate];
  f.state.temporal_source_proof = { version: 2, schema: 'lower_dvina_trace_temporal_source_proof',
    owner: '@rus/time-events-history/temporal-boundaries',
    same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
    admission_policy: 'pass_exact_candidates_to_temporal_activity_owner',
    pending_event_count: 1, active_schedule_count: 0, candidate_count: 1, candidates: [candidate] };
  const input = { request_id: 'partial-semantic', idempotency_key: 'partial-semantic',
    raw_text: rawText };
  const initial = structuredClone(f.state);
  const first = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.deepEqual(await f.runtime.submitTurn({ partyId: f.partyId, input }), first);
  const envelope = f.lastWritePlan().turn_step_commit;
  assert.equal(f.state.clock.whole_minutes, String(elapsed));
  assert.equal(envelope.consequence.duration_minutes, elapsed);
  assert.equal(Object.values(envelope.consequence.visible_seed).find((seed) => seed?.kind === 'semantic_activity').duration_minutes, elapsed);
  assert.deepEqual(envelope.visible_context.visible_changes, [elapsedText]);
  assert.equal(JSON.stringify(envelope.visible_context).includes(`Прошло ${planned}`), false);
  assert.equal(envelope.loop_trace.stop_reason, 'player_response');
  assert.equal(envelope.loop_trace.remaining_intent, 'Затем проверяю опору перед собой.');
  const resolution = envelope.time_update.semantic_activity_resolutions[0];
  assert.equal(resolution.execution.original_duration.exact_minutes.numerator, String(planned));
  assert.equal(resolution.attempt.actual_time.exact_minutes.numerator, String(elapsed));
  assert.equal(resolution.execution.status, 'aborted');
  assert.equal(resolution.attempt.result_kind, 'paused');
  assert.equal(f.commitCount(), 1); assert.equal(f.turnStepCount(), 1); assert.equal(advances, 1);
  const { appendTurnStepSemanticActivityWrites } = await import('../src/infrastructure/postgres/lower-dvina-trace-turn-step-activity-writes.js');
  const writes = { inserts: [], appends: [] };
  const activity = { ...f.lastWritePlan().write_targets.find(({ value }) => Array.isArray(value?.operations)).value.operations.find(({ target }) => target === 'party_events').value,
    owner_resolution: resolution, profile_pin: resolution.profile_pin, body_effect_profile_ref: resolution.body_effect_profile_ref };
  appendTurnStepSemanticActivityWrites({ writes, activities: [activity], partyId: f.partyId,
    state: f.state, snapshot: f.state, factual: envelope, changeSetId: 'partial', idemId: 'partial' });
  const execution = writes.inserts[0].record, attempt = writes.appends[0].record;
  assert.equal(execution.cumulative_elapsed_numerator, elapsed); assert.equal(execution.remaining_time_numerator, planned - elapsed);
  assert.equal(attempt.planned_time_numerator, planned); assert.equal(attempt.actual_time_numerator, elapsed);
  assert.equal(attempt.remaining_after_numerator, planned - elapsed);
  const { createTracePhase2TemporalAdvance } = await import('../src/runtime/lower-dvina-trace-phase-2-temporal.js');
  const advance = createTracePhase2TemporalAdvance({ contracts: { activity: {
    nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } }, temporalAdvanceOwner: owner });
  for (const effect of [{ effect_kind: 'domain_command', consequence: { duration_minutes: 5 } },
    { effect_kind: 'semantic_activity', consequence: { duration_minutes: 5, body_effect_ref: 'body' } }]) {
    await assert.rejects(advance({ ...effect, clock_before: at(0), relevant_state: initial,
      exact_elapsed: { exact_minutes: { numerator: '5', denominator: '1' } } }),
    { code: 'TRACE_PHASE_2_TEMPORAL_BOUNDARY_REQUIRES_RESOLUTION' });
  }
});
