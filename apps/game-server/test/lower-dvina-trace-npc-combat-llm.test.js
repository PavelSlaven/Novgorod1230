import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcCombatModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('combat model uses the registered decider and repair roles', async () => {
  const calls = [];
  const output = { schema: 'npc_combat_intent_plan_v1' };
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner: {
    run: async (request) => { calls.push(request); return { output }; }
  } });
  const request = { schema: 'npc_combat_decision_request_v1' };
  assert.equal(await model(request), output);
  assert.equal(await model(request, { repair: { original_output: {},
    validation_errors: ['invalid'] } }), output);
  assert.equal(calls[0].role_id, 'npc_combat_decider');
  assert.equal(calls[1].role_id, 'npc_combat_decider_format_repair');
  for (const call of calls) {
    const prompt = call.messages[0].content;
    for (const phrase of [
      'Use this complete JSON shape:',
      '"schema":"npc_combat_intent_plan_v1"',
      '"npc_ref":{"entity_kind":"npc","entity_id":"<copy request.npc_ref.entity_id>"}',
      '"op":"set_combat_intent"',
      '"target_refs":[]',
      '"protected_refs":[]',
      '"scope_ref":null',
      '"destination_ref":null',
      'Copy intent_kind, force_limit, risk_posture,',
      'candidate sets; never invent, rename, or combine closed values/refs.'
    ]) assert.equal(prompt.includes(phrase), true, phrase);
  }
});
