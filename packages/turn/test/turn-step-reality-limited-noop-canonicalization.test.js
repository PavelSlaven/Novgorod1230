import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlanWithRepair } from
  '../src/turn-step-plan-repair.js';
import { validateTurnStepLoopTrace } from '../src/turn-step-commit-validator.js';
import { traceFor } from '../src/turn-step-loop-support.js';
import { directPlan, request } from './turn-step-contracts-fixture.js';

function achievedNoop(overrides = {}) {
  return directPlan({ interpretation: { player_goal: 'делаю невозможное',
    grounded_attempt: 'делаю ближайшую реальную попытку',
    adaptation: 'reality_limited' },
  activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
  direct_result_kind: 'player_safe_observation', ...overrides });
}

test('reality-limited achieved no-op receives one repair and accepts its choice',
  async () => {
    const input = request();
    let calls = 0;
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async (_safe, repairContext) => {
        calls += 1;
        if (repairContext == null) return achievedNoop();
        assert.match(repairContext.structural_errors[0].message,
          /choose not_achieved or partially_achieved/u);
        assert.match(repairContext.structural_errors[0].message,
          /direct_result_kind to null and remove assessment and utterance/u);
        return achievedNoop({ goal_result: 'partially_achieved' });
      } });
    assert.equal(calls, 2);
    assert.equal(result.plan.goal_result, 'partially_achieved');
    assert.equal(result.canonicalizations, undefined);
    assert.equal(result.repaired, true);
  });

test('all no-op direct-result kinds receive one repair; repeated combo canonicalizes',
  async () => {
    const input = request({ remaining_intent: 'Кричу: «Помогите!»' });
    const cases = [null, 'player_safe_observation', 'bad_kind',
      'player_safe_item_observation', 'player_safe_body_observation',
      'no_state_gesture', 'player_utterance'].map((kind) => ({
      kind,
      ...(kind === 'player_utterance' ? { utterance: {
        speaker_ref: 'actor_mikula', utterance_text: 'Помогите!',
        input_mode: 'verbatim',
        delivery: { loudness: 3, duration_class: 'instant' }
      } } : {})
    }));
    for (const { kind, ...extra } of cases) {
      const candidate = achievedNoop({ direct_result_kind: kind, ...extra });
      let calls = 0;
      const result = await requestTurnStepPlanWithRepair({
        request: input,
        turnStepModel: async () => {
          calls += 1;
          return candidate;
        } });
      assert.equal(calls, 2, `kind ${kind} must enter one repair`);
      assert.equal(result.plan.goal_result, 'not_achieved');
      assert.equal(result.plan.direct_result_kind, null);
      assert.deepEqual(result.canonicalizations, [
        { attempt: 2, path: '$.goal_result', old_value: 'achieved',
          new_value: 'not_achieved' },
        ...(kind == null ? [] : [{ attempt: 2, path: '$.direct_result_kind',
          old_value: kind, new_value: null }]),
        ...(extra.utterance == null ? [] : [{ attempt: 2, path: '$.utterance',
          removed_fields: ['utterance'] }])
      ]);
      assert.equal(Object.hasOwn(result.plan, 'utterance'), false);
      assert.equal(result.repaired, true);
    }
    const partial = achievedNoop({ goal_result: 'partially_achieved' });
    const literal = achievedNoop({ interpretation: {
      ...achievedNoop().interpretation, adaptation: 'literal' } });
    for (const candidate of [partial, literal]) {
      const result = await requestTurnStepPlanWithRepair({ request: input,
        turnStepModel: async () => candidate });
      assert.equal(result.plan.goal_result, candidate.goal_result);
      assert.equal(result.canonicalizations, undefined);
    }
  });

test('commit trace accepts repeated no-op canonicalizations for all result kinds',
  () => {
    const input = request();
    const kinds = [null, 'bad_kind', 'player_safe_observation',
      'player_safe_item_observation', 'player_safe_body_observation',
      'no_state_gesture', 'player_utterance'];
    for (const kind of kinds) {
      const assessment = kind === 'player_safe_observation' ? {
        text: 'Игрок сообщает о неудаче.', support_refs: ['chest_1']
      } : undefined;
      const utterance = kind === 'player_utterance' ? {
        speaker_ref: 'actor_mikula', utterance_text: 'Помогите!',
        input_mode: 'verbatim',
        delivery: { loudness: 3, duration_class: 'instant' }
      } : undefined;
      const plan = achievedNoop({ goal_result: 'not_achieved',
        direct_result_kind: null,
        ...(assessment == null ? {} : { assessment }),
        ...(utterance == null ? {} : { utterance }) });
      delete plan.assessment;
      delete plan.utterance;
      const canonicalizations = [
        { attempt: 2, path: '$.goal_result', old_value: 'achieved',
          new_value: 'not_achieved' },
        ...(kind == null ? [] : [{ attempt: 2, path: '$.direct_result_kind',
          old_value: kind, new_value: null }]),
        ...(assessment == null ? [] : [{ attempt: 2, path: '$.assessment',
          removed_fields: ['assessment'] }]),
        ...(utterance == null ? [] : [{ attempt: 2, path: '$.utterance',
          removed_fields: ['utterance'] }])
      ];
      const stepTrace = traceFor({ plan, request: input, repaired: true,
        applied: false, canonicalizations });
      const envelope = { root_turn_id: input.root_turn_id,
        base_state_version: input.committed_state_version,
        checks: { results: [] }, mode_resolution: { decision_trace: {
          step_traces: [stepTrace] } } };
      const loopTrace = { version: 1, schema: 'turn_step_commit_trace_v1',
        root_turn_id: input.root_turn_id, request_id: input.request_id,
        committed_state_version: input.committed_state_version,
        status: 'resolved', stop_reason: 'terminal', working_revision: 0,
        next_step_index: 1, remaining_intent: input.remaining_intent,
        completed_steps: [], step_traces: [stepTrace], check_results: [],
        factual_events: [], clarification: null };
      const errors = [];
      validateTurnStepLoopTrace(errors, loopTrace, envelope);
      assert.deepEqual(errors, [], `kind ${kind}`);
      stepTrace.repaired = false;
      const unrepairedErrors = [];
      validateTurnStepLoopTrace(unrepairedErrors, loopTrace, envelope);
      assert.ok(unrepairedErrors.length > 0, `unrepaired kind ${kind}`);
    }
  });

