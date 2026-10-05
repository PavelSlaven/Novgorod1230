import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConversationContributionPlan,
  validateNpcConversationResponseRequest, buildNpcDecisionBoundary,
  buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { assembleNpcConversationPlan, createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { npcConversationCandidates } from
  '../src/runtime/lower-dvina-trace-phase-2-llm-prompts.js';
import { allowedNpcContributionReferences,
  currentSceneObservationProjection, ownNpcProjection } from
  '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
function request(required = {}) {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1', exchange_id: 'exchange-1',
    state_version: 1, requested_at: { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'), decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: { source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1') },
    public_conversation_history: [], knowledge: {}, memory: {}, social_context: {}, available_resources: [],
    allowed_references: { actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [ref('item', 'item-1')], knowledge_refs: [], combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'], allowed_skill_refs: ['conversation'], allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'], operation_contract: { emit_interaction: {} }, ...required }
  };
}
function plan(input) {
  return { schema: 'conversation_contribution_plan_v1', request_id: input.request_id, boundary_id: input.boundary_id,
    conversation_id: input.conversation_id, exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech', primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')], affected_actor_refs: [],
    speech: { utterance_text: 'Я отвечу.', dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'NPC chooses to answer.' };
}
function runner(reply) {
  const calls = [];
  return { calls, roleRunner: { async run(call) { calls.push(structuredClone(call)); return { output: await reply(call) }; } } };
}

async function runNpcConversationTurn({ batchId, responder, audit = () => ({
  pass: true, concerns: []
}), addAmbiguousRef = () => {}, addObservation = false }) {
  const input = request();
  input.state_version = 2;
  addAmbiguousRef(input);
  const observationRef = ref('perception_result', 'observation-current');
  if (addObservation) {
    input.allowed_references.knowledge_refs.push(observationRef);
    input.memory.current_observations = [{ observation_ref: observationRef,
      source_type: 'direct_perception', observed_at: input.requested_at,
      fact_text: 'На очаговой площадке нет огня.' }];
  }
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: input.npc_ref, same_time_batch_ref: ref('temporal_batch', batchId),
    significance: input.decision_reasons.significance,
    categories: input.decision_reasons.categories,
    signal_refs: input.decision_reasons.signal_refs,
    state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  const knowledgeRef = ref('knowledge_record', 'claim:fish-net');
  const slice = { schema: 'world_knowledge_slice_v1', pack_ref: 'wk:test',
    pack_revision: 'revision:test', purpose: 'conversation', coverage: [],
    verdict: 'supported', sufficiency: 'PARTIAL_KNOWLEDGE',
    hard_constraints: [], facts: [{ claim_ref: knowledgeRef.entity_id,
      runtime_text: 'Рыбацкая работа связана с сетями.' }], disputes: [], gaps: [] };
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(structuredClone(call));
    if (call.role_id === 'npc_conversation_grounding_auditor') {
      return { output: await audit(call) };
    }
    const payload = JSON.parse(call.messages[1].content);
    return { output: await responder(call, payload.request ?? payload) };
  } };
  const semanticModel = createLowerDvinaTraceNpcSemanticModel({ roleRunner,
    worldKnowledgeGrounder: { async ground(currentRequest) {
      return { ...currentRequest, world_knowledge: slice };
    } } });
  let result;
  let error;
  try {
    result = await requestNpcSemanticDecision({ boundary, request: input,
      semanticModel, validateFreshPlan: semanticModel.validateFreshPlan,
      revalidateStateVersion: async () => 2 });
  } catch (caught) {
    error = caught;
  }
  return { input, boundary, calls, result, error, knowledgeRef,
    observationRef };
}

test('current scene details become cited present NPC observations', () => {
  const observedAt = { whole_minutes: '1', subminute_numerator: '0',
    subminute_denominator: '1' };
  const observations = currentSceneObservationProjection({
    party_state: { state_version: 7 }, clock: observedAt,
    current_visible_context: { sensory_details: [
      'На очаговой площадке нет огня.',
      'На очаговой площадке нет огня.'
    ] }
  });

  assert.deepEqual(observations, [{
    observation_ref: ref('perception_result', 'current-scene:7:1'),
    source_type: 'direct_perception', observed_at: observedAt,
    fact_text: 'На очаговой площадке нет огня.'
  }]);
});

test('NPC claim source admission uses only the responding actor knowledge scope',
  () => {
    const scopeRef = ref('knowledge_scope', 'npc-profile-1');
    const observationRef = ref('perception_result', 'observation-1');
    const allowed = allowedNpcContributionReferences({
      targetActor: { knowledge_profile_snapshot: {
        profile_id: scopeRef.entity_id
      } },
      conversationActorRefs: [],
      npcContributionReferencePolicy: { entity_refs: [],
        knowledge_refs: [], combat_target_refs: [] }
    }, { knowledgeRefs: [observationRef] });

    assert.deepEqual(allowed.knowledge_refs, [scopeRef, observationRef]);
    assert.deepEqual(allowed.entity_refs, []);
    assert.deepEqual(allowedNpcContributionReferences({
      targetActor: { knowledge_profile_snapshot: { profile_id: '' } },
      conversationActorRefs: [], npcContributionReferencePolicy: {}
    }).knowledge_refs, []);
  });

