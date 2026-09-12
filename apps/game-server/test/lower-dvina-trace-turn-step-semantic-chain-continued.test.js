import { assembleTurnStepPlan } from '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop, buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate, createTurnStepExecutionRegistry } from
  '@rus/turn';
import { createPorts, loopInput, plan, genericCheck, preparedOrdinary, speech,
  semanticOwners as owners } from './lower-dvina-trace-turn-step-runtime-ports-fixture.js';

const body = { health: 100, satiety: 100, energy: 100, active_conditions: [], body_parts: {} };
const at = (value) => ({ whole_minutes: String(value), subminute_numerator: '0', subminute_denominator: '1' });

function setup({ temporalResult = null, actualElapsed = null } = {}) {
  const requests=[], revalidations=[], timeCalls=[], checks=[];
  let rolls = 0;
  const runtime = createPorts({ committedState: {
    party_id: 'party', actor_id: 'mikula', party_state: { turn_number: 0 },
    body_state: body, clock: at(0), items: [] },
    semanticActivityOwner: owners.semanticActivityOwner, bodyEffect: owners.bodyEffect,
    temporalAdvance: async (input) => {
      const elapsed = actualElapsed ?? Number(
        input.exact_elapsed.exact_minutes.numerator);
      return (timeCalls.push(input), {
      clock_before: input.clock_before,
        clock_after: at(Number(input.clock_before.whole_minutes)
          + elapsed),
        exact_elapsed: { exact_minutes: {
          numerator: String(elapsed), denominator: '1'
        } }, nearest_boundary: null,
        temporal_results: temporalResult == null ? [] : [temporalResult] });
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
        revalidateCommittedState: async ({ step_index: step }) =>
          (revalidations.push(step), true),
        turnStepModel: request => (requests.push(request), model(request)),
        randomSource: { next() { rolls += 1; return 0.5; } },
        resolveCheckContext: async value => (checks.push(value),
          runtime.resolveCheckContext(value)),
        ...overrides
      });
    } };
}
test('stale second step fails before RNG, effect and second time segment', async () => {
  const state = setup();
  await assert.rejects(state.run((request) => request.step_index === 1
    ? speech(request, 'проверить опору') : plan(request, { resolution: 'generic_check', goal_result: 'pending', check: genericCheck() }), {
    revalidateCommittedState: async ({ step_index: step }) => ({ state_version: step === 1 ? 7 : 8 })
  }), { code: 'TURN_STEP_STATE_STALE' });
  assert.equal(state.rolls, 0);
  assert.equal(state.timeCalls.length, 1);
});

