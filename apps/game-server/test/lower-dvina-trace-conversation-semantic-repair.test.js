import { npcAuditReport } from './support/npc-audit-report.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync } from 'node:fs';
import { buildNpcDecisionBoundary, validateConversationContributionPlan,
  validateNpcConversationResponseRequest } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { npcConversationCandidates, requiredNpcConversationCandidate } from
  '../src/runtime/lower-dvina-trace-phase-2-npc-conversation-prompts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const responder = 'npc_conversation_responder';
const repairRole = 'npc_conversation_responder_format_repair';
const auditor = 'npc_conversation_grounding_auditor';
const approved = (call) => npcAuditReport(call);
const rejected = (kind, call) => npcAuditReport(call, { pass: false, concerns: [{ kind,
  reason: 'No exact supporting evidence.', quote: '' }] });
const payload = (call) => JSON.parse(call.messages[1].content);

function boundary(input) {
  return buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: input.npc_ref,
    same_time_batch_ref: ref('temporal_batch', input.request_id),
    significance: input.decision_reasons.significance,
    categories: input.decision_reasons.categories,
    signal_refs: input.decision_reasons.signal_refs,
    state_version: String(input.state_version)
  });
}

function request(id) {
  const input = {
    schema: 'npc_conversation_response_request_v1', request_id: id,
    boundary_id: 'pending-boundary', conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [], knowledge: {}, memory: {},
    social_context: {}, available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    },
    decision_scope: { conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['conversation'], allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} } }
  };
  input.boundary_id = boundary(input).boundary_id;
  return input;
}

function plan(input, utterance = 'Не берусь судить.', act = 'answer') {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [],
    speech: { utterance_text: utterance, dominant_act: act, interaction_tags: [],
      topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'NPC выбрал ответ.'
  };
}

function claim(id, fact, sources) {
  return { claim_id: id, content_summary: fact, form: 'assertion',
    speaker_posture: 'believed_true', source_knowledge_refs: sources,
    mentioned_entity_refs: [] };
}

function observation(input) {
  const entry = { observation_ref: ref('perception_result', 'observation-1'),
    source_type: 'direct_perception', observed_at: input.requested_at,
    fact_text: 'На очаге не видно пламени.' };
  input.memory = { records: [], received_messages: [],
    current_observations: [entry] };
  input.allowed_references.knowledge_refs.push(entry.observation_ref);
  return entry;
}

async function runConversation(input, original, corrected, {
  audit = (call, number) => number === 1
    ? rejected('unsupported_qualifier', call) : approved(call),
  worldKnowledgeGrounder = null, repairOutput = null
} = {}) {
  // Validate fixtures before exercising production; schema defects are not
  // evidence of a semantic-repair regression.
  assert.equal(validateNpcConversationResponseRequest(input), true);
  assert.equal(validateConversationContributionPlan(original, input), true);
  assert.equal(validateConversationContributionPlan(corrected, input), true);
  const before = structuredClone(input);
  const calls = [];
  const responses = [];
  let auditCount = 0;
  const roleRunner = { async run(call) {
    calls.push(structuredClone(call));
    if (process.env.ISSUE_247_PAYLOAD_LOG) appendFileSync(
      process.env.ISSUE_247_PAYLOAD_LOG,
      `${JSON.stringify({ case: input.request_id, call })}\n`);
    if (call.role_id === auditor) {
      const output = audit(call, ++auditCount);
      responses.push({ role_id: call.role_id, output: structuredClone(output) });
      return { output };
    }
    assert.ok([responder, repairRole].includes(call.role_id), call.role_id);
    const output = structuredClone(call.role_id === responder
      ? original : Object.hasOwn(payload(call), 'marker_safe_decision')
        ? corrected : repairOutput ?? privateRepair(corrected));
    responses.push({ role_id: call.role_id, output: structuredClone(output) });
    return { output };
  } };
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner,
    worldKnowledgeGrounder });
  let result;
  let error;
  try {
    result = await requestNpcSemanticDecision({
      boundary: boundary(input), request: input, semanticModel: model,
      validateFreshPlan: model.validateFreshPlan,
      revalidateStateVersion: async () => input.state_version
    });
  } catch (caught) {
    error = caught;
  }
  assert.deepEqual(input, before, 'repair must not mutate the factual request');
  return { calls, responses, result, error };
}

