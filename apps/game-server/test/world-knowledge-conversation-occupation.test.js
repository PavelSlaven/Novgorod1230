import { npcAuditReport } from './support/npc-audit-report.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import * as partyPorts from '../src/runtime/world-knowledge-party-ports.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { ownNpcProjection } from
  '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../src/runtime/lower-dvina-trace-npc-initiated-conversation.js';
import { digest, phase3State, revision14Bundle, runPhase3, npcSpeechPlan } from
  './lower-dvina-trace-m2-conversation-fixture.js';

// D102 / #615: acceptance fixture only; the active pack is never changed.
const productionBundle = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
  import.meta.url), 'utf8'));
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const ROLE = 'nov_role_fisher';
const OCCUPATIONS = {
  fisher: 'd102-occ-private-fisher-615',
  smith: 'd102-occ-private-smith-615',
  healer: 'd102-occ-private-healer-615'
};
const OCCUPATION_SOURCE = 'd102-private-approved-occupation-source-615';
const COMMON = 'claim:d102-common';
const CLAIMS = {
  fisher: 'claim:d102-net', smith: 'claim:d102-forge', healer: 'claim:d102-herb'
};
const FOCUSES = {
  fisher: 'wk:npc_daily_life:d102-net',
  smith: 'wk:npc_daily_life:d102-forge',
  healer: 'wk:npc_daily_life:d102-herb',
  common: 'wk:npc_daily_life:d102-common'
};
const TIME = { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' };

function occupationBundle() {
  const bundle = structuredClone(productionBundle);
  const entries = [
    ['fisher', CLAIMS.fisher, 'Сеть чинят, связывая разорванные ячеи.'],
    ['smith', CLAIMS.smith, 'Ковка изменяет форму нагретого железа.'],
    ['healer', CLAIMS.healer, 'Собранные травы различают по узнаваемым признакам.'],
    ['common', COMMON, 'Работу обсуждают со своим собеседником.']
  ];
  bundle.manifest.domains = ['npc_daily_life'];
  bundle.predicate_registry = { npc_daily_life:
    structuredClone(productionBundle.predicate_registry.npc_daily_life) };
  bundle.concepts = entries.map(([kind]) => {
    const concept = structuredClone(productionBundle.concepts[0]);
    concept.concept_ref = FOCUSES[kind];
    concept.domain = 'npc_daily_life';
    concept.broader_refs = [];
    concept.related_refs = [];
    for (const locale of bundle.manifest.supported_locales) {
      concept.localizations[locale] = {
        ...concept.localizations[locale], concept_ref: concept.concept_ref,
        labels: [`Мастерство: ${kind}`], short_definition: `Тема мастерства: ${kind}`,
        search_aliases: []
      };
    }
    return concept;
  });
  bundle.claims = entries.map(([kind, claimRef, text]) => {
    const claim = structuredClone(productionBundle.claims[0]);
    Object.assign(claim, { claim_ref: claimRef, domain: 'npc_daily_life',
      subject_ref: FOCUSES[kind], predicate: 'supported_fact',
      applicability: { context_scope: 'universal' },
      knowledge_access: kind === 'common'
        ? { class: 'common_cultural', required_facets: [] }
        : { class: 'occupation_bound', required_facets: ['occupation_ref'],
          required_values: { occupation_ref: OCCUPATIONS[kind] } }
    });
    for (const locale of bundle.manifest.supported_locales) {
      claim.localizations[locale] = {
        ...claim.localizations[locale], claim_ref: claimRef,
        runtime_text: text, search_aliases: []
      };
    }
    return claim;
  });
  bundle.coverage_profiles = [{
    ...structuredClone(productionBundle.coverage_profiles.find(
      ({ domain }) => domain === 'npc_daily_life')),
    scope: { context_scope: 'universal' }, purposes: ['conversation', 'narration']
  }];
  const claimRefs = bundle.claims.map(({ claim_ref }) => claim_ref);
  bundle.exact_indexes = {
    concept_by_ref: Object.fromEntries(bundle.concepts.map((concept) =>
      [concept.concept_ref, concept])),
    concept_to_claim_refs: Object.fromEntries(bundle.claims.map((claim) =>
      [claim.subject_ref, [claim.claim_ref]])),
    domain_to_claim_refs: { npc_daily_life: claimRefs },
    predicate_to_claim_refs: { supported_fact: claimRefs }
  };
  bundle.structured_indexes = {
    time_to_claim_refs: { universal: claimRefs }, place_to_claim_refs: {},
    actor_facet_to_claim_refs: {}, conflict_group_to_claim_refs: {},
    question_class_to_profile_refs: {}
  };
  bundle.lexical_indexes = Object.fromEntries(bundle.manifest.supported_locales
    .map((locale) => [locale, { мастерство: claimRefs, conversation: claimRefs }]));
  return bundle;
}

function npc(id, occupation) {
  return { instance_id: id, ref: ref('npc', id),
    role_ref: { id: ROLE, source: 'approved_scenario_profile' },
    ...(occupation === undefined ? {} : { occupation_ref: occupation }),
    identity_state: {}, machine_state: {} };
}

function requestFor(actor) {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: `req:${actor.instance_id}`,
    boundary_id: 'boundary:615', conversation_id: 'conversation:615',
    exchange_id: 'exchange:615', state_version: 1, requested_at: TIME,
    npc_ref: ref('npc', actor.instance_id), npc: ownNpcProjection(actor),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal:615')],
      perceived_changes: ['Собеседник спрашивает про мастерство.'] },
    perceived_message: { source_statement_ref: ref('conversation_statement', 'statement:615'),
      perception_result_ref: ref('perception_result', 'perception:615') },
    public_conversation_history: [{ speaker_ref: ref('player_character', 'player:615'),
      utterance_text: 'Расскажи про мастерство.' }],
    knowledge: {}, memory: { records: [], received_messages: [] },
    social_context: {}, available_resources: [],
    allowed_references: { actor_refs: [ref('npc', actor.instance_id),
      ref('player_character', 'player:615')], entity_refs: [],
    knowledge_refs: [], combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [], allowed_skill_refs: [],
      allowed_check_profile_refs: [], allowed_duration_classes: ['domain_owned'],
      operation_contract: {} }
  };
}