test('repair-selected not_achieved clears retained forbidden fields with trace',
  async () => {
    const input = request();
    const assessment = { text: 'Попытка не удалась.', support_refs: ['shirt'] };
    const utterance = { speaker_ref: 'actor_mikula',
      utterance_text: 'Не получилось.', input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'instant' } };
    let calls = 0;
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => {
        calls += 1;
        return calls === 1 ? achievedNoop() : achievedNoop({
          goal_result: 'not_achieved',
          assessment, utterance
        });
      } });
    assert.equal(calls, 2);
    assert.equal(result.plan.goal_result, 'not_achieved');
    assert.equal(Object.hasOwn(result.plan, 'assessment'), false);
    assert.equal(Object.hasOwn(result.plan, 'utterance'), false);
    assert.deepEqual(result.canonicalizations, [
      { attempt: 2, path: '$.direct_result_kind',
        old_value: 'player_safe_observation', new_value: null },
      { attempt: 2, path: '$.assessment',
        removed_fields: ['assessment'] },
      { attempt: 2, path: '$.utterance',
        removed_fields: ['utterance'] }
    ]);
  });

test('malformed direct_result_kind types remain fail-closed', async () => {
  const input = request();
  for (const value of ['', 7, undefined]) {
    const candidate = achievedNoop({ direct_result_kind: value });
    if (value === undefined) delete candidate.direct_result_kind;
    let calls = 0;
    await assert.rejects(() => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => { calls += 1; return candidate; } }),
    (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.repair_suppressed === 'deterministic_structure_invalid');
    assert.equal(calls, 1);
  }
});

test('repair cleanup leaves malformed or missing not_achieved kind fail-closed',
  async () => {
    const input = request();
    for (const value of ['', 7, undefined]) {
      let calls = 0;
      await assert.rejects(() => requestTurnStepPlanWithRepair({ request: input,
        turnStepModel: async () => {
          calls += 1;
          if (calls === 1) return achievedNoop();
          const candidate = achievedNoop({ goal_result: 'not_achieved',
            direct_result_kind: value });
          if (value === undefined) delete candidate.direct_result_kind;
          return candidate;
        } }),
      (error) => error.code === 'TURN_STEP_PLAN_INVALID'
        && error.details.repair_attempted === true);
      assert.equal(calls, 2);
    }
  });

test('unrelated invalid plan after no-op repair remains a typed failure',
  async () => {
    const input = request();
    let calls = 0;
    await assert.rejects(() => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => {
        calls += 1;
        const candidate = achievedNoop();
        if (calls === 2) candidate.unexpected = true;
        return candidate;
      } }),
    (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.repair_attempted === true);
    assert.equal(calls, 2);
  });

test('commit trace accepts cleanup-only no-op canonicalization only when repaired',
  () => {
    const input = request();
    const plan = achievedNoop({ goal_result: 'not_achieved',
      direct_result_kind: null });
    delete plan.assessment;
    delete plan.utterance;
    const canonicalizations = [
      { attempt: 2, path: '$.assessment', removed_fields: ['assessment'] },
      { attempt: 2, path: '$.utterance', removed_fields: ['utterance'] }
    ];
    const stepTrace = traceFor({ plan, request: input, repaired: true,
      applied: false, canonicalizations });
    const envelope = { root_turn_id: input.root_turn_id,
      base_state_version: input.committed_state_version,
      checks: { results: [] }, mode_resolution: { decision_trace: {
        step_traces: [stepTrace] } } };
    const loopTrace = { version: 1, schema: 'turn_step_commit_trace_v1',
      root_turn_id: input.root_turn_id, request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      status: 'resolved', stop_reason: 'terminal', working_revision: 0,
      next_step_index: 1, remaining_intent: input.remaining_intent,
      completed_steps: [], step_traces: [stepTrace], check_results: [],
      factual_events: [], clarification: null };
    const errors = [];
    validateTurnStepLoopTrace(errors, loopTrace, envelope);
    assert.deepEqual(errors, []);
    stepTrace.repaired = false;
    const unrepairedErrors = [];
    validateTurnStepLoopTrace(unrepairedErrors, loopTrace, envelope);
    assert.ok(unrepairedErrors.length > 0);
  });