function privateRepair(corrected) {
  return {
    ...(corrected.speech == null ? {} : {
      utterance_text: corrected.speech.utterance_text,
      claim_ids: corrected.speech.claims.map(({ claim_id }) => claim_id)
    }),
    interpretation: {
      intent: corrected.interpretation.intent,
      grounded_contribution: corrected.interpretation.grounded_contribution
    },
    reason: corrected.reason
  };
}

function assertOrdinaryRepairInput(call, original) {
  const input = payload(call);
  assert.deepEqual(input.original_speech, original.speech);
  assert.equal(Object.hasOwn(input, 'original_output'), false);
  assert.equal(Object.hasOwn(input, 'original_interpretation'), false);
  assert.equal(Object.hasOwn(input, 'original_reason'), false);
  assert.equal(input.preserved_decision.contribution_kind,
    original.contribution_kind);
  assert.deepEqual(input.preserved_decision.supporting_operations,
    original.supporting_operations);
  assert.deepEqual(input.preserved_decision.speech?.response_expectation,
    original.speech?.response_expectation);
}

function singleRepair(scenario) {
  const repairs = scenario.calls.filter(({ role_id }) => role_id === repairRole);
  assert.equal(repairs.length, 1, 'semantic grounding must call the model once for repair');
  return repairs[0];
}

function exactModelReply(scenario, corrected) {
  assert.equal(scenario.error, undefined);
  assert.equal(scenario.result?.status, 'planned');
  assert.deepEqual(scenario.result.plan, corrected,
    'accepted speech must come from the repair model, including its act');
  assert.doesNotMatch(scenario.result.plan.speech.utterance_text,
    /подтвердить не могу/u);
  assert.doesNotMatch(JSON.stringify(scenario.result), /ничего подтвердить не могу/u);
}

test('grounding rejection calls one model repair with complete original speech, decision and concerns', async () => {
  const probes = [];
  for (const withOperations of [false, true]) {
    const input = request(`semantic-output-and-concerns-${withOperations ? 'operations' : 'no-operations'}`);
    if (withOperations) {
      input.decision_scope.required_resolution = 'automatic';
      input.decision_scope.required_supporting_operation = {
        op: 'emit_interaction', kind: 'inform', actor_ref: input.npc_ref,
        target_ref: ref('player_character', 'player-1')
      };
      input.decision_scope.operation_contract.emit_interaction = {
        required_resolution: 'automatic', required_dominant_acts: ['answer'],
        required_interaction_tag: 'inform'
      };
      assert.equal(npcConversationCandidates(input).some(
        (candidate) => candidate.contribution_kind === 'speech'
          && candidate.supporting_operations.length === 0), false);
      assert.equal(requiredNpcConversationCandidate(input).supporting_operations.length, 1);
    } else {
      assert.equal(npcConversationCandidates(input).some(
        (candidate) => candidate.contribution_kind === 'speech'
          && candidate.supporting_operations.length === 0), true);
    }
    const seen = observation(input);
    const wkRef = ref('knowledge_record', 'claim:fish-net');
    input.allowed_references.knowledge_refs.unshift(wkRef);
    const original = plan(input,
      'Все сети рвутся до зимы. На очаге не видно пламени.');
    original.speech.claims = [claim('wk', 'Все сети рвутся до зимы.', [wkRef]),
      claim('fire', seen.fact_text, [seen.observation_ref])];
    const corrected = plan(input, 'На очаге не видно пламени. Поговорим об этом здесь.');
    corrected.speech.claims = [structuredClone(original.speech.claims[1])];
    if (withOperations) for (const output of [original, corrected]) {
      output.supporting_operations = [structuredClone(input.decision_scope.required_supporting_operation)];
      output.speech.interaction_tags = ['inform'];
    }
    const scenario = await runConversation(input, original, corrected);
    probes.push({ withOperations, original, corrected, scenario });
  }
  // Run both branches before asserting, so the red capture also demonstrates
  // the missing output/errors on the branch that already calls the model.
  assert.deepEqual(probes.map(({ withOperations, scenario }) => {
    const repairs = scenario.calls.filter(({ role_id }) => role_id === repairRole);
    return { withOperations, repair_calls: repairs.length,
      original_speech_present: repairs.length > 0
        && Object.hasOwn(payload(repairs[0]), 'original_speech'),
      concern_kinds: repairs.length > 0
        ? payload(repairs[0]).validation_errors[0].concern_kinds ?? [] : [] };
  }), [false, true].map((withOperations) => ({ withOperations, repair_calls: 1,
    original_speech_present: true, concern_kinds: ['unsupported_qualifier'] })));
  for (const { original, corrected, scenario } of probes) {
    const retry = singleRepair(scenario);
    assert.match(retry.messages[0].content,
      /Grounding takes priority over wording/u);
    assert.match(retry.messages[0].content,
      /Reconstruct interpretation and reason/u);
    assert.match(retry.messages[0].content,
      /Missing memory records do not prove the NPC lacks knowledge/u);
    assertOrdinaryRepairInput(retry, original);
    const repairResponse = scenario.responses.find(({ role_id }) =>
      role_id === repairRole).output;
    assert.deepEqual(repairResponse.claim_ids,
      corrected.speech.claims.map(({ claim_id }) => claim_id));
    assert.equal(Object.hasOwn(repairResponse, 'claims'), false);
    assert.match(retry.messages[0].content,
      /"utterance_text":"\.\.\.","claim_ids":\[\]/u);
    assert.match(retry.messages[0].content,
      /never rewritten claim objects/u);
    assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
      [responder, auditor, repairRole, auditor]);
    exactModelReply(scenario, corrected);
  }
});

