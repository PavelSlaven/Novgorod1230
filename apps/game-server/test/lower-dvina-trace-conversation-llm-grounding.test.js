import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConversationContributionPlan } from '@rus/npc-runtime';
import { assembleNpcConversationPlan, createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { npcConversationCandidates } from
  '../src/runtime/lower-dvina-trace-phase-2-llm-prompts.js';
import { ownNpcProjection } from
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
      /current_activity describes only requested_at/u);
    assert.match(fixture.calls[0].messages[0].content,
      /Past first-person activity or observation needs an exact memory record/u);
    assert.equal(fixture.calls[0].overrides.maxTokens, 20_000);
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

test('semantic grounding failure requests one complete response rewrite',
  async () => {
    const input = request();
    const fixture = runner(() => plan(input));
    await createLowerDvinaTraceNpcSemanticModel(fixture)(input, { repair: {
      original_output: plan(input),
      validation_errors: [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', retryable: true
      }]
    } });

    assert.equal(fixture.calls[0].role_id,
      'npc_conversation_responder_format_repair');
    assert.match(fixture.calls[0].messages[0].content,
      /Rewrite the complete response once/u);
    assert.equal(Object.hasOwn(
      JSON.parse(fixture.calls[0].messages[1].content), 'original_output'),
    false);
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
    return { output: plan(input) };
  } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    roleRunner, year: 1230, placeRefs: ['region_novgorod_land'] });
  await createLowerDvinaTraceNpcSemanticModel({ roleRunner,
    worldKnowledgeGrounder: grounder })(input);
  assert.deepEqual(query.context.actor_facets, { role_ref: 'nov_role_fisher' });
  assert.equal(query.context.time.year, 1231);
  const modelPrompt = calls.find((call) =>
    call.role_id === 'npc_conversation_responder').messages[1].content;
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
        candidates: [], evidence_fragments: [], context_text: [
          'Рыбацкая работа связана с сетями.',
          'Рабочая одежда защищает при хозяйственной работе.',
          'Рыбацкая стоянка — рабочее место.'
        ].join('\n'), facts: concepts.map(({ concept_ref, domain }, index) => ({
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
