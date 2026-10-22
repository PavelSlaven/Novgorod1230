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

function corrected(input) {
  const value = plan(input);
  value.speech.utterance_text = 'Я не знаю, был ли дым.';
  value.interpretation.intent = NEW_INTENT;
  return value;
}

function badForm(value) {
  value.interpretation.adaptation = 'not_allowed';
  return value;
}

const visible = { kind: 'unsupported_past_observation',
  path: '$.speech.utterance_text', quote: 'Я видел дым.' };
const intent = { kind: 'unsupported_past_observation',
  path: '$.interpretation.intent', quote: 'видел дым' };
const auditFail = (concerns) => ({ pass: false, concerns });
const auditPass = { pass: true, concerns: [] };
const json = (value) => ({ status: 'ok', parsed_json: value,
  raw_text: JSON.stringify(value) });

async function decision(sequence) {
  const { input, boundary } = fixture();
  const calls = [];
  const adapter = createLlmRoleRunnerAdapter({ execute: async (call) => {
    const step = sequence[calls.length - 1];
    assert.equal(call.roleId, step.role_id);
    return json(step.output(input));
  } });
  const roleRunner = { async run(call) {
    calls.push({ role_id: call.role_id, repair_kind: call.repair_kind,
      user: JSON.parse(call.messages[1].content) });
    return adapter.run(call);
  } };
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner });
  const outcome = await requestNpcSemanticDecision({ boundary, request: input,
    semanticModel: model, validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version })
    .then((value) => ({ value }), (error) => ({ error }));
  return { ...outcome, calls };
}

const roles = (calls) => calls.map(({ role_id, repair_kind }) =>
  repair_kind === undefined ? role_id : `${role_id}:${repair_kind}`);
const errors = (error) => error.details.validation_errors.map(
  ({ code, category, path }) => ({ code, category, path }));
const changed = (path) => ({ code: 'format_repair_changed_act',
  category: 'semantic_grounding', path });
const chainRoles = [RESPONDER, AUDITOR, `${REPAIR}:semantic`,
  `${REPAIR}:format`, AUDITOR];

function assertAccepted({ value, error, calls }, expectedRoles) {
  if (error?.details?.validation_errors) assert.deepEqual(errors(error), []);
  assert.equal(error, undefined);
  assert.equal(value?.status, 'planned');
  assert.deepEqual(roles(calls), expectedRoles);
  assert.equal(calls.filter(({ role_id }) => role_id === AUDITOR).length, 2);
}

function assertRejected({ error, calls }, expectedErrors) {
  assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(error.details.category, 'semantic');
  assert.deepEqual(error.details.repair_kinds_used, ['semantic', 'format']);
  assert.deepEqual(errors(error), expectedErrors);
  assert.deepEqual(roles(calls), chainRoles.slice(0, -1));
  assert.equal(calls.filter(({ role_id }) => role_id === AUDITOR).length, 1);
}

function chain(concerns, semanticOutput = (input) => badForm(corrected(input)),
  formatOutput = corrected) {
  return [
    { role_id: RESPONDER, output: plan },
    { role_id: AUDITOR, output: () => auditFail(concerns) },
    { role_id: REPAIR, output: semanticOutput },
    { role_id: REPAIR, output: formatOutput },
    { role_id: AUDITOR, output: () => auditPass }
  ];
}

function assertAuditAndRepairs(calls, concernPaths, semanticIntent) {
  assert.equal(calls[1].user.plan.interpretation.intent, OLD_INTENT);
  assert.equal(calls[1].user.plan.speech.utterance_text, 'Я видел дым.');
  assert.deepEqual(calls[2].user.validation_errors.map(({ code, path }) =>
    ({ code, path })), concernPaths.map((path) => ({
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', path
  })));
  assert.equal(calls[2].user.original_output.interpretation.intent, OLD_INTENT);
  assert.equal(calls[3].user.original_output.interpretation?.intent,
    semanticIntent);
  assert.ok(calls[3].user.validation_errors.some(({ category }) =>
    category === 'format'));
}