test('semantic repair resolves selected claim IDs to exact original claims', async () => {
  const input = request('semantic-claim-id-selection');
  const seen = observation(input);
  const original = plan(input, `${seen.fact_text} Все сети рвутся до зимы.`);
  original.speech.claims = [claim('fire', seen.fact_text, [seen.observation_ref]),
    claim('nets', 'Все сети рвутся до зимы.', [seen.observation_ref])];
  const corrected = plan(input, `${seen.fact_text} Об остальном говорить не берусь.`);
  corrected.speech.claims = [structuredClone(original.speech.claims[0])];
  const scenario = await runConversation(input, original, corrected);
  const retry = singleRepair(scenario);
  assert.deepEqual(scenario.responses.find(({ role_id }) =>
    role_id === repairRole).output.claim_ids, ['fire']);
  exactModelReply(scenario, corrected);
  assert.deepEqual(scenario.result.plan.speech.claims,
    [original.speech.claims[0]],
    'the server must restore the exact selected source claim object');
});

test('semantic repair rejects malformed, unknown, repeated and ambiguous claim IDs before re-audit', async () => {
  const invalidSelections = [
    { name: 'malformed-list', claim_ids: 'fire' },
    { name: 'malformed-value', claim_ids: [7] },
    { name: 'empty-id', claim_ids: [''] },
    { name: 'unknown', claim_ids: ['missing'] },
    { name: 'repeated', claim_ids: ['fire', 'fire'] },
    { name: 'old-object-wire', claims: [] }
  ];
  for (const selection of invalidSelections) {
    const input = request(`semantic-claim-id-${selection.name}`);
    const seen = observation(input);
    const original = plan(input, seen.fact_text);
    original.speech.claims = [claim('fire', seen.fact_text, [seen.observation_ref])];
    const corrected = plan(input, 'Об этом сейчас говорить не берусь.');
    const output = { ...privateRepair(corrected), ...selection };
    delete output.name;
    const scenario = await runConversation(input, original, corrected,
      { repairOutput: output });
    assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE', selection.name);
    assert.equal(scenario.result, undefined, selection.name);
    assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
      [responder, auditor, repairRole], selection.name);
  }

  const input = request('semantic-claim-id-ambiguous');
  const seen = observation(input);
  const original = plan(input, seen.fact_text);
  original.speech.claims = [
    claim('duplicate', seen.fact_text, [seen.observation_ref]),
    claim('duplicate', 'Тот же ID, другое содержание.', [seen.observation_ref])
  ];
  const corrected = plan(input, 'Об этом сейчас говорить не берусь.');
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run() { return { output: { ...privateRepair(corrected),
      claim_ids: ['duplicate'] } }; }
  } });
  const rejectedPlan = await model(input, { repair: { original_output: original,
    validation_errors: [{ category: 'semantic_grounding',
      concern_kinds: ['unsupported_qualifier'] }] } });
  const failure = await model.validateFreshPlan(rejectedPlan, input);
  assert.equal(failure.pass, false);
  assert.equal(failure.errors[0].code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
});

test('a selected original claim does not make unsupported repaired speech pass grounding', async () => {
  const input = request('semantic-claim-id-unsupported-fact');
  const seen = observation(input);
  const original = plan(input, seen.fact_text);
  original.speech.claims = [claim('fire', seen.fact_text, [seen.observation_ref])];
  const unsupported = plan(input,
    `${seen.fact_text} За рекой уже стоит стража.`);
  unsupported.speech.claims = structuredClone(original.speech.claims);
  const scenario = await runConversation(input, original, unsupported, {
    audit: (call) => rejected('unsupported_fact', call)
  });
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_INVALID');
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  assert.equal(scenario.result, undefined);
});