function authoritativeModel(model, stateOf) {
  assert.equal(typeof partyPorts.withNpcWorldKnowledgeAuthoritative, 'function',
    '#615 requires the server NPC conversation authoritative port');
  return partyPorts.withNpcWorldKnowledgeAuthoritative(model, stateOf);
}

function harness({ responsePlan = (request) => npcSpeechPlan(request, {
  utteranceText: 'Слышу тебя.', dominantAct: 'answer'
}) } = {}) {
  const calls = [];
  const queries = [];
  const slices = [];
  const bundle = occupationBundle();
  const core = createWorldKnowledgeCore(bundle);
  const roleRunner = { async run(call) {
    calls.push(structuredClone(call));
    const payload = JSON.parse(call.messages[1].content);
    const request = payload.request ?? payload;
    if (call.role_id === 'world_knowledge_query_planner') return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
      domains: ['npc_daily_life'],
      focus_refs: Object.keys(request.available_knowledge_refs),
      requested_predicates: ['supported_fact'], search_hints: ['мастерство']
    } };
    if (call.role_id === 'npc_conversation_grounding_auditor') {
      return { output: npcAuditReport(call) };
    }
    assert.ok(['npc_conversation_responder', 'npc_conversation_responder_format_repair']
      .includes(call.role_id), `unexpected role: ${call.role_id}`);
    return { output: responsePlan(request) };
  } };
  const worldKnowledge = {
    bundle, encoder: { encode: async () => new Float32Array(1) },
    vector_index: { search: () => new Map() },
    core: { ...core, resolveWorldKnowledge(query, options) {
      queries.push(structuredClone(query));
      const slice = core.resolveWorldKnowledge(query, options);
      slices.push(structuredClone(slice));
      return slice;
    } }
  };
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge, roleRunner, year: 1230, placeRefs: ['region_novgorod_land']
  });
  return { calls, queries, slices, grounder,
    model: createLowerDvinaTraceNpcSemanticModel({ roleRunner,
      worldKnowledgeGrounder: grounder }) };
}