test('prepared NPC request admits only exact grounded WK claim refs', async () => {
  const input = request();
  const observationRef = ref('perception_result', 'observation-1');
  input.allowed_references.knowledge_refs.push(observationRef);
  let queryCount = 0;
  const worldKnowledge = conversationWorldKnowledge(() => { queryCount += 1; });
  worldKnowledge.calendar_profile = conversationCalendarProfile();
  const fixture = runner((call) => call.role_id
    === 'world_knowledge_query_planner' ? {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
      domains: ['npc_daily_life', 'material_culture',
        'architecture_settlement'],
      focus_refs: ['wk:npc_daily_life:fisher',
        'wk:material_culture:work-clothing',
        'wk:architecture_settlement:fishing-workspace'],
      requested_predicates: ['supports_function'],
      search_hints: ['рыбак сети одежда стоянка']
    } : (() => {
      const response = plan(input);
      response.speech.claims = [{ claim_id: 'claim:fish-net',
        content_summary: 'Рыбацкая работа связана с сетями.',
        form: 'assertion', speaker_posture: 'believed_true',
        source_knowledge_refs: ['claim:0'], mentioned_entity_refs: [] }];
      return response;
    })());
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    roleRunner: fixture.roleRunner, year: 1230,
    placeRefs: ['region_novgorod_land'] });
  const model = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: fixture.roleRunner, worldKnowledgeGrounder: grounder });

  const prepared = await model.prepareRequest(input);
  const wkRefs = ['claim:0', 'claim:1', 'claim:2'].map((claimRef) =>
    ref('knowledge_record', claimRef));
  assert.deepEqual(prepared.request.allowed_references.knowledge_refs,
    [...wkRefs, observationRef]);
  assert.equal(validateNpcConversationResponseRequest(prepared.request), true);
  assert.equal(queryCount, 1);
  const cached = await model.prepareRequest(input);
  assert.strictEqual(cached.request, prepared.request);
  assert.deepEqual(cached.request.allowed_references.knowledge_refs,
    prepared.request.allowed_references.knowledge_refs);
  assert.equal(queryCount, 1);
  const cacheHitPlan = await model(cached.request);
  assert.deepEqual(cacheHitPlan.speech.claims[0].source_knowledge_refs,
    [wkRefs[0]]);
  assert.equal(validateConversationContributionPlan(cacheHitPlan,
    cached.request), true);

  const supported = plan(prepared.request);
  supported.speech.claims = [{ claim_id: 'claim:fish-net',
    content_summary: 'Рыбацкая работа связана с сетями.', form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: [wkRefs[0]], mentioned_entity_refs: [] }];
  assert.equal(validateConversationContributionPlan(supported,
    prepared.request), true);

  const foreign = structuredClone(supported);
  foreign.speech.claims[0].source_knowledge_refs = [
    ref('knowledge_record', 'claim:not-in-slice')
  ];
  assert.equal(validateConversationContributionPlan(foreign,
    prepared.request), false);
});

