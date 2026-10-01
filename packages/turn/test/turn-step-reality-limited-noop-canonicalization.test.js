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
    const cases = [null, 'player_safe_observation',
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
        { path: '$.goal_result', old_value: 'achieved',
          new_value: 'not_achieved' },
        ...(kind == null ? [] : [{ path: '$.direct_result_kind',
          old_value: kind, new_value: null }]),
        ...(extra.utterance == null ? [] : [{ path: '$.utterance',
          old_value: extra.utterance, new_value: null }])
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
    const kinds = [null, 'player_safe_observation',
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
        { path: '$.goal_result', old_value: 'achieved',
          new_value: 'not_achieved' },
        ...(kind == null ? [] : [{ path: '$.direct_result_kind',
          old_value: kind, new_value: null }]),
        ...(assessment == null ? [] : [{ path: '$.assessment',
          old_value: assessment, new_value: null }]),
        ...(utterance == null ? [] : [{ path: '$.utterance',
          old_value: utterance, new_value: null }])
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
    }
  });