function assertAccess({ calls, slices, queries }, kind, index = 0) {
  const plannerCalls = calls.filter(({ role_id }) => role_id === 'world_knowledge_query_planner');
  const menu = JSON.parse(plannerCalls[index].messages[1].content).available_knowledge_refs;
  const refs = Object.keys(menu);
  // The planner menu is filtered before the planner gets to make a choice.
  assert.ok(refs.includes(FOCUSES.common), 'common focus must remain available');
  const facts = slices[index].facts.map(({ claim_ref }) => claim_ref);
  assert.ok(facts.includes(COMMON), 'common knowledge must remain available');
  for (const profession of Object.keys(CLAIMS)) {
    assert.equal(refs.includes(FOCUSES[profession]), profession === kind,
      `planner focus ${profession}, speaker ${kind ?? 'none'}`);
    assert.equal(facts.includes(CLAIMS[profession]), profession === kind,
      `Core slice ${profession}, speaker ${kind ?? 'none'}`);
  }
  assert.equal(queries[index].context.actor_facets.role_ref, ROLE);
  assert.equal(queries[index].context.actor_facets.occupation_ref,
    kind === undefined ? undefined : OCCUPATIONS[kind]);
}

function assertNoOccupationWire(calls) {
  const proseCalls = calls.filter(({ role_id }) => role_id.startsWith('npc_conversation_'));
  assert.ok(proseCalls.length > 0, 'prose calls must actually occur');
  for (const call of proseCalls) {
    const text = JSON.stringify(call.messages);
    assert.doesNotMatch(text, /"occupation(?:_ref|_id|_source)?"/u,
      `${call.role_id} must not receive a new occupation key`);
    for (const value of [...Object.values(OCCUPATIONS), OCCUPATION_SOURCE]) {
      assert.equal(text.includes(value), false,
        `${call.role_id} must not receive private occupation id/source`);
    }
  }
}

test('D102 #615: same role, own occupation only, common focus and facts retained', async () => {
  for (const kind of ['fisher', 'smith', undefined, 'healer']) {
    const actor = npc(`npc:${kind ?? 'none'}`, kind === undefined ? undefined : OCCUPATIONS[kind]);
    const fixture = harness();
    const model = authoritativeModel(fixture.model, { clock: TIME, npcs: [actor] });
    const input = requestFor(actor);
    const result = await model(input);
    assert.equal(await model.validateFreshPlan(result, input), true);
    assertAccess(fixture, kind);
    assertNoOccupationWire(fixture.calls);
  }
});

test('D102 #615: persisted object refs survive prepare, cache, format repair and audit without leaking', async () => {
  const actor = npc('npc:persisted', { id: OCCUPATIONS.fisher,
    source: OCCUPATION_SOURCE });
  const fixture = harness();
  const model = authoritativeModel(fixture.model, () => ({ clock: TIME, npcs: [actor] }));
  assert.equal(typeof model.prepareRequest, 'function');
  assert.equal(typeof model.validateFreshPlan, 'function');
  const input = requestFor(actor);
  const prepared = await model.prepareRequest(input, {
    actor_facets: { occupation_ref: OCCUPATIONS.smith }
  });
  assert.ok(prepared.request.allowed_references.knowledge_refs.some(
    ({ entity_id }) => entity_id === CLAIMS.fisher));
  assert.equal(prepared.request.allowed_references.knowledge_refs.some(
    ({ entity_id }) => entity_id === CLAIMS.smith), false);
  const preparedContext = { prepared_request_context: prepared.context };
  const result = await model(prepared.request, preparedContext);
  assert.equal(await model.validateFreshPlan(result, prepared.request, preparedContext), true);
  const repaired = await model(prepared.request, { ...preparedContext, repair: {
    original_output: result,
    validation_errors: [{ category: 'structural', retryable: true,
      code: 'D102_FORMAT_REPAIR' }]
  } });
  assert.equal(await model.validateFreshPlan(repaired, prepared.request, preparedContext), true);
  assert.equal(fixture.queries.length, 1, 'prepare and format repair must use the same grounded slice');
  assertAccess(fixture, 'fisher');
  for (const role of ['npc_conversation_responder',
    'npc_conversation_responder_format_repair', 'npc_conversation_grounding_auditor']) {
    assert.ok(fixture.calls.some(({ role_id }) => role_id === role), `${role} must execute`);
  }
  for (const call of fixture.calls.filter(({ role_id }) => role_id.startsWith('npc_conversation_'))) {
    const payload = JSON.parse(call.messages[1].content);
    assert.ok((payload.request ?? payload).world_knowledge.facts.some(
      ({ claim_ref }) => claim_ref === CLAIMS.fisher));
  }
  assertNoOccupationWire(fixture.calls);
});