test('NPC claim ref type resolves only from a unique allowed ID', async () => {
  const input = request();
  const scopeRef = ref('knowledge_scope', 'scope-1');
  const recordRef = ref('knowledge_record', 'claim-1');
  const observationRef = ref('perception_result', 'observation-1');
  const repeatedRef = ref('knowledge_scope', 'repeat-1');
  const duplicateScopeRef = ref('knowledge_scope', 'duplicate-1');
  const duplicateRecordRef = ref('knowledge_record', 'duplicate-1');
  input.allowed_references.knowledge_refs.push(scopeRef, recordRef,
    observationRef, repeatedRef, structuredClone(repeatedRef),
    duplicateScopeRef, duplicateRecordRef);
  const output = plan(input);
  output.speech.claims = [
    { claim_id: 'claim:scope', content_summary: 'Сведения о ремесле.',
      form: 'assertion', speaker_posture: 'believed_true',
      source_knowledge_refs: ['scope-1'], mentioned_entity_refs: [] },
    { claim_id: 'claim:record', content_summary: 'Сведения о ремесле.',
      form: 'assertion', speaker_posture: 'believed_true',
      source_knowledge_refs: [ref('knowledge_scope', 'claim-1')],
      mentioned_entity_refs: [] },
    { claim_id: 'claim:observation', content_summary: 'Сведения о ремесле.',
      form: 'assertion', speaker_posture: 'believed_true',
      source_knowledge_refs: ['observation-1'], mentioned_entity_refs: [] },
    { claim_id: 'claim:repeated', content_summary: 'Сведения о ремесле.',
      form: 'assertion', speaker_posture: 'believed_true',
      source_knowledge_refs: ['repeat-1'],
      mentioned_entity_refs: [] },
    { claim_id: 'claim:empty', content_summary: 'Сведения о ремесле.',
      form: 'assertion', speaker_posture: 'uncertain',
      source_knowledge_refs: [], mentioned_entity_refs: [] }
  ];
  const fixture = runner(() => output);
  const model = createLowerDvinaTraceNpcSemanticModel(fixture);
  const { request: prepared } = await model.prepareRequest(input);
  const resolved = await model(prepared);

  assert.deepEqual(resolved.speech.claims.map((claim) =>
    claim.source_knowledge_refs), [[scopeRef], [recordRef], [observationRef],
      [repeatedRef], []]);
  assert.equal(validateConversationContributionPlan(resolved, prepared), true);

  for (const invalidId of ['outside-allowlist', 'duplicate-1']) {
    const invalidOutput = plan(input);
    invalidOutput.speech.claims = [{ claim_id: 'claim:invalid',
      content_summary: 'Сведения о ремесле.', form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [invalidId], mentioned_entity_refs: [] }];
    const invalidModel = createLowerDvinaTraceNpcSemanticModel(
      runner(() => invalidOutput));
    const { request: invalidRequest } = await invalidModel.prepareRequest(input);
    const invalid = await invalidModel(invalidRequest);
    assert.deepEqual(invalid.speech.claims[0].source_knowledge_refs,
      [invalidId]);
    assert.equal(validateConversationContributionPlan(invalid, invalidRequest),
      false);
  }

  const malformedOutput = plan(input);
  malformedOutput.speech.claims = [{ claim_id: 'claim:malformed',
    content_summary: 'Сведения о ремесле.', form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: ref('knowledge_scope', 'scope-1'),
    mentioned_entity_refs: [] }];
  const malformedModel = createLowerDvinaTraceNpcSemanticModel(
    runner(() => malformedOutput));
  const { request: malformedRequest } = await malformedModel.prepareRequest(input);
  const malformed = await malformedModel(malformedRequest);
  assert.deepEqual(malformed.speech.claims[0].source_knowledge_refs, [null]);
  assert.equal(validateConversationContributionPlan(malformed,
    malformedRequest), false);
});

test('NPC format repair resolves claim refs through the same allowlist',
  async () => {
    const input = request();
    const allowedRef = ref('knowledge_record', 'claim:allowed');
    input.allowed_references.knowledge_refs.push(allowedRef);
    const invalidOutput = plan(input);
    invalidOutput.speech.claims = [{ claim_id: 'claim:repair',
      content_summary: 'Сведения о ремесле.', form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: ['claim:outside'], mentioned_entity_refs: [] }];
    const repairedOutput = structuredClone(invalidOutput);
    repairedOutput.speech.claims[0].source_knowledge_refs = [
      ref('knowledge_scope', 'claim:allowed')
    ];
    const fixture = runner((call) => call.role_id
      === 'npc_conversation_responder_format_repair'
      ? repairedOutput : invalidOutput);
    const model = createLowerDvinaTraceNpcSemanticModel(fixture);
    const { request: prepared } = await model.prepareRequest(input);
    const initial = await model(prepared);
    assert.equal(initial.speech.claims[0].source_knowledge_refs[0],
      'claim:outside');

    const repaired = await model(prepared, { repair: {
      original_output: initial,
      validation_errors: [{ category: 'structural', path: '$.speech.claims' }]
    } });

    assert.deepEqual(repaired.speech.claims[0].source_knowledge_refs,
      [allowedRef]);
    assert.deepEqual(fixture.calls.map((call) => call.role_id), [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair'
    ]);
  });