test('first-contact identity and guarded behavior are repaired by the model with both concerns', async () => {
  const input = request('semantic-first-contact');
  input.npc = { identity_state: { canonical_name: 'Еремей' } };
  input.social_context = { first_contact_introduction: { canonical_name: 'Еремей' },
    npc_behavior: { required_interaction_tag: 'withhold' } };
  const original = plan(input);
  const corrected = plan(input, 'Я Еремей. С этим ответом пока повременю.');
  corrected.speech.interaction_tags = ['withhold'];
  const scenario = await runConversation(input, original, corrected, { audit: approved });
  const retry = singleRepair(scenario);
  assertOrdinaryRepairInput(retry, original);
  assert.deepEqual(payload(retry).validation_errors.flatMap(
    ({ concern_kinds }) => concern_kinds),
  ['first_contact_introduction_missing', 'required_npc_behavior_missing']);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, repairRole, auditor]);
  exactModelReply(scenario, corrected);
});

test('presentation repair preserves the original typed addressee decision', async () => {
  const input = request('semantic-presentation-typed-addressee');
  input.npc = { identity_state: { canonical_name: 'Еремей' } };
  input.social_context = { first_contact_introduction: { canonical_name: 'Еремей' } };
  input.decision_scope.required_resolution = 'automatic';
  input.decision_scope.required_supporting_operation = {
    op: 'emit_interaction', kind: 'inform', actor_ref: input.npc_ref,
    target_ref: ref('player_character', 'player-1')
  };
  input.decision_scope.operation_contract.emit_interaction = {
    required_resolution: 'automatic', required_dominant_acts: ['answer'],
    required_interaction_tag: 'inform'
  };
  const otherAddressee = ref('player_character', 'player-2');
  input.allowed_references.actor_refs.push(otherAddressee);
  const original = plan(input, 'Не берусь судить.');
  original.primary_addressee_ref = otherAddressee;
  original.intended_addressee_refs = [otherAddressee];
  const changed = plan(input, 'Я Еремей. Не берусь судить.');
  for (const output of [original, changed]) {
    output.supporting_operations = [
      structuredClone(input.decision_scope.required_supporting_operation)
    ];
    output.speech.interaction_tags = ['inform'];
  }
  const scenario = await runConversation(input, original, changed, {
    audit: approved,
    repairOutput: { ...privateRepair(changed),
      primary_addressee_ref: changed.primary_addressee_ref }
  });
  const retry = singleRepair(scenario);
  assertOrdinaryRepairInput(retry, original);
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
  assert.equal(scenario.result, undefined);
});

test('model repair keeps cited present facts and removes an unsupported past claim', async () => {
  const input = request('semantic-cited-present-fact');
  const seen = observation(input);
  const original = plan(input, `${seen.fact_text} Вчера лодки не было.`);
  original.speech.claims = [claim('fire', seen.fact_text, [seen.observation_ref]),
    claim('past', 'Вчера лодки не было.', [])];
  const corrected = plan(input, `${seen.fact_text} Давай сперва поговорим.`);
  corrected.speech.claims = [structuredClone(original.speech.claims[0])];
  const scenario = await runConversation(input, original, corrected, { audit: approved });
  const retry = singleRepair(scenario);
  assert.deepEqual(payload(retry).validation_errors[0].concern_kinds,
    ['claim_without_source_knowledge']);
  exactModelReply(scenario, corrected);
  assert.deepEqual(scenario.result.plan.speech.claims[0].source_knowledge_refs,
    [seen.observation_ref]);
  assert.doesNotMatch(scenario.result.plan.speech.utterance_text, /Вчера/u);
});

