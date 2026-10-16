import assert from 'node:assert/strict';
import test from 'node:test';
import { identifyLlmTestRole } from './llm-test-role.js';
import { buildProviderRequestPayload } from '../../packages/llm-runtime/src/provider-request.js';

test('uses explicit role metadata and normalizes planner repair calls', () => {
  assert.equal(identifyLlmTestRole({ role_id: 'intent_router' }), 'intent_router');
  assert.equal(identifyLlmTestRole({ role_id: 'turn_step_planner' }),
    'turn_step_planner');
  assert.equal(identifyLlmTestRole({ role_id: 'turn_step_planner_repair' }),
    'turn_step_planner');
  assert.equal(identifyLlmTestRole({ role_id: 'world_knowledge_query_planner' }),
    'world_knowledge_query_planner');
});

test('recognizes schema-less production WK planner main and repair bodies', () => {
  const request = { purpose: 'semantic_resolution', input_locale: 'ru',
    semantic_input: 'Как ловят рыбу?', situation_summary: 'У берега.',
    allowed_domains: ['craft_technology'],
    available_knowledge_refs: { 'wk:craft_technology:fishing-net': {
      domains: ['craft_technology'],
      label: 'Ловля рыбы', description: 'Способы ловли рыбы.' } },
    planner_limits: { max_domains: 3, max_search_hints: 8, max_focus_refs: 8 } };
  const bodyFor = (input) => buildProviderRequestPayload({
    compatibility: 'openai_compatible', model: 'fixture', maxTokens: 100,
    responseFormat: { type: 'json_object' }, temperature: 0, topP: 1
  }, [{ role: 'system', content: 'fixture' },
    { role: 'user', content: JSON.stringify(input) }]);
  const main = bodyFor(request);
  const repair = bodyFor({ request, original_output: {
    schema: 'world_knowledge_query_plan_v1',
    focus_refs: ['wk:craft_technology:fishing-net'] },
  structural_errors: ['invalid plan'], repair_instruction: 'Исправьте план.' });
  assert.equal(JSON.parse(main.messages[1].content).schema, undefined);
  assert.equal(JSON.parse(repair.messages[1].content).request.schema, undefined);
  assert.equal(identifyLlmTestRole(main), 'world_knowledge_query_planner');
  assert.equal(identifyLlmTestRole(repair), 'world_knowledge_query_planner');
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