test('turn repair resolves a grounded claim, audits it, then replays typed refs',
  async () => {
    const scenario = await runNpcConversationTurn({
      batchId: 'claims-repair',
      responder(call, input) {
        const output = plan(input);
        output.speech.claims = [{ claim_id: 'claim:fish-net',
          content_summary: 'Рыбацкая работа связана с сетями.',
          form: 'assertion', speaker_posture: 'believed_true',
          source_knowledge_refs: call.role_id
            === 'npc_conversation_responder'
            ? ['claim:outside']
            : [{ entity_kind: 'knowledge_scope',
              entity_id: 'claim:fish-net' }],
          mentioned_entity_refs: [] }];
        return output;
      }
    });

    assert.equal(scenario.result.status, 'planned');
    assert.deepEqual(scenario.result.plan.speech.claims[0]
      .source_knowledge_refs, [scenario.knowledgeRef]);
    assert.deepEqual(scenario.calls.map(({ role_id }) => role_id), [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair',
      'npc_conversation_grounding_auditor'
    ], JSON.stringify(scenario.error));
    const responseEvidence = JSON.parse(scenario.calls[0].messages[1].content)
      .world_knowledge;
    const auditRequest = JSON.parse(scenario.calls[2].messages[1].content)
      .request;
    assert.deepEqual(auditRequest.world_knowledge, responseEvidence);

    const trace = buildNpcSemanticDecisionTrace({
      request: scenario.result.decision_context.request,
      plan: scenario.result.plan,
      root_turn_id: 'turn-claims', working_revision: 0,
      applied_change_set_id: 'change-set-claims'
    });
    const replay = await requestNpcSemanticDecision({
      boundary: scenario.boundary,
      request: scenario.result.decision_context.request,
      persistedTrace: trace,
      semanticModel: async () => assert.fail('replay must not call the model'),
      revalidateStateVersion: async () => assert.fail(
        'replay must not revalidate state')
    });
    assert.equal(replay.status, 'replayed');
    assert.deepEqual(replay.plan.speech.claims[0].source_knowledge_refs,
      [scenario.knowledgeRef]);
  });

test('turn rejects unresolved, ambiguous, and malformed claim IDs after one repair',
  async (t) => {
    const cases = [
      ['unknown', 'claim:outside', false],
      ['ambiguous', 'claim:fish-net', true],
      ['malformed', 'claim:fish-net', false, 'not-an-array']
    ];
    for (const [name, id, ambiguous, malformed] of cases) {
      await t.test(name, async () => {
        const scenario = await runNpcConversationTurn({
          batchId: `claims-${name}`,
          addAmbiguousRef(input) {
            if (ambiguous) {
              input.allowed_references.knowledge_refs.push(
                ref('knowledge_scope', 'claim:fish-net'));
            }
          },
          responder(_call, input) {
            const output = plan(input);
            output.speech.claims = [{ claim_id: 'claim:invalid',
              content_summary: 'Ссылка неразрешима.', form: 'assertion',
              speaker_posture: 'believed_true',
              source_knowledge_refs: malformed ?? [id],
              mentioned_entity_refs: [] }];
            return output;
          },
          audit: () => assert.fail('invalid refs must fail before audit')
        });
        assert.equal(scenario.error?.code, 'TURN_NPC_PLAN_INVALID');
        assert.deepEqual(scenario.calls.map(({ role_id }) => role_id), [
          'npc_conversation_responder',
          'npc_conversation_responder_format_repair'
        ]);
      });
    }
  });

test('turn audit rejection drops unsupported WK claim and keeps typed observation fallback',
  async () => {
    let auditCount = 0;
    const scenario = await runNpcConversationTurn({
      batchId: 'claims-audit-fallback',
      addObservation: true,
      responder(_call, input) {
        const output = plan(input);
        output.speech.utterance_text =
          'Рыбацкие сети всегда рвутся до зимы; сейчас на площадке нет огня.';
        output.speech.claims = [
          { claim_id: 'claim:unsupported',
            content_summary: 'Все сети рвутся до зимы.', form: 'assertion',
            speaker_posture: 'believed_true',
            source_knowledge_refs: ['claim:fish-net'],
            mentioned_entity_refs: [] },
          { claim_id: 'claim:observation',
            content_summary: 'На очаговой площадке нет огня.',
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: ['observation-current'],
            mentioned_entity_refs: [] }
        ];
        return output;
      },
      audit() {
        auditCount += 1;
        return auditCount === 1
          ? { pass: false, concerns: [{ kind: 'unsupported_qualifier' }] }
          : { pass: true, concerns: [] };
      }
    });

    assert.equal(scenario.result.status, 'planned');
    assert.equal(auditCount, 2, JSON.stringify(scenario.error));
    assert.equal(scenario.result.plan.speech.claims.length, 1);
    assert.deepEqual(scenario.result.plan.speech.claims[0].source_knowledge_refs,
      [ref('perception_result', 'observation-current')]);
    assert.match(scenario.result.plan.speech.utterance_text,
      /На очаговой площадке нет огня/u);
    assert.doesNotMatch(scenario.result.plan.speech.utterance_text,
      /до зимы/u);
  });

