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
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const json = (value) => ({ status: 'ok', parsed_json: value,
  raw_text: JSON.stringify(value) });
const auditPass = json({ pass: true, concerns: [] });

const CASE_02_OUTPUT = {
  contribution_kind: 'speech',
  primary_addressee_ref: ref('player_character', '1'),
  intended_addressee_refs: [ref('player_character', '1')],
  affected_actor_refs: [],
  speech: {
    utterance_text: 'Садись. Печь топить буду.',
    dominant_act: 'command', interaction_tags: [], topic_refs: [],
    claims: [{ claim_id: 'c1',
      content_summary: 'Жирко будет топить печь.', form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [ref('memory_event', 'conversation-memory:2:21')],
      mentioned_entity_refs: [] }],
    response_expectation: { kind: 'none', target_refs: [] }
  },
  interpretation: {
    intent: 'Жирко подтверждает, что будет топить печь, и приглашает гостя сесть.',
    grounded_contribution: 'NPC подтверждает намерение топить печь, ранее высказанное в разговоре, и даёт короткую команду гостю.',
    adaptation: 'literal'
  },
  resolution: 'automatic',
  activity: { duration_class: 'domain_owned', effort: 'none' },
  supporting_operations: [], check: null, handoff: null,
  reason: 'Жирко нетороплив и немногословен. Он подтверждает ранее сказанное о печи и коротко указывает гостю, что делать, не вступая в долгий разговор.'
};

const CASE_02_ERROR = {
  code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
  category: 'semantic_grounding', retryable: true,
  concern_kinds: ['unsupported_future_action'],
  path: '$.speech.claims[0]', quote: 'Печь топить буду',
  message: 'Rewrite the complete response without unsupported factual assertions.'
};

