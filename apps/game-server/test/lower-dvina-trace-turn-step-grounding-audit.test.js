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
        root_player_action: 'Сделать опору из доски и снасти.',
        remaining_intent: 'Сделать опору из доски и снасти.',
        completed_steps: [],
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
    assert.deepEqual(payload.action_productions[0].sources, [{ source_ref: 'item:knife',
      item: { category_id: 'utility_knife' }, visible: null,
      placement: null }]);
    assert.equal(payload.root_player_action,
      'Сделать опору из доски и снасти.');
    assert.doesNotMatch(call.messages[1].content, /кафтан/u);
  });

test('grounding audit includes every direct and checked action production',
  async () => {
    let payload;
    await auditTurnStepSourceGrounding({ roleRunner: { async run(call) {
      payload = JSON.parse(call.messages[1].content);
      return { output: { pass: true, concerns: [] } };
    } }, plan: { operations: [{ op: 'request_item_use', action_production: {
      source_refs: ['item:a'] } }], check: { outcomes: { success: {
      operations: [{ op: 'request_item_use', action_production: {
        source_refs: ['item:b'] } }] } } } }, request: { request_id: 'all',
      root_player_action: 'обработать обе вещи',
      remaining_intent: 'обработать обе вещи', completed_steps: [],
      player_safe_state: { items: [{ item_id: 'item:a', name: 'доска' },
        { item_id: 'item:b', name: 'верёвка' }] } } });
    assert.deepEqual(payload.action_productions.map(({ path }) => path), [
      '$.operations.0', '$.check.outcomes.success.operations.0'
    ]);
  });

test('grounding audit reports an explicit source relocation omitted by plan',
  async () => {
    let call;
    const result = await auditTurnStepSourceGrounding({
      roleRunner: { async run(input) { call = input; return { output: { pass: false,
        concerns: [{ kind: 'missing_required_source_move' }] } }; } },
      plan: { operations: [{ op: 'request_item_use', action_production: {
        source_refs: ['item:board'] } }] },
      request: { request_id: 'request-2', actor: { actor_id: 'actor' },
        root_player_action: 'Подбираю доску и делаю опору.',
        remaining_intent: 'Подбираю доску и делаю опору.',
        completed_steps: [], player_safe_state: { items: [{
          item_id: 'item:board', name: 'доска',
          placement: { anchor_id: 'shore' }
        }] } }
    });
    assert.equal(result.errors[0].code, 'source_placement_grounding');
    assert.match(call.messages[0].content,
      /report every present concern once/u);
  });

test('grounding audit preserves semantic and placement concerns together',
  async () => {
    const result = await auditTurnStepSourceGrounding({
      roleRunner: { async run() { return { output: { pass: false,
        concerns: [{ kind: 'missing_required_source_move' },
          { kind: 'source_semantic_mismatch' }] } }; } },
      plan: { operations: [{ op: 'request_item_use', action_production: {
        source_refs: ['item:shirt'] } }] },
      request: { request_id: 'request-both', actor: { actor_id: 'actor' },
        root_player_action: 'Беру сеть и чиню её.',
        remaining_intent: 'Беру сеть и чиню её.', completed_steps: [],
        player_safe_state: { items: [{ item_id: 'item:shirt',
          name: 'льняная рубаха' }] } }
    });
    assert.deepEqual(result.errors.map(({ code }) => code), [
      'source_semantic_grounding', 'source_placement_grounding'
    ]);
  });

test('non-production turn skips grounding model', async () => {
  let calls = 0;
  assert.equal(await auditTurnStepSourceGrounding({
    roleRunner: { async run() { calls += 1; } },
    plan: { operations: [] }, request: {}
  }), true);
  assert.equal(calls, 0);
});