test('speech audit rejects invented past work from a current schedule',
  async () => {
    const input = request();
    input.npc = { machine_state: { current_activity: {
      status: 'active',
      summary: 'Сейчас осматривает и чинит принадлежащие ему сети.'
    } } };
    input.memory = { records: [], received_messages: [] };
    const unsupported = plan(input);
    unsupported.speech.utterance_text =
      'На рассвете я был у реки и проверял сети.';
    unsupported.speech.dominant_act = 'inform';
    const fixture = runner(() => ({ pass: false, concerns: [{
      kind: 'unsupported_past_activity'
    }] }));
    const result = await createLowerDvinaTraceNpcSemanticModel(
      fixture).validateFreshPlan(unsupported, input);

    assert.equal(result.pass, false);
    assert.equal(result.errors[0].category, 'semantic_grounding');
    assert.equal(result.errors[0].retryable, true);
    assert.deepEqual(result.errors[0].concern_kinds,
      ['unsupported_past_activity']);
    assert.match(fixture.calls[0].messages[0].content,
      /описывает только requested_at/u);
    assert.match(fixture.calls[0].messages[0].content,
      /прошлой деятельности или наблюдения от первого лица нужна\s+точная запись памяти/u);
    assert.match(fixture.calls[0].messages[0].content,
      /Пустая или отсутствующая память никогда не доказывает отрицательное\s+прошлое наблюдение/u);
    assert.match(fixture.calls[0].messages[0].content,
      /даже если это правдоподобно для\s+места или социальной ситуации/u);
    assert.match(fixture.calls[0].messages[0].content,
      /memory\.current_observations подтверждает только свой точный настоящий fact_text/u);
    assert.match(fixture.calls[0].messages[0].content,
      /Обязательный отказ: если в memory\.records нет точной подтверждающей записи/u);
    assert.equal(fixture.calls[0].overrides.maxTokens, 256);
  });

test('speech audit applies to another NPC, place, and earlier time', async () => {
  const input = request();
  input.npc = { machine_state: { current_activity: {
    status: 'active', summary: 'Сейчас перебирает верёвки.'
  } } };
  input.memory = { records: [], received_messages: [] };
  const unsupported = plan(input);
  unsupported.speech.utterance_text =
    'Вчера до твоего прихода я видел людей у переправы.';
  const fixture = runner(() => ({ pass: false, concerns: [{
    kind: 'unsupported_past_observation'
  }] }));

  const result = await createLowerDvinaTraceNpcSemanticModel(
    fixture).validateFreshPlan(unsupported, input);
  assert.equal(result.pass, false);
  assert.deepEqual(result.errors[0].concern_kinds,
    ['unsupported_past_observation']);
});

test('source-free NPC claims fail before the semantic auditor call', async () => {
  const input = request();
  const unsupported = plan(input);
  unsupported.speech.claims = [{ claim_id: 'unsupported',
    content_summary: 'Неподтверждённый факт.', form: 'assertion',
    speaker_posture: 'believed_true', source_knowledge_refs: [],
    mentioned_entity_refs: [] }];
  const fixture = runner(() => assert.fail('semantic auditor must not run'));

  const result = await createLowerDvinaTraceNpcSemanticModel(
    fixture).validateFreshPlan(unsupported, input);

  assert.deepEqual(result.errors[0].concern_kinds,
    ['claim_without_source_knowledge']);
  assert.equal(fixture.calls.length, 0);
});

test('first-contact identity and guarded behavior are required and repaired',
  async () => {
    const input = request();
    input.npc = { identity_state: { canonical_name: 'Еремей' } };
    input.social_context = {
      first_contact_introduction: { canonical_name: 'Еремей' },
      npc_behavior: { required_interaction_tag: 'withhold' }
    };
    const incomplete = plan(input);
    const fixture = runner(() => assert.fail('semantic auditor must not run'));
    const model = createLowerDvinaTraceNpcSemanticModel(fixture);

    const validation = await model.validateFreshPlan(incomplete, input);
    assert.equal(validation.pass, false);
    assert.deepEqual(validation.errors.flatMap(({ concern_kinds: kinds }) => kinds), [
      'first_contact_introduction_missing',
      'required_npc_behavior_missing'
    ]);
    assert.equal(validation.errors.every(({ retryable }) => retryable), true);
    assert.equal(fixture.calls.length, 0);

    const repaired = await model(input, { repair: {
      original_output: incomplete,
      validation_errors: validation.errors
    } });
    assert.equal(repaired.speech.utterance_text,
      'Я Еремей. Об этом я ничего подтвердить не могу.');
    assert.deepEqual(repaired.speech.interaction_tags, ['withhold']);
  });

