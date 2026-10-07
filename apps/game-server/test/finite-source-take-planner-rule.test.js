import assert from 'node:assert/strict';
import test from 'node:test';
import { TURN_STEP_PLANNER_INSTRUCTIONS } from
  '../src/runtime/lower-dvina-trace-turn-step-planner-instructions.js';

// Bench rt-items-take (real Qwen, real v17 packet, 10 take phrases x5): without this rule take-intent plans
// were correct 21/50. Variant V4 (this exact text): 45/50 discovery on the source with the intent kept in
// continuation plus 3/50 on the position by the general path, 48/50 in total. The 90% threshold lives in the
// bench outside the repository (/srv/novgorod-work/benches/rt-items-take/, results-V4.json); this test pins
// only the rule text, keep it in sync with the bench.
test('planner is told how to take from an ordinary_resource_source', () => {
  const rule = TURN_STEP_PLANNER_INSTRUCTIONS.find((instruction) =>
    instruction.includes('ordinary_resource_source'));
  assert.ok(rule, 'ordinary_resource_source rule is missing');
  for (const part of ['code_owned_committed_source', 'а не ambient_ordinary_capability',
    'никогда не являются create_entity или прямым достигнутым результатом',
    'request_discovery', 'discovery_kind inspect',
    'target_refs в точности [entity_id этого источника]',
    'query в точности его display_label', 'continuation.remaining_intent',
    'равное request.remaining_intent']) assert.ok(rule.includes(part), part);
});
