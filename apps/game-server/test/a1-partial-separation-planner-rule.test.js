import assert from 'node:assert/strict';
import test from 'node:test';
import { TURN_STEP_PLANNER_INSTRUCTIONS } from
  '../src/runtime/lower-dvina-trace-turn-step-planner-instructions.js';

// Bench rt-make-a1 (real Qwen, real v17 packet at water_access, 15 phrases): without result_class in this rule
// 13 of 28 "tear a strip" plans were rejected (ordinary_physical_result together with source_fact_delta);
// with it and the allowed_physical_forms clause 16 of 17 make plans were accepted. The bench lives outside the
// repository (/srv/novgorod-work/benches/rt-make-a1/); this test pins only the rule text.
test('planner is told that a partial separation is a partial_transformation with an allowed surviving form', () => {
  const text = TURN_STEP_PLANNER_INSTRUCTIONS.join(' ');
  const rule = text.match(/A partial separation[^]*?allowed_physical_forms[^.]*\./u)?.[0];
  assert.ok(rule, 'partial separation rule is missing');
  for (const part of ['result_class partial_transformation', 'never ordinary_physical_result',
    'exactly one source', 'material_extent minor|half|major', 'source_fact_delta',
    'never none or an object name']) assert.ok(rule.includes(part), part);
});
