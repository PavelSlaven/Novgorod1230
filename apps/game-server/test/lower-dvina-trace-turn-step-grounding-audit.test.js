import assert from 'node:assert/strict';
import test from 'node:test';

import { auditTurnStepSourceGrounding } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

test('action-production grounding audit receives only each source own evidence',
  async () => {
    let call;
    const result = await auditTurnStepSourceGrounding({
      roleRunner: { async run(input) {
        call = input;
        return { output: { pass: false,
          concerns: [{ kind: 'source_semantic_mismatch' }] } };
      } },
      plan: { operations: [{ op: 'request_item_use', action_production: {
        source_refs: ['item:knife'] } }] },
      request: { request_id: 'request-1',
        remaining_intent: 'Сделать опору из доски и снасти.',
        player_safe_state: {
          items: [{ item_id: 'item:knife', category_id: 'utility_knife' },
            { item_id: 'item:coat', name: 'кафтан' }],
          current_visible_context: {
            sensory_details: ['У воды лежат доски и обрывки снастей.'],
            visible_objects: []
          }
        } }
    });
    assert.equal(result.pass, false);
    assert.equal(result.errors[0].code, 'source_semantic_grounding');
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    const payload = JSON.parse(call.messages[1].content);
    assert.deepEqual(payload.sources, [{ source_ref: 'item:knife',
      item: { category_id: 'utility_knife' }, visible: null }]);
    assert.doesNotMatch(call.messages[1].content, /кафтан/u);
  });

test('non-production turn skips grounding model', async () => {
  let calls = 0;
  assert.equal(await auditTurnStepSourceGrounding({
    roleRunner: { async run() { calls += 1; } },
    plan: { operations: [] }, request: {}
  }), true);
  assert.equal(calls, 0);
});
