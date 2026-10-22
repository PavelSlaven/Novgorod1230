import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from
  '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const RESPONDER = 'npc_conversation_responder';
const REPAIR = 'npc_conversation_responder_format_repair';
const AUDITOR = 'npc_conversation_grounding_auditor';
const OLD_INTENT = 'сообщить, что видел дым';
const NEW_INTENT = 'признать, что не знает о дыме';
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function fixture() {
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'npc-1'), npc_snapshot: { instance_id: 'npc-1' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
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
  return { input, boundary };
}

function plan(input) {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [], speech: {
      utterance_text: 'Я видел дым.', dominant_act: 'answer',
      interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: { intent: OLD_INTENT, grounded_contribution: 'дать ответ',
      adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned',
      effort: 'none' }, supporting_operations: [], check: null, handoff: null,
    reason: 'NPC chooses to answer.'
  };
}

const RAW_TEXT = '{"interpretation":';
const visible = { kind: 'unsupported_past_observation',
  path: '$.speech.utterance_text', quote: 'Я видел дым.' };
const intent = { kind: 'unsupported_past_observation',
  path: '$.interpretation.intent', quote: 'видел дым' };
const auditFail = { pass: false, concerns: [visible, intent] };
const auditPass = { pass: true, concerns: [] };
const json = (value) => ({ status: 'ok', parsed_json: value,
  raw_text: JSON.stringify(value) });
const parseError = { status: 'parse_error', raw_text: RAW_TEXT,
  error: { code: 'json_parse_failed', message: 'Unexpected end of JSON input' } };
const changed = (path) => ({ code: 'format_repair_changed_act',
  category: 'semantic_grounding', path });
const roles = (calls) => calls.map(({ role_id, repair_kind }) =>
  repair_kind === undefined ? role_id : role_id + ':' + repair_kind);
const projectedErrors = (error) => error.details.validation_errors.map(
  ({ code, category, path }) => ({ code, category, path }));

function formatOutput(input, nextIntent = NEW_INTENT, nextAct = 'answer') {
  const value = plan(input);
  value.speech.utterance_text = 'Я не знаю, был ли дым.';
  value.interpretation.intent = nextIntent;
  value.speech.dominant_act = nextAct;
  return value;
}

async function runUnparsedChain(output) {
  const { input, boundary } = fixture();
  const sequence = [
    { role_id: RESPONDER, output: plan },
    { role_id: AUDITOR, output: () => auditFail },
    { role_id: REPAIR, parse_error: true },
    { role_id: REPAIR, output },
    { role_id: AUDITOR, output: () => auditPass }
  ];
  const calls = [];
  const repairs = [];
  const adapter = createLlmRoleRunnerAdapter({ execute: async (call) => {
    const step = sequence[calls.length - 1];
    assert.equal(call.roleId, step.role_id);
    return step.parse_error ? parseError : json(step.output(input));
  } });
  const roleRunner = { async run(call) {
    calls.push({ role_id: call.role_id, repair_kind: call.repair_kind,
      user: JSON.parse(call.messages[1].content) });
    return adapter.run(call);
  } };
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner });
  const tracedModel = async (request, context) => {
    repairs.push(context.repair);
    return model(request, context);
  };
  tracedModel.originalOutputOf = model.originalOutputOf;
  const outcome = await requestNpcSemanticDecision({
    boundary, request: input, semanticModel: tracedModel,
    validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version
  }).then((value) => ({ value }), (error) => ({ error }));
  return { ...outcome, calls, repairs, input };
}

function assertFormatContext({ calls, repairs, input }) {
  assert.deepEqual(roles(calls).slice(0, 4),
    [RESPONDER, AUDITOR, REPAIR + ':semantic', REPAIR + ':format']);
  assert.equal(repairs[1].kind, 'semantic');
  assert.equal(repairs[2].kind, 'format');
  const formatRepair = repairs[2];
  assert.equal(formatRepair.kind, 'format');
  assert.equal(formatRepair.original_output_text, RAW_TEXT);
  assert.equal(Object.hasOwn(formatRepair, 'original_output'), false);
  assert.deepEqual(formatRepair.act_anchor, plan(input));
  assert.deepEqual(formatRepair.act_anchor_semantic_repair, {
    kind: 'semantic', validation_errors: repairs[1].validation_errors
  });
  assert.deepEqual(repairs[1].validation_errors.map(({ code, path }) =>
    ({ code, path })), [visible.path, intent.path].map((path) => ({
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', path
  })));
  assert.deepEqual(formatRepair.validation_errors.map(({ code, category, path }) =>
    ({ code, category, path })), [{
    code: 'json_parse_failed', category: 'format', path: '$'
  }]);
  assert.equal(calls[3].user.original_output_text, RAW_TEXT);
}