for (const marker of [false, true]) {
  for (const retainsFact of [false, true]) {
    test(`${marker ? 'marker' : 'ordinary'} repair ${retainsFact ? 'retains' : 'drops'} supported speech fact`, async () => {
      const input = request(`semantic-retention-${marker}-${retainsFact}`);
      const seen = observation(input);
      const original = plan(input, `${seen.fact_text} Вчера я видел лодку.${marker ? ' INFERENCE: npc_private.' : ''}`);
      const corrected = plan(input, retainsFact
        ? `${seen.fact_text} О лодке судить не берусь.`
        : 'О лодке судить не берусь.');
      const finalAudits = [];
      const scenario = await runConversation(input, original, corrected, {
        audit(call, number) {
          if (!marker && number === 1) return rejected('unsupported_past_activity', call);
          const candidate = payload(call);
          finalAudits.push(candidate);
          if (candidate.original_speech?.utterance_text.includes(seen.fact_text)
              && !candidate.plan.speech.utterance_text.includes(seen.fact_text)) {
            return rejected('supported_fact_dropped', call);
          }
          return approved(call);
        }
      });
      assert.deepEqual(finalAudits.map(({ original_speech }) => original_speech),
        [original.speech]);
      if (marker) assert.doesNotMatch(JSON.stringify(singleRepair(scenario).messages),
        /INFERENCE:|npc_private/u);
      if (retainsFact) exactModelReply(scenario, corrected);
      else {
        assert.equal(scenario.result, undefined);
        assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_INVALID');
      }
    });
  }
}

test('marker repair retains a sourced answer and typed act while adding the required tag', async () => {
  const input = request('semantic-marker-sourced-answer-and-tag');
  const seen = observation(input);
  input.social_context = { npc_behavior: { required_interaction_tag: 'withhold' } };
  const original = plan(input, `${seen.fact_text} INFERENCE: npc_private.`);
  original.speech.claims = [claim('observed-fire', seen.fact_text,
    [seen.observation_ref])];
  const corrected = plan(input, `${seen.fact_text} О вчерашнем судить не берусь.`);
  corrected.speech.claims = structuredClone(original.speech.claims);
  corrected.speech.interaction_tags = ['withhold'];

  const scenario = await runConversation(input, original, corrected, { audit: approved });
  const retry = singleRepair(scenario);
  const repairInput = payload(retry);
  assert.deepEqual(repairInput.marker_safe_decision.speech.dominant_act, 'answer');
  assert.equal(repairInput.request.social_context.npc_behavior.required_interaction_tag,
    'withhold');
  assert.deepEqual(repairInput.request.memory.current_observations, [seen]);
  assert.equal(Object.hasOwn(repairInput, 'original_speech'), false);
  assert.doesNotMatch(JSON.stringify(retry.messages), /INFERENCE:|npc_private/u);
  assert.match(retry.messages[0].content, /Preserve speech\.dominant_act from marker_safe_decision/u);
  assert.match(retry.messages[0].content, /without changing the act/u);
  assert.match(retry.messages[0].content, /applicable exact facts supplied by the request with matching sourced claims/u);
  exactModelReply(scenario, corrected);
});

test('repair preserves refusal and introduction while marker repair keeps a separate clean wire', async () => {
  const input = request('semantic-refusal-and-marker-pair');
  input.npc = { identity_state: { canonical_name: 'Еремей' } };
  const corrected = plan(input, 'Я Еремей. Не стану об этом говорить.', 'refuse');
  const original = plan(input, 'Я Еремей. Не пущу тебя: вчера лодки не было.', 'refuse');
  const scenario = await runConversation(input, original, corrected);
  const retry = singleRepair(scenario);
  assertOrdinaryRepairInput(retry, original);
  exactModelReply(scenario, corrected);

  const marked = structuredClone(original);
  marked.speech.utterance_text = 'Я Еремей. INFERENCE: npc_private.';
  const markerScenario = await runConversation(input, marked, corrected, { audit: approved });
  const markerRetry = singleRepair(markerScenario);
  assert.doesNotMatch(JSON.stringify(markerRetry.messages),
    /TRACE_NPC_SPEECH_SERVICE_TEXT|INFERENCE:|npc_private/u,
    'marker repair must not send rejected service text back to the model');
  exactModelReply(markerScenario, corrected);
});

test('a non-string NPC name still uses model repair without inventing an introduction', async () => {
  const input = request('semantic-non-string-name');
  input.npc = { identity_state: { canonical_name: 7 } };
  const original = plan(input, 'Вчера я видел лодку.');
  const corrected = plan(input, 'С этим ответом повременю.');
  const scenario = await runConversation(input, original, corrected);
  singleRepair(scenario);
  exactModelReply(scenario, corrected);
  assert.doesNotMatch(scenario.result.plan.speech.utterance_text, /Я 7/u);
});