test('semantic grounding failure keeps cited present facts and falls back safely',
  async () => {
    const input = request();
    const observation = {
      observation_ref: ref('perception_result', 'current-scene:1:1'),
      source_type: 'direct_perception', observed_at: input.requested_at,
      fact_text: 'На очаге не видно пламени.'
    };
    input.memory = { records: [], received_messages: [],
      current_observations: [observation] };
    input.allowed_references.knowledge_refs.push(observation.observation_ref);
    const original = plan(input);
    original.speech.claims = [{ claim_id: 'fire',
      content_summary: observation.fact_text, form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [observation.observation_ref],
      mentioned_entity_refs: [] }, { claim_id: 'unsupported',
      content_summary: 'Вчера лодки не было.', form: 'assertion',
      speaker_posture: 'believed_true', source_knowledge_refs: [],
      mentioned_entity_refs: [] }];
    const fixture = runner(() => assert.fail('repair must use safe fallback'));
    const result = await createLowerDvinaTraceNpcSemanticModel(
      fixture)(input, { repair: {
      original_output: original,
      validation_errors: [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', retryable: true
      }]
    } });

    assert.equal(fixture.calls.length, 0);
    assert.equal(validateConversationContributionPlan(result, input), true);
    assert.equal(result.speech.utterance_text,
      'На очаге не видно пламени. Остального я подтвердить не могу.');
    assert.deepEqual(result.speech.claims, [{
      claim_id: 'fallback-current-observation-1',
      content_summary: observation.fact_text, form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [observation.observation_ref],
      mentioned_entity_refs: []
    }]);
  });

test('semantic grounding fallback gives a direct safe reply and keeps self-introduction',
  async () => {
    const input = request();
    input.npc = { identity_state: { canonical_name: 'Еремей' } };
    input.memory = { records: [], received_messages: [] };
    input.public_conversation_history = [{
      speaker_ref: ref('player_character', 'player-1'),
      utterance_text: 'Спрашиваю про лодочника Онисима и крушение.'
    }];
    const original = plan(input);
    original.speech.utterance_text =
      'Здравствуйте. Я Еремей, рыбак. Онисима я не знаю и после крушения его не видел.';
    original.speech.claims = [{ claim_id: 'unsupported',
      content_summary: 'После крушения Онисима не видел.', form: 'assertion',
      speaker_posture: 'believed_true', source_knowledge_refs: [],
      mentioned_entity_refs: [] }];
    const fixture = runner(() => assert.fail('repair must use safe fallback'));

    const result = await createLowerDvinaTraceNpcSemanticModel(
      fixture)(input, { repair: {
      original_output: original,
      validation_errors: [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', retryable: true
      }]
    } });

    assert.equal(fixture.calls.length, 0);
    assert.equal(validateConversationContributionPlan(result, input), true);
    assert.equal(result.speech.utterance_text,
      'Я Еремей. Об этом я ничего подтвердить не могу.');
    assert.doesNotMatch(result.speech.utterance_text,
      /Вы спросили|«|»|не знаю|не видел/u);
    assert.deepEqual(result.speech.claims, []);
  });

test('semantic grounding fallback ignores a non-string NPC name', async () => {
  const input = request();
  input.npc = { identity_state: { canonical_name: 7 } };
  const original = plan(input);
  const fixture = runner(() => assert.fail('repair must use safe fallback'));

  const result = await createLowerDvinaTraceNpcSemanticModel(
    fixture)(input, { repair: {
    original_output: original,
    validation_errors: [{ category: 'semantic_grounding' }]
  } });

  assert.equal(result.speech.utterance_text,
    'Об этом я ничего подтвердить не могу.');
});

test('semantic fallback keeps the original responder World Knowledge for its auditor',
  async () => {
    const input = request();
    const slice = { schema: 'world_knowledge_slice_v1', pack_ref: 'wk:test',
      pack_revision: 'revision:test', purpose: 'conversation', coverage: [],
      verdict: 'supported', sufficiency: 'PARTIAL_KNOWLEDGE',
      hard_constraints: [], facts: [], disputes: [], gaps: [] };
    let groundCalls = 0;
    const grounder = { async ground(value) {
      groundCalls += 1;
      return { ...value, world_knowledge: slice };
    } };
    const calls = [];
    const roleRunner = { async run(call) {
      calls.push(structuredClone(call));
      return { output: call.role_id === 'npc_conversation_grounding_auditor'
        ? { pass: true, concerns: [] } : plan(input) };
    } };
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner,
      worldKnowledgeGrounder: grounder });
    const original = await model(input);
    const fallback = await model(input, { repair: {
      // requestNpcSemanticDecision clones this before handing it back as the
      // semantic-repair context; the exact WK evidence must survive that clone.
      original_output: structuredClone(original),
      validation_errors: [{ category: 'semantic_grounding', retryable: true }]
    } });

    assert.equal(await model.validateFreshPlan(fallback, input), true);
    assert.equal(groundCalls, 1);
    const responderRequest = JSON.parse(calls[0].messages[1].content);
    const auditorRequest = JSON.parse(calls[1].messages[1].content).request;
    assert.deepEqual(auditorRequest.world_knowledge,
      responderRequest.world_knowledge);
    assert.equal(Object.hasOwn(auditorRequest.world_knowledge, 'context_text'),
      false);
    assert.match(calls[1].messages[0].content,
      /Не принимай высказывание о незнании того, что услышал игрок/u);
  });