function assertPlanned(outcome) {
  if (outcome.error?.details?.validation_errors) {
    assert.deepEqual(projectedErrors(outcome.error), []);
  }
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value?.status, 'planned');
  assert.deepEqual(roles(outcome.calls),
    [RESPONDER, AUDITOR, REPAIR + ':semantic', REPAIR + ':format', AUDITOR]);
}

function assertActRefusal(outcome, expected) {
  assert.equal(outcome.error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(outcome.error.details.category, 'semantic');
  assert.deepEqual(projectedErrors(outcome.error), expected);
  assert.deepEqual(roles(outcome.calls),
    [RESPONDER, AUDITOR, REPAIR + ':semantic', REPAIR + ':format']);
}

test('format repair may use a newly authorized intent after unparsed semantic output',
  async () => {
    const outcome = await runUnparsedChain((input) => formatOutput(input));
    assertFormatContext(outcome);
    assertPlanned(outcome);
  });

test('format repair may keep the anchor intent after unparsed semantic output',
  async () => {
    const outcome = await runUnparsedChain((input) =>
      formatOutput(input, OLD_INTENT));
    assertFormatContext(outcome);
    assertPlanned(outcome);
  });

test('unparsed semantic output does not open the dominant act in format repair',
  async () => {
    const outcome = await runUnparsedChain((input) =>
      formatOutput(input, NEW_INTENT, 'question'));
    assertFormatContext(outcome);
    assertActRefusal(outcome, [changed('$.speech.dominant_act')]);
  });

test('a non-format error cannot authorize a second intent rewrite', async () => {
  const { input } = fixture();
  const anchor = plan(input);
  const previous = formatOutput(input);
  const current = plan(input);
  const auditorError = { code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding', path: '$.interpretation.intent' };
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run() { return { output: current }; }
  } });
  const error = await model(input, { repair: {
    kind: 'format', original_output: previous, act_anchor: anchor,
    act_anchor_semantic_repair: { kind: 'semantic',
      validation_errors: [auditorError] },
    validation_errors: [{ code: 'reference_not_allowed',
      category: 'semantic_grounding', path: '$.interpretation.intent' }]
  } }).then(() => assert.fail('intent rewrite unexpectedly succeeded'),
    (failure) => failure);
  assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(error.details.category, 'semantic');
  assert.deepEqual(projectedErrors(error), [changed('$.interpretation.intent')]);
});

test('a format-kind auditor error leaves the production intent rule closed',
  async () => {
    const { input } = fixture();
    let system;
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
      async run(call) {
        system = call.messages[0].content;
        return { output: plan(input) };
      }
    } });
    await model(input, { repair: {
      kind: 'format', original_output: plan(input),
      validation_errors: [{ code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', path: '$.interpretation.intent' }]
    } });
    assert.equal(typeof system, 'string');
    assert.ok(system.includes('Keep intent unchanged at $.interpretation.intent.'));
    assert.doesNotMatch(system, /Rewrite intent at/u);
  });

test('a format-kind anchor record cannot authorize changed intent',
  async () => {
    const { input } = fixture();
    const anchor = plan(input);
    const current = formatOutput(input);
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
      async run() { return { output: current }; }
    } });
    const error = await model(input, { repair: {
      kind: 'format', original_output: current, act_anchor: anchor,
      act_anchor_semantic_repair: { kind: 'format', validation_errors: [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', path: '$.interpretation.intent'
      }] },
      validation_errors: [{ code: 'invalid_type', category: 'format',
        path: '$.interpretation.adaptation' }]
    } }).then(() => assert.fail('format-kind anchor unexpectedly opened intent'),
      (failure) => failure);
    assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(projectedErrors(error), [changed('$.interpretation.intent')]);
  });
