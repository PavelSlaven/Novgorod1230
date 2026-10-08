import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

const SOURCE = 'm2c_finite_deadwood_v1:abc';
const intent = 'Беру валежник.';
const state = (status = 'known') => ({ position: { position_id: 'pos:focus' },
  items: [], ordinary_resolution: { discovery_available: true, scene_seed_available: false,
    container_resolution_available: false },
  current_visible_context: { visible_objects: [{ entity_ref: {
    entity_kind: 'ordinary_resource_source', entity_id: SOURCE },
  display_label: 'валежник', recognition: 'code_owned_committed_source',
  visible_status: status }] } });
const request = (playerSafe = state()) => ({ request_id: 'r1', remaining_intent: intent,
  actor: { actor_ref: 'actor:1' }, player_safe_state: playerSafe });
const plan = (overrides = {}) => ({ interpretation: { adaptation: 'literal',
  grounded_attempt: intent }, resolution: 'domain_request', goal_result: 'pending',
clarification: null, direct_result_kind: null, check: null,
operations: [{ op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'inspect',
  target_refs: [SOURCE], query: 'валежник' }],
continuation: { remaining_intent: intent, depends_on_refs: [] }, ...overrides });
const resolved = [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }];
function validator() {
  const calls = [];
  const roleRunner = { async run(call) { calls.push(call.role_id);
    return { output: { pass: false, concerns: [{ kind: 'operation_semantic_grounding' }] } }; } };
  return { calls, validate: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) };
}

test('taking from a visible committed finite source is grounded by code, without the LLM auditor', async () => {
  const { calls, validate } = validator();
  assert.equal(await validate({ plan: plan(), request: request(),
    resolved_domain_operations: resolved }), true);
  assert.deepEqual(calls, []);
});

test('inspect-only intent on a finite source needs no continuation', async () => {
  const { calls, validate } = validator();
  const inspect = { ...request(), remaining_intent: 'валежник' };
  assert.equal(await validate({ plan: plan({ continuation: null }), request: inspect,
    resolved_domain_operations: resolved }), true);
  assert.deepEqual(calls, []);
});

test('the code shortcut never covers other targets, hidden sources or dropped intent', async () => {
  for (const [label, candidate, req] of [
    ['other target', plan({ operations: [{ op: 'request_discovery', actor_ref: 'actor:1',
      discovery_kind: 'inspect', target_refs: ['pos:focus'], query: 'валежник' }] }), request()],
    ['hidden source', plan(), request(state('hidden'))],
    ['dropped intent', plan({ continuation: { remaining_intent: 'Иду дальше.',
      depends_on_refs: [] } }), request()],
    ['no continuation, query differs', plan({ continuation: null }), request()]
  ]) {
    const { validate } = validator();
    await assert.rejects(() => validate({ plan: candidate, request: req,
      resolved_domain_operations: resolved }), { code: 'TURN_STEP_PLAN_INVALID' }, label);
  }
});