test('compound root commits once and exact retry has no repeated work', async () => {
  const { fixture, loadScenarioBundle } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const bundle = await loadScenarioBundle(13);
  const requests = [];
  const suffix = 'Проверяю палкой плотность земли перед собой.';
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    rollValue: 0.5, turnStepModel: (request) => {
      requests.push(request);
      const speaker = request.actor.actor_id ?? request.actor.actor_ref;
      if (request.step_index === 1) return { ...speech(request, suffix),
        utterance: { speaker_ref: speaker, input_mode: 'intent_paraphrase',
          utterance_text: 'Осторожнее у воды.',
          delivery: { loudness: 2, duration_class: 'instant' } } };
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
  const state = { party_id: 'party', actor_id: 'mikula',
    party_state: { turn_number: 0, state_version: 1 },
    body_state: body, clock: at(0), position: { location_ref: 'shore' }, items: [],
    current_visible_context: { visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc-watch' },
      display_label: 'Сторож', visible_status: 'Бодрствует', observable_cues: ['держит глаза открытыми'] }] },
    npcs: [{ instance_id: 'npc-watch', location_ref: 'shore', machine_state: { status: 'active' } }] };
  const transition = { npc_id: 'npc-watch', after: {
    causal_state_ref: { routine_state: { status: 'inactive' } },
    npc_snapshot: { machine_state: { status: 'asleep', secret: 'hidden-state' } } } };
  const runtime = createRuntime({ committedState: state,
    idempotencyKey: `semantic-chain-${source}`,
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
      turnStepPostAppliedActorStep: runtime.postAppliedActorStep,
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

test('zero-check Phase 4 conversation admits its next physical inspection',
  async () => {
    const state = setup();
    const owner = state.runtime.preparedDomainEffect;
    const context = { prior_effect_count: 0, current_clock: at(0),
      current_body_state: body };
    const commandId =
      'lower_dvina_trace.offer_conditional_protection_and_seek_surrender';
    const operation = { op: 'emit_interaction', actor_ref: 'mikula',
      interaction_kind: 'speech', target_actor_refs: ['onisim'],
      instrument_refs: [], content: 'окликнуть' };
    assert.equal(owner.supports({ operation, command_id: commandId,
      prepared_chain_context: context }), true);
    const consequence = {
      phase4_kind: 'negotiation', duration_minutes: 10,
      negotiation: { player_response_boundary: null,
        combat_handoff: null, actor_step_handoff: null }
    };
    const applied = await owner.apply({ command_id: commandId, operation,
      prepared_chain_context: context,
      working_projection: { actor_id: 'mikula', clock: at(0) },
      availability: { can_attempt: true }, consequence });
    assert.equal(applied.player_response_boundary, false);
    const bodyUpdate = await state.runtime.preparedEffectBodyOwner({
      effect_kind: 'domain_command', consequence,
      prepared_chain_context: context, time_update: {
        exact_elapsed: { exact_minutes: { numerator: '10', denominator: '1' } }
      }
    });
    assert.equal(bodyUpdate.applied, false);
    assert.deepEqual(bodyUpdate.state_after, body);
    await state.runtime.preparedEffectProjectionOwner({
      actor: { actor_id: 'mikula' },
      working_projection: applied.working_projection,
      prepared_effect: { ...applied.prepared_effect_request,
        step_index: 1, time_update: { schema: 'turn_time_update',
          clock_before: at(0), clock_after: at(10), temporal_results: [] },
        body_update: { applied: false, proposal: null, state_after: body },
        body_state_before: body }
    });
    assert.equal(owner.assertContinuation({
      prepared_chain_context: { ...context, prior_effect_count: 1 },
      plan: { resolution: 'generic_check', activity: { owner: 'semantic' } }
    }), true);
    assert.equal(owner.assertContinuation({
      prepared_chain_context: { ...context, prior_effect_count: 1 },
      plan: { resolution: 'domain_request', activity: { owner: 'domain' },
        operations: [{ op: 'request_discovery' }] }
    }), true);
    assert.equal(owner.assertContinuation({
      prepared_chain_context: { ...context, prior_effect_count: 1 },
      plan: { resolution: 'domain_request', activity: { owner: 'domain' },
        operations: [{ op: 'request_movement' }] }
    }), false);
  });


for (const { durationClass, planned, elapsed, effort, rawText, elapsedText } of [
  { durationClass: 'brief', planned: 5, elapsed: 1, effort: 'light',
    rawText: 'Предупреждаю спутников, затем проверяю опору перед собой.', elapsedText: 'Прошла 1 минута.' },
  { durationClass: 'short', planned: 15, elapsed: 2, effort: 'none',
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
      activity: { owner: 'semantic', duration_class: durationClass, effort },
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
  assert.equal(f.state.body_state.energy,
    initial.body_state.energy - (effort === 'light' ? 1 : 0));
  assert.equal(envelope.consequence.duration_minutes, elapsed);
  assert.equal(Object.values(envelope.consequence.visible_seed).find((seed) => seed?.kind === 'semantic_activity').duration_minutes, elapsed);
  assert.deepEqual(envelope.visible_context.visible_changes, []);
  assert.equal(JSON.stringify(envelope.visible_context).includes(`Прошло ${planned}`), false);
  assert.equal(envelope.loop_trace.stop_reason, 'player_response');
  assert.equal(envelope.loop_trace.remaining_intent, rawText);
  const resolution = envelope.time_update.semantic_activity_resolutions[0];
  assert.equal(resolution.execution.original_duration.exact_minutes.numerator, String(planned));
  assert.equal(resolution.attempt.actual_time.exact_minutes.numerator, String(elapsed));
  assert.equal(resolution.execution.status, 'paused');
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
  await assert.rejects(advance({ effect_kind: 'domain_command',
    consequence: { duration_minutes: 5 }, clock_before: at(0),
    relevant_state: initial,
    exact_elapsed: { exact_minutes: { numerator: '5', denominator: '1' } } }),
  { code: 'TRACE_PHASE_2_TEMPORAL_BOUNDARY_REQUIRES_RESOLUTION' });
  const bodyChanging = await advance({ effect_kind: 'semantic_activity',
    consequence: { duration_minutes: 5, body_effect_ref: 'body' },
    clock_before: at(0), relevant_state: initial,
    exact_elapsed: { exact_minutes: { numerator: '5', denominator: '1' } } });
  assert.deepEqual(bodyChanging.exact_elapsed,
    { exact_minutes: { numerator: String(elapsed), denominator: '1' } });
});