test('route contract candidate reaches initial and repair prompts', async () => {
  const input = request();
  input.allowed_references.entity_refs.push(ref('route', 'route-1'));
  input.allowed_references.knowledge_refs.push(ref('knowledge_scope', 'knowledge-1'));
  input.decision_scope.operation_contract = { disclose_known_route: { owner: '@rus/visibility-knowledge-memory',
    route_ref: 'route-1', source_knowledge_scope_ref: 'knowledge-1' } };
  const [, candidate] = npcConversationCandidates(input);
  assert.equal(validateConversationContributionPlan(candidate, input), true);
  assert.deepEqual(candidate.speech.topic_refs, ['route-1']);
  const { schema, request_id, boundary_id, conversation_id, exchange_id, state_version, speaker_ref, ...semantic } = candidate;
  const fixture = runner(() => semantic);
  const model = createLowerDvinaTraceNpcSemanticModel(fixture);
  for (const context of [{}, { repair: { original_output: { invalid: true }, validation_errors: ['invalid route operation'] } }]) {
    const result = await model(input, context);
    assert.equal(validateConversationContributionPlan(result, input), true);
    assert.deepEqual(result.supporting_operations, candidate.supporting_operations);
  }
  for (const call of fixture.calls) assert.match(call.messages[0].content, /"op":"disclose_known_route","route_ref":"route-1"/u);
  assert.doesNotMatch(fixture.calls[1].messages[0].content, /no valid disclose_known_route operation/u);
  const wrong = structuredClone(semantic);
  wrong.speech.topic_refs = ['route-other'];
  wrong.speech.claims[0].mentioned_entity_refs = [ref('route', 'route-other')];
  assert.equal(validateConversationContributionPlan(assembleNpcConversationPlan(wrong, input), input), false);
});

test('conversation production model receives planner-selected role, material, and workplace facts from trusted NPC role', async () => {
  const input = request();
  input.requested_at = { whole_minutes: String(365 * 1440),
    subminute_numerator: '0', subminute_denominator: '1' };
  input.npc = ownNpcProjection({ ref: input.npc_ref, instance_id: 'npc-1',
    role_ref: { id: 'nov_role_fisher', source: 'approved_scenario_profile' },
    identity_state: {}, machine_state: {} });
  input.actor = { role_ref: 'untrusted-role' };
  input.npc_safe_state = { role_ref: 'untrusted-safe-role' };
  let query;
  const worldKnowledge = conversationWorldKnowledge((value) => { query = value; });
  worldKnowledge.calendar_profile = conversationCalendarProfile();
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call);
    if (call.role_id === 'world_knowledge_query_planner') return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
      domains: ['npc_daily_life', 'material_culture', 'architecture_settlement'],
      focus_refs: ['wk:npc_daily_life:fisher', 'wk:material_culture:work-clothing',
        'wk:architecture_settlement:fishing-workspace'],
      requested_predicates: ['supports_function'], search_hints: ['рыбак сеть одежда стоянка']
    } };
    if (call.role_id === 'npc_conversation_grounding_auditor') return { output: {
      pass: true, concerns: []
    } };
    return { output: plan(input) };
  } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    roleRunner, year: 1230, placeRefs: ['region_novgorod_land'] });
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner,
    worldKnowledgeGrounder: grounder });
  const responsePlan = await model(input);
  assert.equal(await model.validateFreshPlan(responsePlan, input), true);
  const repairedPlan = await model(input, { repair: {
    original_output: responsePlan,
    validation_errors: [{ category: 'structural', retryable: true }]
  } });
  assert.equal(await model.validateFreshPlan(repairedPlan, input), true);
  assert.deepEqual(query.context.actor_facets, { role_ref: 'nov_role_fisher' });
  assert.equal(query.context.time.year, 1231);
  const modelCall = calls.find((call) =>
    call.role_id === 'npc_conversation_responder');
  const modelPrompt = modelCall.messages[1].content;
  assert.equal(Object.hasOwn(JSON.parse(modelPrompt).world_knowledge,
    'context_text'), false);
  assert.match(modelPrompt, /Рыбацкая работа связана с сетями/u);
  assert.match(modelPrompt, /Рабочая одежда защищает при хозяйственной работе/u);
  assert.match(modelPrompt, /Рыбацкая стоянка — рабочее место/u);
  const instructions = calls.find((call) =>
    call.role_id === 'npc_conversation_responder').messages[0].content;
  assert.match(instructions, /State only what supplied claims establish/u);
  assert.match(instructions, /say that it is not established or unknown/u);
  assert.match(instructions, /Do not expand insufficient evidence into an inventory of hypothetical missing components/u);
  assert.match(instructions, /do not recite or apply a conditional historical rule whose stated trigger is not established/u);
  assert.match(instructions, /preserve the limit without inferring a procedure or prohibition/u);
  assert.match(instructions,
    /Missing or empty memory is not evidence/u);
  assert.match(instructions,
      /Never infer a current object, condition, resource, amenity/u);
  assert.match(instructions, /A missing personal field means unknown/u);
  assert.match(instructions,
    /A knowingly_false posture describes the NPC assertion/u);
  const auditorCalls = calls.filter((call) =>
    call.role_id === 'npc_conversation_grounding_auditor');
  const groundedResponderRequests = calls.filter((call) =>
    call.role_id === 'npc_conversation_responder'
      || call.role_id === 'npc_conversation_responder_format_repair')
    .map((call) => {
      const payload = JSON.parse(call.messages[1].content);
      return payload.request?.world_knowledge ?? payload.world_knowledge;
    });
  assert.equal(auditorCalls.length, 2);
  assert.equal(groundedResponderRequests.length, 2);
  assert.equal(calls.filter((call) =>
    call.role_id === 'world_knowledge_query_planner').length, 1);
  for (const [index, auditorCall] of auditorCalls.entries()) {
    const auditorInput = JSON.parse(auditorCall.messages[1].content).request;
    assert.deepEqual(auditorInput.world_knowledge,
      groundedResponderRequests[index]);
    assert.equal(Object.hasOwn(auditorInput.world_knowledge, 'context_text'),
      false);
  }
  const auditorCall = auditorCalls[0];
  assert.match(auditorCall.messages[0].content,
    /ref типа knowledge_scope только разрешает сослаться на источник/u);
  assert.match(auditorCall.messages[0].content,
    /Отсутствующие личные поля означают «неизвестно»/u);
  assert.match(auditorCall.messages[0].content,
    /Если у claim posture равно knowingly_false, это остаётся намеренно ложным утверждением говорящего/u);
});

