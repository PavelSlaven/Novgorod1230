import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateConversationContributionPlan,
  validatePlayerConversationContributionPlan
} from '@rus/npc-runtime';
import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceSemanticResolver
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('closed intent router returns its bounded selection unchanged', async () => {
  const selection = { schema: 'turn_intent_route', request_id: 'route-1',
    option_id: 'option-1', command_token: 'token-1' };
  const resolver = createLowerDvinaTraceSemanticResolver({ roleRunner: {
    async run(call) {
      assert.equal(call.role_id, 'intent_router');
      return { output: selection };
    }
  } });
  assert.deepEqual(await resolver({ request_id: 'route-1' }), selection);
});

test('conversation prompts supply complete shapes and request-bound mappings',
  async () => {
    const calls = [];
    const roleRunner = { async run(call) {
      calls.push(call);
      return { output: {} };
    } };
    await createLowerDvinaTracePlayerConversationModel({ roleRunner })({});
    await createLowerDvinaTraceNpcSemanticModel({ roleRunner })({});

    const [player, npc] = calls.map(({ messages }) => messages[0].content);
    const playerShape = JSON.parse(player.match(
      /Use this complete semantic JSON shape;[^\n]*:\n(\{[^\n]+\})/u
    )[1]);
    const npcShape = JSON.parse(npc.match(
      /Use this complete semantic JSON shape;[^\n]*:\n(\{[^\n]+\})/u
    )[1]);
    const mappings = JSON.parse(player.match(
      /Use these mappings for matching cases:\n(\{[^\n]+\})/u
    )[1]);
    assert.equal('schema' in playerShape, false);
    assert.equal(playerShape.input_mode, '<verbatim or intent_paraphrase>');
    assert.deepEqual(Object.keys(playerShape), [
      'input_mode', 'contribution_kind', 'primary_addressee_ref',
      'intended_addressee_refs', 'affected_actor_refs', 'speech',
      'interpretation', 'resolution', 'activity', 'supporting_operations',
      'check', 'handoff'
    ]);
    assert.equal('schema' in npcShape, false);
    assert.deepEqual(Object.keys(npcShape), [
      'contribution_kind',
      'primary_addressee_ref', 'intended_addressee_refs',
      'affected_actor_refs', 'speech', 'interpretation', 'resolution',
      'activity', 'supporting_operations', 'check', 'handoff', 'reason'
    ]);
    assert.deepEqual(mappings.ordinary_speech, {
      contribution_kind: 'speech', interpretation: { adaptation: 'literal' },
      resolution: 'automatic', supporting_operations: [], check: null,
      handoff: null
    });
    const nonSpeechKinds = [
      'silence', 'leave_conversation', 'action_handoff', 'combat_handoff'
    ];
    assert.deepEqual(nonSpeechKinds.map((kind) =>
      mappings[kind].contribution_kind), nonSpeechKinds);
    for (const kind of nonSpeechKinds) {
      assert.equal(mappings[kind].contribution_kind, kind);
      assert.equal(mappings[kind].speech, null);
      assert.deepEqual(mappings[kind].supporting_operations, []);
      assert.equal(mappings[kind].check, null);
    }
    assert.equal(mappings.action_handoff.handoff.kind, 'actor_step');
    assert.equal(mappings.combat_handoff.handoff.kind, 'combat');
    assert.equal(mappings.social_check.resolution, 'check_required');
    assert.deepEqual(Object.keys(mappings.social_check.check.outcomes), [
      'clean_success', 'success', 'success_with_cost',
      'failure_with_consequence', 'severe_failure'
    ]);
    for (const prompt of [player, npc]) {
      assert.match(prompt, /emit_interaction/u);
      assert.match(prompt, /operation_contract/u);
      assert.match(prompt, /check_required/u);
      assert.match(prompt, /do not invent or substitute refs/u);
    }
    assert.match(player, /input_mode verbatim/u);
    assert.match(npc, /decision_scope allowed check refs/u);
    for (const prompt of [player, npc]) {
      assert.match(prompt, /speech: null/u);
      assert.match(prompt, /refs\/handoff only from request contract/u);
      assert.match(prompt, /greet, farewell, question, answer, inform/u);
      assert.match(prompt, /topic_refs contain only string ids/u);
      assert.match(prompt, /never entity-ref objects/u);
      assert.match(prompt, /supporting_operations must be \[required_supporting_operation\]/u);
    }
    assert.match(npc, /required_check\.attribute_ref, skill_ref, and difficulty_band/u);
  });

test('conversation non-speech mappings have validator-valid shapes', () => {
  const variants = [{ kind: 'silence', handoff: null }, {
    kind: 'leave_conversation', handoff: null
  }, {
    kind: 'action_handoff', handoff: { kind: 'actor_step', intent: 'continue' }
  }, {
    kind: 'combat_handoff', handoff: {
      kind: 'combat', intent: 'fight',
      target_actor_refs: [{ entity_kind: 'npc', entity_id: 'npc-1' }]
    }
  }];
  for (const { kind, handoff } of variants) {
    const body = {
      contribution_kind: kind, primary_addressee_ref: null,
      intended_addressee_refs: [], affected_actor_refs: [], speech: null,
      interpretation: { intent: kind, grounded_contribution: kind,
        adaptation: 'literal' }, resolution: 'automatic',
      activity: { duration_class: 'brief', effort: 'none' },
      supporting_operations: [], check: null, handoff
    };
    assert.equal(validatePlayerConversationContributionPlan({
      schema: 'player_conversation_contribution_plan_v1', request_id: 'request-1',
      conversation_id: 'conversation-1', state_version: 1,
      speaker_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
      input_mode: 'intent_paraphrase', ...body
    }), true, kind);
    assert.equal(validateConversationContributionPlan({
      schema: 'conversation_contribution_plan_v1', request_id: 'request-1',
      boundary_id: 'boundary-1', conversation_id: 'conversation-1',
      exchange_id: 'exchange-1', state_version: 1,
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' }, ...body,
      reason: 'NPC chooses this contribution.'
    }), true, kind);
  }
});
