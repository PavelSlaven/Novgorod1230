import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from
  '@rus/npc-runtime';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const subject = projectNpcConversationSubject({
  npc_ref: ref('npc', 'npc-1'),
  npc_snapshot: { instance_id: 'npc-1' },
  current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
});
const INTENT_PATH = '$.interpretation.intent';
const AUDITOR_CODE = 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED';

function request() {
  const input = {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: subject.npc, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [], knowledge: subject.knowledge,
    memory: subject.memory, social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [...subject.knowledge_refs],
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [],
      allowed_skill_refs: [], allowed_check_profile_refs: [],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} }
    }
  };
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: input.npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    ...input.decision_reasons, state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  return input;
}

function plan(input) {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [], speech: { utterance_text: 'Я отвечу.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить и дать неподкреплённое обещание',
      grounded_contribution: 'дать ответ', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned',
      effort: 'none' }, supporting_operations: [], check: null, handoff: null,
    reason: 'NPC chooses to answer.'
  };
}

function repairedPlan(original) {
  const repaired = structuredClone(original);
  repaired.interpretation.intent = 'ответить';
  return repaired;
}

function concern(code, path, category = 'semantic_grounding') {
  return { code, category, path,
    quote: 'неподкреплённое обещание' };
}

async function directRepair({ original, repaired, errors }) {
  const input = request();
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      calls.push(call);
      assert.equal(call.role_id, 'npc_conversation_responder_format_repair');
      assert.equal(call.repair_kind, 'semantic');
      return { output: repaired };
    }
  } });
  const result = await model(input, { repair: {
    kind: 'semantic', original_output: original,
    validation_errors: errors
  } }).then((value) => value, (error) => error);
  assert.equal(calls.length, 1);
  return { result, system: calls[0].messages[0].content };
}

function assertChangedIntentRejected(error) {
  assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(error.details.category, 'semantic');
  assert.deepEqual(error.details.validation_errors.map(
    ({ code, category, path }) => ({ code, category, path })), [{
    code: 'semantic_repair_changed_act', category: 'semantic_grounding',
    path: INTENT_PATH
  }]);
}

test('semantic repair may change only intent when the grounding auditor names intent',
  async () => {
    const input = request();
    const original = plan(input);
    const repaired = repairedPlan(original);
    const { result } = await directRepair({ original, repaired,
      errors: [concern(AUDITOR_CODE, INTENT_PATH)] });
    if (result?.details?.validation_errors) {
      assert.deepEqual(result.details.validation_errors.map(
        ({ code, category, path }) => ({ code, category, path })), []);
    }
    assert.equal(result?.code, undefined);
    assert.equal(result.interpretation.intent, 'ответить');
    assert.equal(result.contribution_kind, original.contribution_kind);
    assert.equal(result.speech.dominant_act, original.speech.dominant_act);
    assert.deepEqual(result.primary_addressee_ref,
      original.primary_addressee_ref);
    assert.deepEqual(result.intended_addressee_refs,
      original.intended_addressee_refs);
  });

test('a different error code at the intent path cannot authorize semantic repair',
  async () => {
    const input = request();
    const original = plan(input);
    const { result } = await directRepair({ original,
      repaired: repairedPlan(original),
      errors: [concern('invalid_type', INTENT_PATH, 'format')] });
    assertChangedIntentRejected(result);
  });

test('a presentation error at the intent path cannot authorize semantic repair',
  async () => {
    const input = request();
    const original = plan(input);
    const { result } = await directRepair({ original,
      repaired: repairedPlan(original),
      errors: [concern('TRACE_NPC_REQUIRED_PRESENTATION_MISSING',
        INTENT_PATH)] });
    assertChangedIntentRejected(result);
  });

test('the source-ref precheck cannot authorize an intent change', async () => {
  const input = request();
  const original = plan(input);
  original.speech.claims = [{ claim_id: 'answer',
    content_summary: 'Я отвечу.', form: 'assertion',
    speaker_posture: 'believed_true', source_knowledge_refs: [],
    mentioned_entity_refs: [], confidence: 'high' }];
  const repaired = repairedPlan(original);
  repaired.speech.claims = [];
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      calls.push(call);
      assert.equal(call.role_id, 'npc_conversation_responder_format_repair');
      return { output: repaired };
    }
  } });
  const precheck = await model.validateFreshPlan(original, input);
  assert.equal(calls.length, 0);
  assert.equal(precheck.pass, false);
  assert.deepEqual(precheck.errors.map(({ code, category, path,
    concern_kinds }) => ({ code, category, path, concern_kinds })), [{
    code: AUDITOR_CODE, category: 'semantic_grounding',
    path: '$.speech.claims[0].source_knowledge_refs',
    concern_kinds: ['claim_without_source_knowledge']
  }]);
  const error = await model(input, { repair: { kind: 'semantic',
    original_output: original,
    validation_errors: precheck.errors } }).then(
    () => assert.fail('intent change unexpectedly succeeded'),
    (failure) => failure);
  assertChangedIntentRejected(error);
  assert.equal(calls.length, 1);
});

test('production semantic repair instructions give one path-gated intent rule',
  async () => {
    const input = request();
    const original = plan(input);
    const repaired = structuredClone(original);
    const withoutIntent = (await directRepair({ original, repaired,
      errors: [concern(AUDITOR_CODE, '$.speech.utterance_text')] })).system;
    const withIntent = (await directRepair({ original, repaired,
      errors: [concern(AUDITOR_CODE, INTENT_PATH)] })).system;
    assert.match(withoutIntent, /\b(?:keep|preserve)\b[^.]{0,120}\bintent\b/iu);
    assert.doesNotMatch(withIntent, /\b(?:keep|preserve)\b[^.]{0,120}\bintent\b/iu);
    assert.match(withIntent, /\$\.interpretation\.intent/u);
    assert.match(withIntent,
      /\b(?:rewrite|change|remove)\b[^.]{0,160}\bintent\b|\bintent\b[^.]{0,160}\b(?:rewrite|change|remove)\b/iu);
    assert.match(withIntent, /\b(?:rejected|unsupported)\b/iu);
    assert.match(withIntent,
      /\b(?:keep|preserve)\b[^.]{0,120}\b(?:decision|decision boundary)\b/iu);
    for (const system of [withoutIntent, withIntent]) {
      assert.equal(system.split('$.interpretation.intent').length - 1, 1);
      assert.doesNotMatch(system,
        /Keep the same contribution_kind, addressees, dominant_act, intent/iu);
      assert.doesNotMatch(system,
        /Keep the same decision boundary, dominant_act, and intent/iu);
    }
  });

test('production grounding auditor requests a separate intent concern and quote',
  async () => {
    const input = request();
    const original = plan(input);
    let system;
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
      async run(call) {
        assert.equal(call.role_id, 'npc_conversation_grounding_auditor');
        system = call.messages[0].content;
        return { output: { pass: true, concerns: [] } };
      }
    } });
    assert.equal(await model.validateFreshPlan(original, input), true);
    assert.equal(typeof system, 'string');
    assert.match(system,
      /\b(?:separate|additional|own)\s+concern\b[\s\S]{0,200}\$\.interpretation\.intent|\$\.interpretation\.intent[\s\S]{0,200}\b(?:separate|additional|own)\s+concern\b/iu);
    assert.match(system,
      /\bquote\b[^.]{0,160}\bintent\b|\bintent\b[^.]{0,160}\bquote\b/iu);
  });
