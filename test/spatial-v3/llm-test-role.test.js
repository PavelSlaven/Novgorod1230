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

test('recognizes router from production semantic-resolution request schema', () => {
  assert.equal(identifyLlmTestRole({ body: { messages: [
    { role: 'user', content: JSON.stringify({
      version: 1,
      schema: 'turn_semantic_resolution_request',
      raw_text: 'Осматриваюсь вокруг.',
      action_set: [{
        option_id: 'look', label: 'Осмотреться', actor_id: 'actor-1',
        target_id: null, preconditions: [], expected_cost: {}, known_risks: [],
        reason_visible_to_actor: null, state_version: 1, metadata: {}
      }],
      action_set_digest: 'sha256:fixture',
      state_version: 1,
      policy_id: 'fixture-policy',
      policy_version: 1
    }) }
  ] } }), 'intent_router');
});

test('fails closed for shared JSON response format and unrelated payloads', () => {
  assert.equal(identifyLlmTestRole({ response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: '{"mode":"narration"}' }] }), null);
});

test('does not guess the router from an unschematized player-text shape', () => {
  assert.equal(identifyLlmTestRole({ body: { messages: [
    { role: 'user', content: JSON.stringify({ player_text: 'look', current_state: {} }) }
  ] } }), null);
});