test('semantic repair and its auditor retain the original responder World Knowledge', async () => {
  const input = request('semantic-cached-wk');
  const original = plan(input, 'Все сети рвутся до зимы.');
  const corrected = plan(input, 'Об этом лучше поговорим позже.');
  const slice = { schema: 'world_knowledge_slice_v1', pack_ref: 'wk:test',
    pack_revision: 'revision:test', purpose: 'conversation', coverage: [],
    verdict: 'supported', sufficiency: 'PARTIAL_KNOWLEDGE', hard_constraints: [],
    facts: [{ claim_ref: 'claim:fish-net', runtime_text: 'Сети служат для ловли рыбы.' }],
    disputes: [], gaps: [] };
  let groundCalls = 0;
  const scenario = await runConversation(input, original, corrected, {
    worldKnowledgeGrounder: { async ground(value) {
      groundCalls += 1;
      return { ...value, world_knowledge: slice };
    } }
  });
  singleRepair(scenario);
  exactModelReply(scenario, corrected);
  assert.equal(groundCalls, 1);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  const initial = payload(scenario.calls[0]);
  for (const call of scenario.calls.slice(1)) {
    assert.deepEqual(payload(call).request.world_knowledge, initial.world_knowledge);
    assert.equal(Object.hasOwn(payload(call).request.world_knowledge, 'context_text'), false);
  }
  assert.deepEqual(payload(singleRepair(scenario)).request.allowed_references,
    initial.allowed_references);
});

test('semantic repair cannot change speech into a different contribution kind', async () => {
  const input = request('semantic-changed-contribution');
  input.decision_scope.allowed_contribution_kinds = ['speech', 'silence'];
  const original = plan(input, 'Вчера я видел лодку.');
  const changed = { ...structuredClone(original), contribution_kind: 'silence',
    primary_addressee_ref: null, intended_addressee_refs: [], speech: null };
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole]);
});

test('non-speech semantic repair uses only interpretation and reason', async () => {
  const input = request('semantic-silence');
  input.decision_scope.allowed_contribution_kinds = ['speech', 'silence'];
  const original = { ...plan(input), contribution_kind: 'silence',
    primary_addressee_ref: null, intended_addressee_refs: [], speech: null };
  const corrected = structuredClone(original);
  corrected.interpretation.intent = 'промолчать после вопроса';
  corrected.interpretation.grounded_contribution = 'не произносить реплику';
  corrected.reason = 'NPC сохраняет молчание.';
  assert.equal(validateConversationContributionPlan(original, input), true);
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      calls.push(call);
      return { output: privateRepair(corrected) };
    }
  } });
  const result = await model(input, { repair: { original_output: original,
    validation_errors: [{ category: 'semantic_grounding',
      concern_kinds: ['unsupported_reason'] }] } });
  assert.deepEqual(Object.keys(privateRepair(corrected)).sort(),
    ['interpretation', 'reason']);
  assert.deepEqual(result, corrected);
  assertOrdinaryRepairInput(calls[0], original);
  assert.match(calls[0].messages[0].content,
    /private repair shape: \{"interpretation"/u);
});

test('ordinary repair does not expose rejected private interpretation or reason', async () => {
  const input = request('semantic-private-source');
  const original = plan(input, 'Не берусь судить.');
  original.interpretation.intent = 'UNTRUSTED_PRIVATE_INTENT';
  original.interpretation.grounded_contribution = 'UNTRUSTED_PRIVATE_MEMORY';
  original.reason = 'UNTRUSTED_PRIVATE_REASON';
  const corrected = plan(input, 'Я пока не знаю.');
  const scenario = await runConversation(input, original, corrected);
  const retry = singleRepair(scenario);
  assertOrdinaryRepairInput(retry, original);
  assert.doesNotMatch(retry.messages[1].content,
    /UNTRUSTED_PRIVATE_(INTENT|MEMORY|REASON)/u);
  exactModelReply(scenario, corrected);
});

test('semantic repair cannot change the original dominant speech act', async () => {
  const input = request('semantic-changed-act');
  const original = plan(input, 'Не пущу тебя: вчера лодки не было.', 'refuse');
  const changed = plan(input, 'Не берусь судить.', 'answer');
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error, undefined);
  singleRepair(scenario);
  assert.equal(scenario.result.plan.speech.dominant_act, 'refuse');
  assert.equal(scenario.result.plan.speech.utterance_text,
    changed.speech.utterance_text);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
});

