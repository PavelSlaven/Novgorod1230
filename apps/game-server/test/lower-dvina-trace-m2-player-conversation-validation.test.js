import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3ConversationCommand } from
  '../src/runtime/lower-dvina-trace-phase-3-conversation-command.js';
import {
  digest,
  phase3State,
  ref,
  revision14Bundle,
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('quoted verbatim input persists only the explicitly spoken words',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Говорю: «Покажи паспорт».',
      inputDigest: digest('e'),
      responseKind: 'speech',
      playerPlanOptions: { utteranceText: 'Покажи паспорт' }
    });

    assert.equal(
      exchange.result.statements[0].utterance_text,
      'Покажи паспорт'
    );
  });

test('unknown player entity ref is rejected before statement or state change',
  async () => {
    const state = phase3State();
    const before = structuredClone(state);
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    await assert.rejects(runPhase3({
      state,
      contracts,
      rawText: 'Еремей, я видел тайный проход.',
      inputDigest: digest('d'),
      responseKind: 'speech',
      transformPlayerPlan: (plan) => {
        plan.speech.claims = [{
          claim_id: 'hidden-route',
          content_summary: 'Есть тайный проход.',
          form: 'assertion',
          speaker_posture: 'believed_true',
          source_knowledge_refs: [],
          mentioned_entity_refs: [ref('route', 'hidden-route')]
        }];
        return plan;
      }
    }), ({ code }) => code === 'TURN_CONVERSATION_PLAN_INVALID');
    assert.deepEqual(state, before);
  });

test('revision 14 semantic command has no bounded-only NPC policy precondition',
  () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    const command = createTracePhase3ConversationCommand({
      contracts,
      evidence: false,
      inputDigest: digest('semantic-preconditions'),
      playerConversationModel: async () => null,
      npcSemanticModel: async () => null,
      revalidateStateVersion: async () => state.party_state.state_version
    });

    assert.equal(command.preconditions.some(
      ({ kind }) => kind === 'npc_policy_state'), false);
  });
