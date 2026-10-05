import assert from 'node:assert/strict';
import test from 'node:test';
import { identifyLlmTestRole } from './llm-test-role.js';

test('uses explicit role metadata and normalizes planner repair calls', () => {
  assert.equal(identifyLlmTestRole({ role_id: 'intent_router' }), 'intent_router');
  assert.equal(identifyLlmTestRole({ role_id: 'turn_step_planner' }),
    'turn_step_planner');
  assert.equal(identifyLlmTestRole({ role_id: 'turn_step_planner_repair' }),
    'turn_step_planner');
  assert.equal(identifyLlmTestRole({ role_id: 'world_knowledge_query_planner' }),
    'world_knowledge_query_planner');
});

test('recognizes WK planner from the stable user request schema', () => {
  assert.equal(identifyLlmTestRole({ messages: [
    { role: 'user', content: JSON.stringify({ request: {
      schema: 'world_knowledge_query_planner_request_v1'
    } }) }
  ] }), 'world_knowledge_query_planner');
});

test('recognizes turn-step planner from structured request identity fields', () => {
  assert.equal(identifyLlmTestRole({ messages: [
    { role: 'user', content: JSON.stringify({
      request_id: 'fixture-turn-1', step_index: 1, root_player_action: 'look'
    }) }
  ] }), 'turn_step_planner');
});

test('recognizes router from its structured player-text input', () => {
  assert.equal(identifyLlmTestRole({ body: { messages: [
    { role: 'user', content: JSON.stringify({
      request_id: 'fixture-router-1', player_text: 'look', current_state: {}
    }) }
  ] } }), 'intent_router');
});

test('fails closed for shared JSON response format and unrelated payloads', () => {
  assert.equal(identifyLlmTestRole({ response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: '{"mode":"narration"}' }] }), null);
});