function conversationCalendarProfile() {
  return { profile_id: 'conversation-calendar', version: '1', status: 'approved',
    provenance: { source_id: 'test', source_version: '1' },
    epoch: { game_timestamp: { whole_minutes: '0', subminute_numerator: '0',
      subminute_denominator: '1' }, year: '1230', month: '1', day: '1' },
    calendar_system: 'test', month_rules: { month_lengths: ['365'] },
    leap_rules: { cycle_years: '1', leap_year_indexes: [], leap_month: '1', leap_days: '0' },
    day_start_rule: { local_minute: '0' }, local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'day', start_minute: '0', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'year', start_day: '1', end_day: '365' }] },
    daylight_rule: { ranges: [{ id: 'light', start_day: '1', end_day: '365' }] } };
}

function conversationWorldKnowledge(onQuery) {
  const concepts = [
    ['wk:npc_daily_life:fisher', 'npc_daily_life'],
    ['wk:material_culture:work-clothing', 'material_culture'],
    ['wk:architecture_settlement:fishing-workspace', 'architecture_settlement']
  ].map(([concept_ref, domain]) => ({ concept_ref, domain,
    review_status: 'approved' }));
  const predicate = { supports_function: {} };
  const bundle = { manifest: { status: 'production', pack_ref: 'wk:test',
    revision_id: 'revision:test', default_locale: 'ru', supported_locales: ['ru'],
    domains: concepts.map(({ domain }) => domain) },
  concepts, claims: concepts.map(({ domain }, index) => ({ claim_ref: `claim:${index}`, domain })),
  exact_indexes: { concept_to_claim_refs: Object.fromEntries(concepts.map(({ concept_ref }, index) =>
    [concept_ref, [`claim:${index}`]])) },
  lexical_indexes: { ru: {} },
  predicate_registry: Object.fromEntries(concepts.map(({ domain }) =>
    [domain, predicate])), coverage_profiles: concepts.map(({ domain }) => ({
    domain, status: 'production', runtime_requirement: 'required_when_selected',
    purposes: ['conversation'] })) };
  return { bundle, encoder: { encode: async () => new Float32Array(1) },
    vector_index: { search: () => new Map() }, core: { resolveWorldKnowledge(value) {
      onQuery(value);
      return { schema: 'world_knowledge_slice_v1', pack_ref: 'wk:test',
        pack_revision: 'revision:test', purpose: value.purpose, coverage: [],
        verdict: 'supported', hard_constraints: [], disputes: [], gaps: [],
        candidates: [], evidence_fragments: [], facts: concepts.map(({ concept_ref, domain }, index) => ({
          claim_ref: `claim:${index}`, domain, predicate: 'supports_function',
          polarity: 'support', object: { kind: 'literal', value: 'supported' },
          runtime_text: [
            'Рыбацкая работа связана с сетями.',
            'Рабочая одежда защищает при хозяйственной работе.',
            'Рыбацкая стоянка — рабочее место.'
          ][index], qualifiers: {}, evidence_refs: [], subject_ref: concept_ref
        })) };
    } } };
}