test('D102 #615: forged request, npc_safe_state and callContext cannot unlock fisher knowledge', async () => {
  for (const kind of ['smith', undefined]) {
    const actor = npc('npc:guarded', kind === undefined ? undefined : OCCUPATIONS[kind]);
    const another = npc('npc:other-fisher', OCCUPATIONS.fisher);
    const state = { clock: TIME, npcs: [another, actor],
      player_profile: { social_status: { occupation_id: OCCUPATIONS.fisher } } };
    const input = requestFor(actor);
    Object.assign(input, { occupation_ref: OCCUPATIONS.fisher,
      actor_facets: { occupation_ref: OCCUPATIONS.fisher },
      npc_safe_state: { occupation_ref: OCCUPATIONS.fisher },
      world_knowledge_authoritative: { actor_facets: { occupation_ref: OCCUPATIONS.fisher } } });
    input.npc.occupation_ref = OCCUPATIONS.fisher;
    input.npc.social_role.occupation_ref = OCCUPATIONS.fisher;
    const fixture = harness();
    const model = authoritativeModel((request, context) => fixture.grounder.ground(
      request, 'conversation', context), state);
    await model(input, { occupation_ref: OCCUPATIONS.fisher,
      actor_facets: { role_ref: ROLE, occupation_ref: OCCUPATIONS.fisher },
      world_knowledge_authoritative: { actor_facets: { occupation_ref: OCCUPATIONS.fisher } } });
    assertAccess(fixture, kind);
  }
});

test('D102 #615: unknown NPC never borrows another NPC or player occupation', async () => {
  const unknown = npc('npc:unknown');
  const fixture = harness();
  const model = authoritativeModel((request, context) => fixture.grounder.ground(
    request, 'conversation', context), {
    clock: TIME, npcs: [npc('npc:fisher', OCCUPATIONS.fisher)],
    player_profile: { social_status: { occupation_id: OCCUPATIONS.fisher } }
  });
  await model(requestFor(unknown), { actor_facets: { occupation_ref: OCCUPATIONS.fisher } });
  assertAccess(fixture, undefined);
});

function exchangeActors(state) {
  const first = state.npcs.find(({ participant_slot_ref }) => participant_slot_ref === 'eremey_fisher');
  const second = state.npcs.find(({ participant_slot_ref }) => participant_slot_ref === 'background_fisher_1');
  assert.ok(first && second, 'approved scenario must supply both actual NPCs');
  for (const [actor, kind] of [[first, 'smith'], [second, 'fisher']]) {
    actor.role_ref = { id: ROLE, source: 'approved_scenario_profile' };
    actor.occupation_ref = { id: OCCUPATIONS[kind], source: OCCUPATION_SOURCE };
  }
  // Deliberately reverse the collection: taking the first NPC is never valid.
  state.npcs = [second, first, ...state.npcs.filter((actor) => actor !== first && actor !== second)];
  return { first, second };
}

