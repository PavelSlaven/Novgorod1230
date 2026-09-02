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
          concerns: [{ kind: 'source_semantic_mismatch',
            reason: 'The knife is not the named board.' }] } };
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
        concerns: [{ kind: 'missing_required_source_move',
          reason: 'Taking the board requires a move.' }] } }; } },
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
        concerns: [{ kind: 'missing_required_source_move',
          reason: 'Taking the net requires a move.' },
        { kind: 'source_semantic_mismatch',
          reason: 'The shirt is not the named net.' }] } }; } },
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

test('grounding audit rejects a selected domain operation for another action',
  async () => {
    const operation = { op: 'request_discovery', actor_ref: 'actor',
      discovery_kind: 'inspect', target_refs: ['shore'],
      query: 'Подробно осмотреть место крушения.' };
    let payload;
    const result = await auditTurnStepSourceGrounding({
      roleRunner: { async run(call) {
        payload = JSON.parse(call.messages[1].content);
        return { output: { pass: false,
          concerns: [{ kind: 'operation_semantic_mismatch',
            reason: 'The authored wreck inspection does not cover looking around.' }] } };
      } },
      plan: { operations: [operation], continuation: {
        remaining_intent: 'Собрать ветки и пойти вдоль воды.',
        depends_on_refs: []
      } },
      request: { request_id: 'request-operation',
        root_player_action: 'Оглядываю берег, собираю ветки и иду вдоль воды.',
        remaining_intent:
          'Оглядываю берег, собираю ветки и иду вдоль воды.',
        completed_steps: [], available_domain_operations: [operation],
        player_safe_state: {} }
    });
    assert.equal(result.errors[0].code, 'operation_semantic_grounding');
    assert.deepEqual(payload.selected_domain_operations, [{
      path: '$.operations.0', operation
    }]);
    assert.deepEqual(payload.continuation, {
      remaining_intent: 'Собрать ветки и пойти вдоль воды.',
      depends_on_refs: []
    });
  });

test('selected domain audit ignores impossible source concerns without A1',
  async () => {
    const operation = { op: 'request_movement', actor_ref: 'actor',
      movement_kind: 'route', target_ref: 'camp' };
    const result = await auditTurnStepSourceGrounding({
      roleRunner: { async run() { return { output: { pass: false,
        concerns: [{ kind: 'source_semantic_mismatch',
          reason: 'hallucinated source concern' }] } }; } },
      plan: { operations: [operation], continuation: null },
      request: { request_id: 'hostile-source', root_player_action: 'Иду в стан.',
        remaining_intent: 'Иду в стан.', completed_steps: [],
        available_domain_operations: [operation], player_safe_state: {} }
    });
    assert.equal(result, true);
  });

test('unselected non-production turn skips grounding model', async () => {
  let calls = 0;
  assert.equal(await auditTurnStepSourceGrounding({
    roleRunner: { async run() { calls += 1; } },
    plan: { operations: [] }, request: {}
  }), true);
  assert.equal(calls, 0);
});