test('semantic repair preserves persisted topic references', async () => {
  const input = request('semantic-changed-topic');
  const original = plan(input, 'Вчера я видел лодку.');
  original.speech.topic_refs = ['route-one'];
  const changed = plan(input, 'Не берусь судить.');
  changed.speech.topic_refs = ['route-two'];
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error, undefined);
  singleRepair(scenario);
  assert.deepEqual(scenario.result.plan.speech.topic_refs, ['route-one']);
});

test('semantic repair preserves the check purpose', async () => {
  const input = request('semantic-changed-check-purpose');
  const original = plan(input, 'Вчера я видел лодку.');
  original.resolution = 'check_required';
  original.check = {
    purpose: 'договориться о помощи', attribute_ref: 'influence',
    skill_ref: 'conversation', difficulty_band: 'hard', outcomes: {
      clean_success: { delivery_quality: 'compelling', observable_effects: [] },
      success: { delivery_quality: 'credible', observable_effects: [] },
      success_with_cost: { delivery_quality: 'credible_with_visible_cost', observable_effects: [] },
      failure_with_consequence: { delivery_quality: 'unconvincing', observable_effects: [] },
      severe_failure: { delivery_quality: 'transparently_manipulative', observable_effects: [] }
    }
  };
  const changed = structuredClone(original);
  changed.speech.utterance_text = 'Не берусь судить.';
  changed.check.purpose = 'получить согласие на поездку';
  const scenario = await runConversation(input, original, changed, {
    repairOutput: { ...privateRepair(changed), check: changed.check }
  });
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
});

test('semantic repair preserves the approved execution binding', async () => {
  const input = request('semantic-changed-execution-binding');
  const first = { role: 'escort', execution_binding_ref: 'execution-one' };
  const second = { role: 'escort', execution_binding_ref: 'execution-two' };
  input.decision_scope.operation_contract.commit_route_participation = {
    allowed_bindings: [first, second]
  };
  const original = plan(input, 'Вчера я видел лодку.');
  original.supporting_operations = [{ op: 'commit_route_participation',
    ...first }];
  const changed = structuredClone(original);
  changed.speech.utterance_text = 'Не берусь судить.';
  changed.supporting_operations = [{ op: 'commit_route_participation',
    ...second }];
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error, undefined);
  singleRepair(scenario);
  assert.deepEqual(scenario.result.plan.supporting_operations,
    original.supporting_operations);
  assert.equal(Object.hasOwn(payload(singleRepair(scenario)), 'typed_decision'), false);
});

test('a second grounding failure ends in typed failure without synthetic speech or another repair', async () => {
  const input = request('semantic-second-failure');
  const original = plan(input, 'Вчера я видел лодку.');
  const stillUnsupported = plan(input, 'Вчера я видел две лодки.');
  const scenario = await runConversation(input, original, stillUnsupported, {
    audit: (call) => payload(call).plan.speech.utterance_text.includes('Вчера')
      ? rejected('unverified_past_observation', call) : approved(call)
  });
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_INVALID',
    'repeated model failure must not be converted to a successful coded reply');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined, 'no speech proposal is issued on failure');
  assert.doesNotMatch(JSON.stringify(scenario.error.details), /подтвердить не могу/u);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  assert.equal(payload(scenario.calls.at(-1)).plan.speech.utterance_text,
    stillUnsupported.speech.utterance_text);
});

test('an unseen grounding concern uses the same model repair and preserves its concrete kind', async () => {
  const input = request('semantic-unseen-concern');
  const original = plan(input, 'После отлива сюда непременно придёт лодка.');
  const corrected = plan(input, 'Не берусь обещать. Поговорим позже.');
  const unseenKind = 'unverified_tidal_arrival_expectation';
  const scenario = await runConversation(input, original, corrected, {
    audit: (call, number) => number === 1 ? rejected(unseenKind, call) : approved(call)
  });
  const retry = singleRepair(scenario);
  assert.deepEqual(payload(retry).validation_errors[0].concern_kinds, [unseenKind]);
  assertOrdinaryRepairInput(retry, original);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  exactModelReply(scenario, corrected);
});