function exchangePlan(request, target = null) {
  const requiredTag = request.social_context?.npc_behavior?.required_interaction_tag;
  const introduction = request.social_context?.first_contact_introduction?.canonical_name;
  const plan = npcSpeechPlan(request, {
    utteranceText: introduction ? `Я ${introduction}. Обсудим мастерство?` : 'Обсудим мастерство?',
    dominantAct: requiredTag === 'withhold' ? 'evade' : 'answer',
    interactionTags: requiredTag ? [requiredTag] : []
  });
  if (target != null) {
    plan.primary_addressee_ref = target;
    plan.intended_addressee_refs = [target];
  }
  return plan;
}

test('D102 #615: production multi-NPC exchange grounds each exact responder', async () => {
  const state = phase3State();
  const { first, second } = exchangeActors(state);
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const fixture = harness({ responsePlan: exchangePlan });
  await runPhase3({ state, contracts, rawText: 'Расскажите про мастерство.',
    inputDigest: digest('6'), targetActorId: first.instance_id,
    playerPlanOptions: { primaryAddresseeRef: ref('npc', first.instance_id),
      intendedAddresseeRefs: [ref('npc', first.instance_id), ref('npc', second.instance_id)] },
    npcSemanticModel: fixture.model });
  const responses = fixture.calls.filter(({ role_id }) => role_id === 'npc_conversation_responder');
  assert.equal(responses.length, 2, 'both selected responders must execute');
  for (const [index, call] of responses.entries()) {
    const input = JSON.parse(call.messages[1].content);
    const kind = input.npc_ref.entity_id === first.instance_id ? 'smith' : 'fisher';
    assert.ok([first.instance_id, second.instance_id].includes(input.npc_ref.entity_id));
    assertAccess(fixture, kind, index);
  }
  assertNoOccupationWire(fixture.calls);
});

test('D102 #615: production NPC-initiated exchange grounds initiator and subsequent NPC separately', async () => {
  const state = phase3State();
  const { first, second } = exchangeActors(state);
  // Unlike runPhase3's scenario adapter, this handoff takes persisted actors
  // directly. Each participant therefore needs its exact entity ref.
  first.ref = ref('npc', first.instance_id);
  second.ref = ref('npc', second.instance_id);
  const fixture = harness({ responsePlan: (request) => {
    const target = request.npc_ref.entity_id === first.instance_id ? second : first;
    const plan = exchangePlan(request, ref('npc', target.instance_id));
    if (request.npc_ref.entity_id === first.instance_id) {
      plan.speech.response_expectation = { kind: 'answer', target_refs: [ref('npc', second.instance_id)] };
    }
    return plan;
  } });
  const result = await runLowerDvinaTraceNpcConversationExchange({
    state, npc: first, operation: { op: 'request_conversation',
      actor_ref: first.instance_id, target_actor_refs: [second.instance_id],
      conversation_goal: 'обсудить мастерство' },
    actor_step_request: { request_id: 'npc-initiated:615' },
    conversation_bindings: { fallback_policy: 'forbidden',
      legacy_bounded_production_path: 'forbidden', max_contributions_per_exchange: 2 },
    conversation_activity: { profile_id: 'approved-talk', duration_minutes: 5 },
    revalidateStateVersion: async () => state.party_state.state_version,
    temporalAdvanceOwner: { advance({ request }) {
      return { result: { clock_after: request.inclusive_limit_timestamp,
        trace: { processed_boundary_ids: [], stopped_after_current_batch: false } },
      state_projection: { ...request.relevant_state_projection,
        conversation_state: request.relevant_state_projection.conversation_state } };
    } },
    npcSemanticModel: fixture.model
  });
  const responses = fixture.calls.filter(({ role_id }) => role_id === 'npc_conversation_responder');
  assert.deepEqual(responses.map((call) => JSON.parse(call.messages[1].content).npc_ref.entity_id),
    [first.instance_id, second.instance_id]);
  assertAccess(fixture, 'smith', 0);
  assertAccess(fixture, 'fisher', 1);
  assert.equal(result.exchange.stop_reason, 'exchange_limit');
  assertNoOccupationWire(fixture.calls);
});
