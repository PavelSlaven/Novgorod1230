import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import {
  digest,
  npcSpeechPlan,
  phase3State,
  revision14Bundle,
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';

const promiseText = 'Завтра помогу тебе связать сеть.';

function promisingNpcModel(supportingOperations) {
  const calls = [];
  const requests = [];
  const npcSemanticModel = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'npc_conversation_grounding_auditor') {
        return { output: { pass: true, concerns: [] } };
      }
      const payload = JSON.parse(call.messages[1].content);
      const request = payload.request ?? payload;
      requests.push(structuredClone(request));
      return { output: npcSpeechPlan(request, {
        utteranceText: promiseText,
        dominantAct: 'promise',
        interactionTags: request.social_context?.npc_behavior?.required_interaction_tag
          ? [request.social_context.npc_behavior.required_interaction_tag] : [],
        supportingOperations
      }) };
    } }
  });
  return { npcSemanticModel, calls, requests };
}

test('Phase 3 commits an NPC promise as ordinary speech without a route operation',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    const { npcSemanticModel, calls, requests } = promisingNpcModel([]);

    const exchange = await runPhase3({
      state, contracts,
      rawText: 'Еремей, сможешь завтра помочь мне с сетью?',
      inputDigest: digest('a'),
      responseKind: 'speech',
      npcSemanticModel
    }).catch((error) => {
      assert.fail(`Phase 3 rejected the NPC promise (${error?.code}): ${
        JSON.stringify(error?.details?.validation_errors ?? null)
      }`);
    });

    assert.equal(exchange.result.response_kind, 'withhold');
    assert.equal(exchange.result.route_disclosure, null);
    assert.deepEqual(exchange.result.decision_plan.supporting_operations, []);
    assert.deepEqual(exchange.result.supporting_operation_perceptions, []);
    assert.deepEqual(exchange.result.statements.filter(
      ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc'
    ).map(({ utterance_text: text }) => text), [promiseText]);
    assert.deepEqual(calls, [
      'npc_conversation_responder',
      'npc_conversation_grounding_auditor'
    ]);
    assert.equal(requests.length, 1);
    assert.ok(Object.hasOwn(
      requests[0].decision_scope.operation_contract,
      'disclose_known_route'
    ));
  });

test('Phase 3 rejects a promise carrying an operation absent from the NPC request',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    const { npcSemanticModel, calls, requests } = promisingNpcModel([
      { op: 'commit_surrender' }
    ]);

    await assert.rejects(runPhase3({
      state, contracts,
      rawText: 'Еремей, сможешь завтра помочь мне с сетью?',
      inputDigest: digest('a'),
      responseKind: 'speech',
      npcSemanticModel
    }), { code: 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE' });

    assert.equal(requests.length, 2);
    assert.equal(Object.hasOwn(
      requests[0].decision_scope.operation_contract,
      'commit_surrender'
    ), false);
    assert.deepEqual(calls, [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair'
    ]);
  });
