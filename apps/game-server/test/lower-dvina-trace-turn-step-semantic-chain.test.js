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
test('speech then physical probe uses advanced clock/body', async () => {
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
  assert.equal(result.stop_reason, 'terminal');
  assert.equal(result.write_fragments.length, 2);
  assert.equal(buildTurnStepPreparedTimeUpdate(result.prepared_effect_ledger).clock_after.whole_minutes, '6');
  assert.equal(buildTurnStepPreparedBodyUpdate(result.prepared_effect_ledger).state_after.energy, 99);
});

test('unseen warning then listening continues generically', async () => {
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

test('terminal and chained activities use the same temporal owner', async () => {
  const terminal = setup();
  const terminalResult = await terminal.run((request) => ({ ...plan(request, {
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'none' }
  }), direct_result_kind: null }));
  assert.equal(terminal.requests.length, 1);
  assert.equal(terminalResult.prepared_effect_ledger.slices.length, 1);
  assert.equal(terminalResult.stop_reason, 'terminal');
  assert.equal(terminal.timeCalls.length, 1);

  const chained = setup();
  const chainedResult = await chained.run((request) => ({ ...plan(request,
    request.step_index === 1 ? {
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
      goal_result: 'pending', continuation: {
        remaining_intent: 'после работы отдохнуть', depends_on_refs: [] }
    } : {
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' }
    }), direct_result_kind: null }));
  assert.equal(chained.requests.length, 2);
  assert.equal(chainedResult.prepared_effect_ledger.slices.length, 2);
  assert.equal(chainedResult.stop_reason, 'terminal');
  assert.equal(chained.timeCalls.length, 2);
  assert.equal(buildTurnStepPreparedBodyUpdate(
    chainedResult.prepared_effect_ledger).state_after.energy, 98);
});

test('partial semantic interval defers domain completion', async () => {
  const state = setup({ actualElapsed: 1, temporalResult: {
    temporal_status: 'paused', trace: { stopped_after_current_batch: true }
  } });
  state.input.rootPlayerAction = 'Обрабатываю заготовку пять минут.';
  state.input.initialWorkingProjection.items = [{ item_id: 'workpiece' }];
  let completions = 0;
  const registry = createTurnStepExecutionRegistry({
    domain: { request_item_use: async () => {
      completions += 1;
      return { working_projection: state.input.initialWorkingProjection,
        summary: 'completed', write_fragments: [] };
    } },
    applySemanticActivity: state.runtime.executionRegistry.semanticActivity()
  });
  const result = await state.run((request) => plan(request, {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use', actor_ref: 'mikula',
      item_ref: 'workpiece', use_kind: 'other', target_refs: [],
      description: 'обработать заготовку' }]
  }), { executionRegistry: registry });
  assert.equal(completions, 0);
  assert.equal(result.action_production_atomic_write_plans.length, 0);
  assert.equal(result.remaining_intent, state.input.rootPlayerAction);
  assert.equal(result.working_projection.clock.whole_minutes, '1');
  assert.equal(result.prepared_effect_ledger.slices.length, 1);
  assert.equal(buildTurnStepPreparedBodyUpdate(
    result.prepared_effect_ledger).state_after.energy, 99);
});

test('completed semantic interval precedes domain completion', async () => {
  const state = setup();
  state.input.initialWorkingProjection.items = [{ item_id: 'workpiece' }];
  let completions = 0;
  const registry = createTurnStepExecutionRegistry({
    domain: { request_item_use: async (execution) => {
      completions += 1;
      assert.equal(execution.working_projection.clock.whole_minutes, '5');
      return { working_projection: execution.working_projection,
        summary: 'completed', write_fragments: [],
        player_response_boundary: true };
    } },
    applySemanticActivity: state.runtime.executionRegistry.semanticActivity()
  });
  const result = await state.run((request) => plan(request, {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use', actor_ref: 'mikula',
      item_ref: 'workpiece', use_kind: 'other', target_refs: [],
      description: 'обработать заготовку' }]
  }), { executionRegistry: registry });
  assert.equal(completions, 1);
  assert.equal(result.working_projection.clock.whole_minutes, '5');
});
