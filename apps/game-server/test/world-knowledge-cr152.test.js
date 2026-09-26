import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldKnowledgeError } from '@rus/world-knowledge';
import { omitWorldKnowledgeContextText } from '@rus/turn';
import { semanticInputOf } from '../src/runtime/world-knowledge-request-context.js';
import { groundingSufficiencyOf } from '../src/runtime/world-knowledge-sufficiency.js';

test('npc_action_decision semantic_input uses perceived_changes text', () => {
  const text = semanticInputOf({
    schema: 'npc_action_decision_request_v1',
    decision_reasons: { perceived_changes: ['Слышен треск сучьев.', 'Запах дыма.'] },
    perception: { visible_scene: ['Лесная опушка.'], perceived_changes: [],
      heard: [], felt: [] }
  });
  assert.match(text, /Слышен треск сучьев/);
  assert.match(text, /Запах дыма/);
  assert.match(text, /Лесная опушка/);
  assert.doesNotMatch(text, /npc_action_decision_request_v1/);
  assert.doesNotMatch(text, /[{}]/);
});

test('npc_conversation semantic_input uses history utterance text', () => {
  const text = semanticInputOf({
    schema: 'npc_conversation_response_request_v1',
    decision_reasons: { perceived_changes: ['Игрок обратился к NPC.'] },
    public_conversation_history: [
      { utterance_text: 'Где дорога на Торжок?' }
    ]
  });
  assert.match(text, /Игрок обратился/);
  assert.match(text, /Торжок/);
  assert.doesNotMatch(text, /[{}]/);
});

test('turn step remaining_intent is plain text semantic_input', () => {
  const text = semanticInputOf({
    remaining_intent: 'Громко зову Онисима.',
    player_safe_state: {}
  });
  assert.equal(text, 'Громко зову Онисима.');
});

test('O1 semantic_input is assembled text without JSON', () => {
  const text = semanticInputOf({
    schema: 'ordinary_materialization_request_v1',
    mode: 'discover',
    candidate_query: { candidate_hint: 'мокрый канат' },
    authority_envelope: { candidate: {
      semantic_type: 'rope', functional_bucket: 'cordage',
      admission_class: 'common_mundane', availability_class: 'scene',
      coverage_kind: 'generic'
    } },
    policy_refs: { allowed_admission_classes: ['common_mundane'] },
    ordinary_state: { density_band: 'sparse' }
  });
  assert.match(text, /мокрый канат/);
  assert.match(text, /rope/);
  assert.doesNotMatch(text, /[{}]/);
  assert.doesNotMatch(text, /"/);
});

test('S1 semantic_input uses semantic_context and approved_envelope', () => {
  const text = semanticInputOf({
    schema: 'rus.s1_spatial_semantic_model_request.v1',
    semantic_context: {
      allowed_kind: 'ordinary_structure', period: '1230, Rus',
      region: 'Lower Dvina', place_type: 'shore', environment: 'wet sand',
      material_culture: 'wood and stone', ordinary_boundary: 'ordinary only'
    },
    approved_envelope: {
      kind: 'ordinary_structure', structural_variant: 'open_one_space'
    }
  });
  assert.match(text, /Lower Dvina/);
  assert.match(text, /wet sand/);
  assert.match(text, /ordinary_structure/);
  assert.match(text, /open_one_space/);
  assert.doesNotMatch(text, /[{}]/);
});

test('N1 semantic_input uses production observable_cues nested leaves', () => {
  const text = semanticInputOf({
    schema: 'npc_ordinary_semantic_remainder_request_v1',
    observable_context: {
      display_label: 'стоящий мужчина',
      scene_details: ['У воды сохнут сети.'],
      observable_cues: {
        identity: {
          display_name: 'Онисим',
          sex_category: 'male',
          age_category: 'adult',
          appearance: { build: 'stocky', hair: 'тёмные волосы' }
        },
        equipment: [
          { display_label: 'сеть', visual_profile_snapshot: { color: 'серый' } }
        ],
        outward_presentation: { posture: 'стоит у лодки' },
        ordinary_remainder: { ordinary_descriptor: 'рыбак у берега' }
      }
    }
  });
  assert.match(text, /стоящий мужчина/);
  assert.match(text, /сохнут сети/);
  assert.match(text, /Онисим/);
  assert.match(text, /male/);
  assert.match(text, /stocky/);
  assert.match(text, /тёмные волосы/);
  assert.match(text, /сеть/);
  assert.match(text, /стоит у лодки/);
  assert.match(text, /рыбак у берега/);
  assert.doesNotMatch(text, /[{}]/);
});

test('unknown schema without text fields throws typed semantic_input error', () => {
  assert.throws(() => semanticInputOf({ schema: 'unknown_request_v1', id: 1 }),
    (error) => error instanceof WorldKnowledgeError
      && error.code === 'WORLD_KNOWLEDGE_SEMANTIC_INPUT_UNAVAILABLE');
});

test('sufficiency marks partial when a search hint misses admitted claims', () => {
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [false], verdict: 'supported'
  }), 'PARTIAL_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true], verdict: 'supported'
  }), 'SUFFICIENT_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [false], verdict: 'unresolved'
  }), 'UNRESOLVED_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    coverage: [{ domain: 'future_tech', status: 'out_of_scope' }],
    search_hint_hits: [], verdict: 'unresolved'
  }), 'OUT_OF_SCOPE');
});

