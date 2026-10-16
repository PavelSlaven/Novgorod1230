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
const approved = () => ({ pass: true, concerns: [] });
const rejected = (kind) => ({ pass: false, concerns: [{ kind }] });
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
  audit = (_call, number) => number === 1
    ? rejected('unsupported_qualifier') : approved(),
  worldKnowledgeGrounder = null
} = {}) {
  // Validate fixtures before exercising production; schema defects are not
  // evidence of a semantic-repair regression.
  assert.equal(validateNpcConversationResponseRequest(input), true);
  assert.equal(validateConversationContributionPlan(original, input), true);
  assert.equal(validateConversationContributionPlan(corrected, input), true);
  const before = structuredClone(input);
  const calls = [];
  let auditCount = 0;
  const roleRunner = { async run(call) {
    calls.push(structuredClone(call));
    if (process.env.ISSUE_247_PAYLOAD_LOG) appendFileSync(
      process.env.ISSUE_247_PAYLOAD_LOG,
      `${JSON.stringify({ case: input.request_id, call })}\n`);
    if (call.role_id === auditor) return { output: audit(call, ++auditCount) };
    assert.ok([responder, repairRole].includes(call.role_id), call.role_id);
    return { output: structuredClone(call.role_id === responder
      ? original : corrected) };
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
  return { calls, result, error };
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

test('grounding rejection calls one model repair with full output and concrete concerns', async () => {
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
      original_output_present: repairs.length > 0
        && Object.hasOwn(payload(repairs[0]), 'original_output'),
      concern_kinds: repairs.length > 0
        ? payload(repairs[0]).validation_errors[0].concern_kinds ?? [] : [] };
  }), [false, true].map((withOperations) => ({ withOperations, repair_calls: 1,
    original_output_present: true, concern_kinds: ['unsupported_qualifier'] })));
  for (const { original, corrected, scenario } of probes) {
    const retry = singleRepair(scenario);
    assert.deepEqual(payload(retry).original_output, original);
    assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
      [responder, auditor, repairRole, auditor]);
    exactModelReply(scenario, corrected);
  }
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
  assert.deepEqual(payload(retry).original_output, original);
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
  const scenario = await runConversation(input, original, changed, { audit: approved });
  const retry = singleRepair(scenario);
  assert.deepEqual(payload(retry).typed_decision.primary_addressee_ref, otherAddressee);
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

test('repair preserves refusal and introduction while marker repair keeps a separate clean wire', async () => {
  const input = request('semantic-refusal-and-marker-pair');
  input.npc = { identity_state: { canonical_name: 'Еремей' } };
  const corrected = plan(input, 'Я Еремей. Не стану об этом говорить.', 'refuse');
  const original = plan(input, 'Я Еремей. Не пущу тебя: вчера лодки не было.', 'refuse');
  const scenario = await runConversation(input, original, corrected);
  const retry = singleRepair(scenario);
  assert.deepEqual(payload(retry).original_output, original,
    'ordinary grounding repair retains the complete original response');
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
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE',
    'a schema-valid change of contribution is not a repair of the original decision');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole]);
});

test('semantic repair cannot change the original dominant speech act', async () => {
  const input = request('semantic-changed-act');
  const original = plan(input, 'Не пущу тебя: вчера лодки не было.', 'refuse');
  const changed = plan(input, 'Не берусь судить.', 'answer');
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE',
    'a grounded answer cannot replace the NPC refusal during semantic repair');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole]);
});

test('semantic repair preserves persisted topic references', async () => {
  const input = request('semantic-changed-topic');
  const original = plan(input, 'Вчера я видел лодку.');
  original.speech.topic_refs = ['route-one'];
  const changed = plan(input, 'Не берусь судить.');
  changed.speech.topic_refs = ['route-two'];
  const scenario = await runConversation(input, original, changed);
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
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
  const scenario = await runConversation(input, original, changed);
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
  assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_NOT_APPLICABLE');
  singleRepair(scenario);
  assert.equal(scenario.result, undefined);
  assert.doesNotMatch(JSON.stringify(payload(singleRepair(scenario)).typed_decision),
    /execution-one|execution-two/u);
});

test('a second grounding failure ends in typed failure without synthetic speech or another repair', async () => {
  const input = request('semantic-second-failure');
  const original = plan(input, 'Вчера я видел лодку.');
  const stillUnsupported = plan(input, 'Вчера я видел две лодки.');
  const scenario = await runConversation(input, original, stillUnsupported, {
    audit: (call) => payload(call).plan.speech.utterance_text.includes('Вчера')
      ? rejected('unverified_past_observation') : approved()
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
    audit: (_call, number) => number === 1 ? rejected(unseenKind) : approved()
  });
  const retry = singleRepair(scenario);
  assert.deepEqual(payload(retry).validation_errors[0].concern_kinds, [unseenKind]);
  assert.deepEqual(payload(retry).original_output, original);
  assert.deepEqual(scenario.calls.map(({ role_id }) => role_id),
    [responder, auditor, repairRole, auditor]);
  exactModelReply(scenario, corrected);
});
