import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlanWithRepair } from
  '../src/turn-step-plan-repair.js';
import { directPlan, request } from './turn-step-contracts-fixture.js';

function achievedNoop(overrides = {}) {
  return directPlan({ interpretation: { player_goal: 'делаю невозможное',
    grounded_attempt: 'делаю ближайшую реальную попытку',
    adaptation: 'reality_limited' },
  activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
  direct_result_kind: 'player_safe_observation', ...overrides });
}

test('reality-limited achieved no-op observation canonicalizes with exact trace',
  async () => {
    const input = request();
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => achievedNoop({ assessment: {
        text: 'Входные предметы не образуют желаемое устройство.',
        support_refs: ['chest_1']
      } }) });
    assert.equal(result.plan.goal_result, 'not_achieved');
    assert.equal(result.plan.direct_result_kind, null);
    assert.equal(Object.hasOwn(result.plan, 'assessment'), false);
    assert.deepEqual(result.canonicalizations, [
      { path: '$.goal_result', old_value: 'achieved',
        new_value: 'not_achieved' },
      { path: '$.direct_result_kind', old_value: 'player_safe_observation',
        new_value: null },
      { path: '$.assessment', old_value: {
        text: 'Входные предметы не образуют желаемое устройство.',
        support_refs: ['chest_1']
      }, new_value: null }
    ]);
    assert.equal(result.repaired, false);
  });

test('canonicalization leaves partial results and other direct actions alone',
  async () => {
    const input = request({ remaining_intent: 'Кричу: «Помогите!»' });
    const cases = [
      achievedNoop({ goal_result: 'partially_achieved' }),
      achievedNoop({ interpretation: { ...achievedNoop().interpretation,
        adaptation: 'literal' } }),
      achievedNoop({ direct_result_kind: 'player_safe_item_observation' }),
      achievedNoop({ direct_result_kind: 'player_safe_body_observation' }),
      achievedNoop({ direct_result_kind: 'no_state_gesture' }),
      achievedNoop({ direct_result_kind: 'player_utterance', utterance: {
        speaker_ref: 'actor_mikula', utterance_text: 'Помогите!',
        input_mode: 'verbatim',
        delivery: { loudness: 3, duration_class: 'instant' }
      } })
    ];
    for (const candidate of cases) {
      const candidateRequest = candidate.direct_result_kind
          === 'player_safe_body_observation'
        ? request({ ...input, actor: { ...input.actor,
          body: { active_conditions: [] } } }) : input;
      const result = await requestTurnStepPlanWithRepair({
        request: candidateRequest,
        turnStepModel: async () => candidate });
      assert.equal(result.plan.goal_result, candidate.goal_result);
      assert.equal(result.plan.direct_result_kind, candidate.direct_result_kind);
      assert.equal(result.canonicalizations, undefined);
    }
  });
