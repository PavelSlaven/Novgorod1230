import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3ConversationCommand } from
  '../src/runtime/lower-dvina-trace-phase-3-conversation-command.js';
import { buildNpcSemanticConversationWriteInput } from
  '../src/infrastructure/postgres/npc-semantic-conversation-write-input.js';
import { appendNpcSemanticConversationWrites } from
  '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import {
  digest,
  phase3State,
  projectPhase3Conversation,
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

test('player conversation supports non-speech lifecycle contributions',
  async () => {
    const cases = [
      ['silence', null, 'active', '1'],
      ['leave_conversation', null, 'ended', '2'],
      ['action_handoff', {
        kind: 'actor_step', intent: 'leave the conversation and continue acting'
      }, 'suspended', '3'],
      ['combat_handoff', {
        kind: 'combat', intent: 'attack the addressed NPC', target_actor_refs: null
      }, 'suspended', '4']
    ];
    for (const [contributionKind, handoffTemplate, expectedStatus,
      digestCharacter] of cases) {
      const state = phase3State();
      const contracts = resolveTracePhase3Contracts({
        state, bundle: revision14Bundle
      });
      const targetRef = ref('npc',
        contracts.actors.find(({ ref: actorRef }) =>
          actorRef === 'eremey_fisher').instance_id);
      const handoff = handoffTemplate?.kind === 'combat'
        ? { ...handoffTemplate, target_actor_refs: [targetRef] }
        : handoffTemplate;
      const exchange = await runPhase3({
        state,
        contracts,
        rawText: contributionKind === 'silence'
          ? 'Молча смотрю на Еремея.' : 'Прекращаю разговор.',
        inputDigest: digest(digestCharacter),
        responseKind: 'speech',
        transformPlayerPlan(plan) {
          plan.contribution_kind = contributionKind;
          plan.primary_addressee_ref = null;
          plan.intended_addressee_refs = contributionKind === 'silence'
            ? [targetRef] : [];
          plan.speech = null;
          plan.interpretation = {
            intent: contributionKind,
            grounded_contribution: contributionKind,
            adaptation: 'literal'
          };
          plan.resolution = 'automatic';
          plan.check = null;
          plan.supporting_operations = [];
          plan.handoff = handoff;
          return plan;
        }
      });

      assert.equal(exchange.result.exchange.session_status, expectedStatus);
      assert.deepEqual(exchange.result.exchange.handoff, handoff);
      assert.equal(exchange.npcCalls, contributionKind === 'silence' ? 1 : 0);
      const next = projectPhase3Conversation({ state, contracts,
        result: exchange.result, inputDigest: digest(digestCharacter) });
      const session = next.conversation_sessions.find(
        ({ conversation_id: id }) =>
          id === exchange.result.exchange.contributions[0].conversation_id
      );
      assert.equal(session.status, expectedStatus);
      assert.equal(session.initiator_ref.entity_kind, 'player_character');
      assert.deepEqual(session.started_at, state.clock);
      assert.equal(next.conversation_contributions.some(
        ({ contribution_kind: kind }) => kind === contributionKind), true);
      const writes = { inserts: [], updates: [], appends: [] };
      appendNpcSemanticConversationWrites({ ...writes,
        partyId: state.party_id,
        changeSetId: `change:player-${contributionKind}`,
        idempotencyRecordId: `idem:player-${contributionKind}`,
        rootTurnId: `turn:player-${contributionKind}`,
        workingRevision: 0,
        ...buildNpcSemanticConversationWriteInput({ state, next,
          semanticExchange: exchange.result }) });
      assert.equal(writes.appends.some(({ target_table: table }) =>
        table === 'party_conversation_contributions'), true);
    }
  });
