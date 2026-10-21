import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

async function captureSystem(request, repair = null) {
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: {} };
    } }
  });
  try {
    await model(request, repair === null ? {} : { repair });
  } catch (error) {
    if (calls.length === 0) throw error;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages[0].role, 'system');
  return calls[0].messages[0].content;
}

test('responder and semantic repair contain no unconditional ignorance advice',
  async () => {
    const responderRequest = structuredClone(targets.responder.user);
    responderRequest.available_resources = [];
    const repairUser = targets.semantic_repair.user;
    const repairRequest = structuredClone(repairUser.request);
    repairRequest.available_resources = [];
    const systems = {
      responder: await captureSystem(responderRequest),
      semantic_repair: await captureSystem(repairRequest, {
        kind: 'semantic', original_output: repairUser.original_output,
        validation_errors: repairUser.validation_errors
      })
    };
    const oldAdvice = [
      'or state uncertainty',
      'has no memory of that event',
      'without one, answer with uncertainty',
      'that this is not remembered or not known',
      'refuse or state uncertainty',
      'otherwise answer with uncertainty or refusal'
    ];
    const remaining = Object.entries(systems).flatMap(([role, system]) =>
      oldAdvice.filter(fragment => system.includes(fragment))
        .map(fragment => `${role}: ${fragment}`));
    assert.deepEqual(remaining, [], 'unconditional ignorance advice remains');
    for (const system of Object.values(systems)) {
      assert.match(system, /does not know or is uncertain only when no matching known fact, belief, memory event, observation, or perceived message is in the request/u);
      assert.match(system, /Final authority constraint: available_resources is empty/u);
      assert.match(system, /refuse without creating that affordance/u);
      assert.match(system, /never invent a negative observation from it/u);
    }
    assert.match(systems.semantic_repair, /MANDATORY SEMANTIC REPAIR/u);
  });
