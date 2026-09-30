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
  const text = TURN_STEP_PLANNER_INSTRUCTIONS.join(' ');
  const rule = text.match(/A visible ordinary_resource_source[^]*?remaining_intent\)\./u)?.[0];
  assert.ok(rule, 'ordinary_resource_source rule is missing');
  for (const part of ['code_owned_committed_source', 'not an ambient_ordinary_capability',
    'never create_entity', 'never a direct achieved result', 'request_discovery',
    'discovery_kind inspect', 'target_refs exactly [that source entity_id]',
    'query exactly its display_label', 'continuation.remaining_intent',
    'equal to request.remaining_intent']) assert.ok(rule.includes(part), part);
});