function request(npcId = 'npc-1', playerId = '1', source =
  ref('memory_event', 'conversation-memory:2:21')) {
  const npcRef = ref('npc', npcId);
  const subject = projectNpcConversationSubject({ npc_ref: npcRef,
    npc_snapshot: { instance_id: npcId },
    current_activity_snapshot: { status: 'idle',
      can_continue_automatically: false } });
  const input = {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: npcRef,
    decision_reasons: { significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: subject.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [], knowledge: subject.knowledge,
    memory: subject.memory, social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [npcRef, ref('player_character', playerId)],
      entity_refs: [], knowledge_refs: [...subject.knowledge_refs, source],
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
  input.allowed_references.knowledge_refs.sort((left, right) =>
    `${left.entity_kind}\u0000${left.entity_id}`.localeCompare(
      `${right.entity_kind}\u0000${right.entity_id}`));
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: npcRef,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    ...input.decision_reasons, state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  return { input, boundary };
}

function envelope(input, output) {
  return { schema: 'conversation_contribution_plan_v1',
    request_id: input.request_id, boundary_id: input.boundary_id,
    conversation_id: input.conversation_id, exchange_id: input.exchange_id,
    state_version: input.state_version, speaker_ref: input.npc_ref,
    ...structuredClone(output) };
}

function case02() {
  const fixture = request();
  const original = envelope(fixture.input, CASE_02_OUTPUT);
  const repaired = structuredClone(original);
  repaired.speech.utterance_text = 'Садись. Печь есть, в избе.';
  repaired.speech.claims = [];
  repaired.interpretation.intent = 'Жирко приглашает гостя сесть.';
  repaired.interpretation.grounded_contribution =
    'NPC даёт короткую команду гостю и сообщает, что в избе есть печь.';
  const claimConcern = { kind: CASE_02_ERROR.concern_kinds[0],
    path: CASE_02_ERROR.path, quote: CASE_02_ERROR.quote };
  const intentConcern = { kind: 'unsupported_future_action',
    path: '$.interpretation.intent', quote: 'будет топить печь' };
  return { fixture, original, repaired, claimConcern, intentConcern };
}

function pastObservation() {
  const source = ref('memory_event', 'npc-2-memory');
  const fixture = request('npc-2', '1', source);
  const original = envelope(fixture.input, CASE_02_OUTPUT);
  original.speech.utterance_text = 'Вчера я видел волка у переправы.';
  original.speech.dominant_act = 'answer';
  original.speech.claims = [{ claim_id: 'wolf',
    content_summary: 'Вчера я видел волка у переправы.',
    form: 'assertion', speaker_posture: 'believed_true',
    source_knowledge_refs: [source], mentioned_entity_refs: [] }];
  original.interpretation.intent =
    'NPC сообщает, что вчера видел волка у переправы.';
  original.interpretation.grounded_contribution =
    'NPC сообщает о прошлом наблюдении.';
  original.reason = 'NPC отвечает на вопрос о переправе.';
  const repaired = structuredClone(original);
  repaired.speech.utterance_text = 'О волках у переправы мне неизвестно.';
  repaired.speech.claims = [];
  repaired.interpretation.intent =
    'NPC сообщает, что не знает о волках у переправы.';
  repaired.interpretation.grounded_contribution =
    'NPC сообщает об отсутствии сведений.';
  return { fixture, original, repaired,
    speechConcern: { kind: 'unsupported_past_observation',
      path: '$.speech.utterance_text', quote: 'Вчера я видел волка у переправы' },
    intentConcern: { kind: 'unsupported_past_observation',
      path: '$.interpretation.intent',
      quote: 'вчера видел волка у переправы' } };
}

function provider(original, repaired, concerns, succeeds) {
  const script = [
    { role: RESPONDER, result: json(original) },
    { role: AUDITOR, result: json({ pass: false, concerns }) },
    { role: REPAIR, result: json(repaired) },
    ...(succeeds ? [{ role: AUDITOR, result: auditPass }] : [])
  ];
  const calls = [];
  const runner = createLlmRoleRunnerAdapter({ execute: async (call) => {
    const next = script[calls.length];
    assert.ok(next, `unexpected provider call ${calls.length + 1}: ${call.roleId}`);
    assert.equal(call.roleId, next.role);
    calls.push({ role_id: call.roleId,
      user: JSON.parse(call.messages[1].content) });
    return next.result;
  } });
  return { calls, model: createLowerDvinaTraceNpcSemanticModel({
    roleRunner: runner }) };
}

async function decide({ fixture, original, repaired, concerns, succeeds }) {
  const { calls, model } = provider(original, repaired, concerns, succeeds);
  const outcome = await requestNpcSemanticDecision({ boundary: fixture.boundary,
    request: fixture.input, semanticModel: model,
    validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => fixture.input.state_version })
    .then((value) => value, (error) => error);
  if (!succeeds || outcome?.status === 'planned') {
    assert.deepEqual(calls.map(({ role_id }) => role_id), succeeds
      ? [RESPONDER, AUDITOR, REPAIR, AUDITOR]
      : [RESPONDER, AUDITOR, REPAIR]);
  }
  assert.deepEqual(calls[2].user.original_output, original);
  assert.deepEqual(calls[2].user.validation_errors.map(
    ({ code, category, path, quote }) => ({ code, category, path, quote })),
  concerns.map(({ path, quote }) => ({
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding', path, quote
  })));
  return outcome;
}

function assertRejected(outcome, paths) {
  assert.equal(outcome.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(outcome.details.category, 'semantic');
  assert.deepEqual(outcome.details.validation_errors.map(
    ({ code, category, path }) => ({ code, category, path })),
  paths.map((path) => ({ code: 'semantic_repair_changed_act',
    category: 'semantic_grounding', path })));
}

async function assertPlanned(scenario) {
  const outcome = await decide({ ...scenario, succeeds: true });
  assert.deepEqual(outcome.details?.validation_errors?.filter(
    ({ code }) => code.endsWith('_repair_changed_act')) ?? [], []);
  assert.equal(outcome.status, 'planned');
  assert.equal(outcome.plan.interpretation.intent,
    scenario.repaired.interpretation.intent);
}

test('case 02 permits an intent change named by the speech auditor', async () => {
  const scenario = case02();
  await assertPlanned({ ...scenario,
    concerns: [scenario.claimConcern, scenario.intentConcern] });
});

test('a claim-only concern leaves the case 02 intent protected', async () => {
  const scenario = case02();
  const outcome = await decide({ ...scenario,
    concerns: [scenario.claimConcern], succeeds: false });
  assertRejected(outcome, ['$.interpretation.intent']);
});

test('an interpretation ancestor covers the case 02 intent', async () => {
  const scenario = case02();
  await assertPlanned({ ...scenario, concerns: [scenario.claimConcern,
    { ...scenario.intentConcern, path: '$.interpretation' }] });
});

test('dominant act stays protected without its own auditor concern', async () => {
  const scenario = case02();
  scenario.repaired.speech.dominant_act = 'question';
  const outcome = await decide({ ...scenario,
    concerns: [scenario.claimConcern, scenario.intentConcern],
    succeeds: false });
  assertRejected(outcome, ['$.speech.dominant_act']);
});

test('a second changed act field remains protected', async (t) => {
  const changes = [
    ['speech.dominant_act', '$.speech.dominant_act', (plan) => {
      plan.speech.dominant_act = 'question';
    }],
    ['contribution_kind', '$.contribution_kind', (plan) => {
      plan.contribution_kind = 'silence';
      plan.speech = null;
    }],
    ['primary_addressee_ref', '$.primary_addressee_ref', (plan) => {
      plan.primary_addressee_ref = null;
    }],
    ['intended_addressee_refs', '$.intended_addressee_refs', (plan) => {
      plan.intended_addressee_refs.push(ref('npc', 'npc-1'));
    }]
  ];
  for (const [name, path, change] of changes) {
    await t.test(name, async () => {
      const scenario = case02();
      change(scenario.repaired);
      const outcome = await decide({ ...scenario,
        concerns: [scenario.claimConcern, scenario.intentConcern,
          { kind: 'unsupported_future_action', path,
            quote: 'Печь топить буду' }], succeeds: false });
      assertRejected(outcome, path === '$.contribution_kind'
        ? ['$.contribution_kind', '$.speech.dominant_act'] : [path]);
    });
  }
});

test('auditor concerns on the other act fields do not require changing them',
  async (t) => {
    for (const path of ['$.contribution_kind', '$.speech.dominant_act',
      '$.primary_addressee_ref', '$.intended_addressee_refs']) {
      await t.test(path, async () => {
        const scenario = case02();
        await assertPlanned({ ...scenario,
          concerns: [scenario.claimConcern, scenario.intentConcern,
            { kind: 'unsupported_future_action', path,
              quote: 'Печь топить буду' }] });
      });
    }
  });

test('the root and a matching text prefix do not cover intent', async (t) => {
  for (const path of ['$', '$.interpretation.intent_note']) {
    await t.test(path, async () => {
      const scenario = case02();
      const outcome = await decide({ ...scenario,
        concerns: [scenario.claimConcern,
          { ...scenario.intentConcern, path }], succeeds: false });
      assertRejected(outcome, ['$.interpretation.intent']);
    });
  }
});

test('noncanonical intent path spellings do not cover intent', async (t) => {
  for (const path of ["$['interpretation']['intent']",
    'interpretation.intent']) {
    await t.test(path, async () => {
      const scenario = case02();
      const outcome = await decide({ ...scenario,
        concerns: [scenario.claimConcern,
          { ...scenario.intentConcern, path }], succeeds: false });
      assertRejected(outcome, ['$.interpretation.intent']);
    });
  }
});

test('a changed intent may remain unchanged despite permission', async () => {
  const scenario = case02();
  scenario.repaired.interpretation.intent =
    scenario.original.interpretation.intent;
  await assertPlanned({ ...scenario,
    concerns: [scenario.claimConcern, scenario.intentConcern] });
});

test('another NPC can remove an invented past observation from intent',
  async () => {
    const scenario = pastObservation();
    await assertPlanned({ ...scenario,
      concerns: [scenario.speechConcern, scenario.intentConcern] });
  });

test('a speech-only concern cannot change another NPC intent', async () => {
  const scenario = pastObservation();
  const outcome = await decide({ ...scenario,
    concerns: [scenario.speechConcern], succeeds: false });
  assertRejected(outcome, ['$.interpretation.intent']);
});

test('descendant intent paths cover the whole intent field', async (t) => {
  for (const path of ['$.interpretation.intent.detail',
    '$.interpretation.intent[0]']) {
    await t.test(path, async () => {
      const scenario = case02();
      await assertPlanned({ ...scenario,
        concerns: [scenario.claimConcern,
          { ...scenario.intentConcern, path }] });
    });
  }
});