test('audited intent survives semantic then format repair', async () => {
  const outcome = await decision(chain([visible, intent]));
  assertAuditAndRepairs(outcome.calls, [visible.path, intent.path], NEW_INTENT);
  assert.ok(outcome.calls[3].user.validation_errors.some(({ path }) =>
    path === '$.interpretation.adaptation'));
  assertAccepted(outcome, chainRoles);
});

test('format repair restores interpretation with an authorized new intent',
  async () => {
    const outcome = await decision(chain([visible, intent], (input) => {
      const value = corrected(input);
      delete value.interpretation;
      return value;
    }));
    assertAuditAndRepairs(outcome.calls, [visible.path, intent.path], undefined);
    assertAccepted(outcome, chainRoles);
  });

test('speech concern alone cannot authorize changed intent', async () => {
  const outcome = await decision(chain([visible]));
  assertAuditAndRepairs(outcome.calls, [visible.path], NEW_INTENT);
  assertRejected(outcome, [changed('$.interpretation.intent')]);
});

test('an authorized intent does not authorize a changed dominant act',
  async () => {
    const outcome = await decision(chain([visible, intent], undefined,
      (input) => {
        const value = corrected(input);
        value.speech.dominant_act = 'question';
        return value;
      }));
    assertAuditAndRepairs(outcome.calls, [visible.path, intent.path], NEW_INTENT);
    assertRejected(outcome, [changed('$.speech.dominant_act')]);
  });

test('format repair cannot write a third intent', async () => {
  const outcome = await decision(chain([visible, intent], undefined, (input) => {
    const value = corrected(input);
    value.interpretation.intent = 'спросить о дыме';
    return value;
  }));
  assertAuditAndRepairs(outcome.calls, [visible.path, intent.path], NEW_INTENT);
  assertRejected(outcome, [changed('$.interpretation.intent')]);
});

test('format repair cannot restore the original intent without a form error',
  async () => {
    const outcome = await decision(chain([visible, intent], undefined,
      (input) => {
        const value = corrected(input);
        value.interpretation.intent = OLD_INTENT;
        return value;
      }));
    assertAuditAndRepairs(outcome.calls, [visible.path, intent.path], NEW_INTENT);
    assert.deepEqual(outcome.error?.details?.validation_errors?.map(
      ({ code, category, path }) => ({ code, category, path })) ?? [],
    [changed('$.interpretation.intent')]);
    assertRejected(outcome, [changed('$.interpretation.intent')]);
  });

test('semantic repair can change intent after format repair and audit',
  async () => {
    const outcome = await decision([
      { role_id: RESPONDER, output: (input) => badForm(plan(input)) },
      { role_id: REPAIR, output: plan },
      { role_id: AUDITOR, output: () => auditFail([visible, intent]) },
      { role_id: REPAIR, output: corrected },
      { role_id: AUDITOR, output: () => auditPass }
    ]);
    assert.equal(outcome.calls[1].user.original_output.interpretation.intent,
      OLD_INTENT);
    assert.ok(outcome.calls[1].user.validation_errors.some(({ category, path }) =>
      category === 'format' && path === '$.interpretation.adaptation'));
    assert.equal(outcome.calls[2].user.plan.interpretation.intent, OLD_INTENT);
    assert.deepEqual(outcome.calls[3].user.validation_errors.map(({ code, path }) =>
      ({ code, path })), [visible, intent].map(({ path }) => ({
      code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', path
    })));
    assert.equal(outcome.calls[3].user.original_output.interpretation.intent,
      OLD_INTENT);
    assertAccepted(outcome, [RESPONDER, `${REPAIR}:format`, AUDITOR,
      `${REPAIR}:semantic`, AUDITOR]);
  });