test('model memory time is unambiguous in responder, repair, and audit payloads', async () => {
  const input = request('memory-record-time');
  const seen = observation(input);
  const memoryRef = ref('knowledge_record', 'water-level');
  const fact = { fact_ref: memoryRef, source_type: 'exact_memory',
    observed_at: { whole_minutes: '17', subminute_numerator: '1',
      subminute_denominator: '2' },
    fact_text: 'Вода у переправы поднялась выше метки.' };
  input.memory.records = [structuredClone(fact)];
  input.knowledge.memory = { records: [structuredClone(fact)],
    received_messages: [] };
  input.allowed_references.knowledge_refs.unshift(memoryRef);
  const original = plan(input, 'Я видел, как вода поднялась выше метки.');
  original.speech.claims = [claim('water', fact.fact_text, [memoryRef])];
  const corrected = plan(input, fact.fact_text);
  corrected.speech.claims = [claim('water', fact.fact_text, [memoryRef])];
  const scenario = await runConversation(input, original, corrected);
  exactModelReply(scenario, corrected);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  const expected = { fact_ref: memoryRef, source_type: fact.source_type,
    fact_text: fact.fact_text, record_time_reference: fact.observed_at };
  for (const call of scenario.calls) {
    const modelRequest = payload(call).request ?? payload(call);
    assert.deepEqual(modelRequest.memory.records, [expected]);
    assert.deepEqual(modelRequest.knowledge.memory.records, [expected]);
    assert.deepEqual(modelRequest.memory.current_observations, [seen]);
    assert.equal(Object.hasOwn(modelRequest.memory.records[0], 'observed_at'), false);
  }
  assertOrdinaryRepairInput(singleRepair(scenario), original);
  assert.deepEqual(input.memory.records, [fact]);
  assert.deepEqual(input.knowledge.memory.records, [fact]);
});

test('speech grounding separates event content from personal experience and present choice', async () => {
  const input = request('speech-source-scope');
  const seen = observation(input);
  seen.fact_text = 'Вода у переправы поднялась выше метки; переправляться опасно.';
  const fact = claim('water', seen.fact_text, [seen.observation_ref]);
  const unsupported = plan(input,
    'Я видел, как вода поднялась выше метки; переправляться опасно. Я туда обычно не суюсь.');
  unsupported.speech.claims = [fact];
  const corrected = plan(input,
    'Вода поднялась выше метки; переправляться опасно. Сейчас я туда не пойду.');
  corrected.speech.claims = [fact];
  const scenario = await runConversation(input, unsupported, corrected, {
    audit: (call, number) => number === 1
      ? rejected('unsupported_personal_experience', call) : approved(call)
  });
  const retry = singleRepair(scenario);
  const firstAudit = scenario.calls.find(({ role_id }) => role_id === auditor);
  assert.deepEqual(payload(firstAudit), { request: input, plan: unsupported });
  assert.match(firstAudit.messages[0].content, /не личное наблюдение или участие NPC/u);
  assert.match(firstAudit.messages[0].content, /ему нужна соответствующая запись в speech\.claims/u);
  assert.match(firstAudit.messages[0].content, /факт подтверждён источником, но отсутствует в claims, верни pass:false/u);
  assert.match(firstAudit.messages[0].content, /не его установившуюся привычку/u);
  assert.match(retry.messages[0].content, /matching retained original claim/u);
  assert.match(retry.messages[0].content, /Remove unsupported expansions; never add a claim or fact/u);
  assert.match(retry.messages[0].content, /does not prove NPC personal observation, participation or established habit/u);
  assert.match(retry.messages[0].content, /even when claim content_summary states only the event/u);
  exactModelReply(scenario, corrected);

  const personalInput = request('speech-supported-personal');
  const personalFact = 'Я видел, как вода поднялась выше метки.';
  const personalRef = ref('knowledge_record', 'personal-observation-1');
  personalInput.memory = { records: [{ fact_ref: personalRef,
    source_type: 'exact_memory', observed_at: personalInput.requested_at,
    fact_text: personalFact }], received_messages: [], current_observations: [] };
  personalInput.allowed_references.knowledge_refs.push(personalRef);
  const personal = plan(personalInput, personalFact);
  personal.speech.claims = [claim('personal', personalFact, [personalRef])];
  const supported = await runConversation(personalInput, personal, personal,
    { audit: approved });
  assert.equal(supported.error, undefined);
  assert.deepEqual(supported.calls.map(({ role_id }) => role_id),
    [responder, auditor]);
  for (const call of supported.calls) {
    const memory = (payload(call).request ?? payload(call)).memory.records[0];
    assert.equal(memory.fact_text, personalFact);
    assert.deepEqual(memory.record_time_reference, personalInput.requested_at);
  }

  const choice = plan(input, 'Сейчас я туда не пойду.', 'refuse');
  const chosen = await runConversation(input, choice, choice, { audit: approved });
  assert.equal(chosen.error, undefined);
  assert.deepEqual(chosen.calls.map(({ role_id }) => role_id),
    [responder, auditor]);
});
