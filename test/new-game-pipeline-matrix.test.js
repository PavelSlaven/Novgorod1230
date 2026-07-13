import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNewGameLlmTierConfig,
  getNewGameStageMatrix,
  getNewGameStageRegistry,
  NEW_GAME_MODEL_TIERS
} from '../src/world/new-game-pipeline/index.js';

test('stage matrix covers canonical 26-stage pipeline and matches registry ids', () => {
  const matrix = getNewGameStageMatrix();
  const registry = getNewGameStageRegistry();

  assert.equal(matrix.length, 26);
  assert.deepEqual(
    matrix.map((entry) => entry.stage_id),
    Array.from({ length: 26 }, (_, index) => index + 1)
  );
  assert.deepEqual(
    registry.map((entry) => entry.id),
    matrix.map((entry) => entry.stage_id)
  );
});

test('mandatory llm stages are fixed by matrix contract', () => {
  const matrix = getNewGameStageMatrix();
  const required = matrix
    .filter((entry) => entry.llm_requirement === 'required' || entry.llm_requirement === 'practically_required')
    .map((entry) => entry.stage_id);
  const optional = matrix.filter((entry) => entry.llm_requirement === 'optional').map((entry) => entry.stage_id);
  const none = matrix.filter((entry) => entry.llm_requirement === 'none').map((entry) => entry.stage_id);

  assert.deepEqual(required, [2, 3, 9, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24]);
  assert.deepEqual(optional, [4, 5, 6, 7, 8, 10, 17]);
  assert.deepEqual(none, [1, 25, 26]);
});

test('critical repair policy escalates to senior tier on second semantic failure', () => {
  const matrix = getNewGameStageMatrix();
  const criticalStages = matrix.filter((entry) => [11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24].includes(entry.stage_id));

  for (const stage of criticalStages) {
    assert.equal(stage.repair_policy.semantic_error_first_repair_tier, NEW_GAME_MODEL_TIERS.TIER_2_STANDARD);
    assert.equal(stage.repair_policy.semantic_error_second_repair_tier, NEW_GAME_MODEL_TIERS.TIER_3_SENIOR);
    assert.equal(stage.repair_policy.format_error_first_repair_tier, NEW_GAME_MODEL_TIERS.TIER_1_FAST);
  }
});

test('new-game llm tiers expose distinct deepseek profiles', () => {
  const fast = getNewGameLlmTierConfig('tier_1_fast', {});
  const standard = getNewGameLlmTierConfig('tier_2_standard', {});
  const senior = getNewGameLlmTierConfig('tier_3_senior', {});

  assert.equal(fast.model, 'deepseek-v4-flash');
  assert.equal(fast.thinking.type, 'disabled');
  assert.equal(standard.model, 'deepseek-v4-pro');
  assert.equal(standard.thinking.type, 'enabled');
  assert.equal(standard.reasoningEffort, 'high');
  assert.equal(senior.model, 'deepseek-v4-pro');
  assert.equal(senior.reasoningEffort, 'max');
});

test('prompt wiring points each llm stage to its stage runbook', () => {
  const matrix = getNewGameStageMatrix();
  const llmStages = matrix.filter((entry) => entry.primary_executor === 'llm');

  for (const stage of llmStages) {
    assert.match(stage.prompt_sources[0], new RegExp(`new_game_start/${stage.stage_id}\\.txt$`, 'u'));
    assert.equal(stage.prompt_id.includes(`stage_${String(stage.stage_id).padStart(2, '0')}`), true);
  }
});