test('default-query slices never become SUFFICIENT_KNOWLEDGE', () => {
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [], disputes: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true], verdict: 'supported'
  }, { fromDefaultQuery: true }), 'PARTIAL_KNOWLEDGE');
});

test('disputes alone count as admitted content for sufficiency', () => {
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    disputes: [{ conflict_group_ref: 'g1', claims: [{ claim_ref: 'c1' }] }],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true], verdict: 'disputed'
  }), 'SUFFICIENT_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    disputes: [{ conflict_group_ref: 'g1', claims: [{ claim_ref: 'c1' }] }],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true], verdict: 'disputed'
  }, { fromDefaultQuery: true }), 'PARTIAL_KNOWLEDGE');
});

test('wire helper always strips context_text for model consumers', () => {
  const stripped = omitWorldKnowledgeContextText({
    request_id: 'r1',
    world_knowledge: {
      schema: 'world_knowledge_slice_v1',
      pack_ref: 'wk-pack:test', pack_revision: 'revision:test',
      coverage: [], facts: [{ claim_ref: 'c1' }], hard_constraints: [],
      disputes: [], gaps: [], context_text: 'duplicate'
    }
  });
  assert.equal(Object.hasOwn(stripped.world_knowledge, 'context_text'), false);
  assert.equal(stripped.world_knowledge.facts.length, 1);
  const emptyFacts = omitWorldKnowledgeContextText({
    request_id: 'r2',
    world_knowledge: {
      schema: 'world_knowledge_slice_v1',
      pack_ref: 'wk-pack:test', pack_revision: 'revision:test',
      coverage: [], facts: [], hard_constraints: [], disputes: [], gaps: [],
      context_text: 'only prose'
    }
  });
  assert.equal(Object.hasOwn(emptyFacts.world_knowledge, 'context_text'), false);
});

test('NPC autonomous user wire omits context_text via shared helper', async () => {
  const { createLowerDvinaTraceNpcAutonomousModel } = await import(
    '../src/runtime/lower-dvina-trace-phase-2-llm.js');
  const slice = {
    schema: 'world_knowledge_slice_v1',
    pack_ref: 'wk-pack:test', pack_revision: 'revision:test',
    purpose: 'npc_decision', coverage: [], hard_constraints: [],
    facts: [{ claim_ref: 'claim:w', runtime_text: 'факт' }],
    disputes: [], gaps: [], context_text: 'FACT claim:w: факт',
    sufficiency: 'PARTIAL_KNOWLEDGE'
  };
  let autonomousUser;
  await createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run({ messages }) {
      autonomousUser = JSON.parse(messages[1].content);
      return { output: { resolution: 'direct' } };
    } },
    worldKnowledgeGrounder: {
      async ground(request) {
        return { ...request, world_knowledge: structuredClone(slice) };
      }
    }
  })({
    schema: 'npc_action_decision_request_v1', request_id: 'decision-1',
    decision_reasons: { perceived_changes: ['шум'] },
    decision_scope: { allowed_attribute_refs: [], allowed_skill_refs: [],
      operation_contract: {} }
  });
  assert.equal(Object.hasOwn(autonomousUser.world_knowledge, 'context_text'),
    false);
  assert.equal(autonomousUser.world_knowledge.facts[0].claim_ref, 'claim:w');
});
