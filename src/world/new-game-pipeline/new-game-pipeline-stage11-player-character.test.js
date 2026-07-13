import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage11PlayerCharacterInput,
  shapePlayerCharacterGameProfile,
  STAGE11_INPUT_SCHEMA,
  STAGE11_OUTPUT_SCHEMA,
  STAGE11_GAME_PROFILE_SCHEMA,
  validateStage11PlayerCharacterInput,
  validateStage11PlayerCharacterOutput
} from '../src/new-game-pipeline/stages/stage11-player-character.js';

function fakeContext(overrides = {}) {
  const outputs = new Map(Object.entries({
    2: { version: 1, schema: 'new_game_normalized_request', player_intent: { raw: 'test' } },
    3: { version: 1, schema: 'historical_frame', region: { region_id: 'novgorod_land' }, year: { value: 1230 }, calendar: { season: 'winter' }, clock: { day: 1, hour: 8, minute: 0, time_of_day: 'morning', light_profile: 'daylight' } },
    4: { version: 1, schema: 'regional_context_package', social_context: { regional_social_roles: [{ id: 'role_free_commoner' }] }, occupation_context: { region_occupations: [{ id: 'occ_hunter' }] } },
    7: { version: 1, schema: 'npc_candidate_set', npc_candidates: [{ id: 'npc_candidate_uncle' }] },
    8: { version: 1, schema: 'item_profile_candidate_set', item_profile_candidates: [{ id: 'item_profile_knife' }], container_profile_candidates: [{ id: 'container_profile_bag' }], property_rule_candidates: [{ id: 'property_rule_own_small_tool' }] },
    9: { version: 1, schema: 'selected_start_node', selected_candidate_id: 'start_node_001' },
    10: { version: 1, schema: 'start_place_audit', pass: true }
  }).map(([key, value]) => [Number(key), value]));
  for (const [key, value] of Object.entries(overrides.outputs ?? {})) outputs.set(Number(key), value);
  return {
    requestId: overrides.requestId ?? 'req_stage11_test',
    requireStageOutput(stageId) {
      const output = outputs.get(Number(stageId));
      if (!output) throw new Error(`missing stage ${stageId}`);
      return output;
    },
    getStageOutput(stageId) {
      return outputs.get(Number(stageId)) ?? null;
    }
  };
}

function validInput() {
  return buildStage11PlayerCharacterInput(fakeContext());
}

function validDossier(patch = {}) {
  return {
    version: 1,
    schema: STAGE11_OUTPUT_SCHEMA,
    request_id: 'req_stage11_test',
    generation_status: 'generated',
    identity: { character_id: 'pc_001', display_name: 'Test' },
    social_status: { social_role_id: 'role_free_commoner', occupation_id: 'occ_hunter' },
    origin: { biographical_basis: 'ordinary regional hunter' },
    body: { health: 90, satiety: 80, vigor: 70, active_states: [{ name: 'cold', cause: 'winter start' }] },
    attributes: { strength: 14, dexterity: 13, endurance: 12, reason: 10, attention: 9, influence: 8 },
    skills: { ranged_combat: { bonus: 2, basis: 'hunting' }, survival: { bonus: 3, basis: 'regular forest life' } },
    knowledge: { known_region: 'novgorod_land' },
    memory: { known_facts: [] },
    goals: { immediate_need: 'find shelter', consequence_of_inaction: 'cold worsens' },
    inventory: {
      total_weight_kg: 0.4,
      load_category: 'light',
      occupied_hands: 0,
      items: [{
        item_profile_candidate_id: 'item_profile_knife',
        container_profile_candidate_id: 'container_profile_bag',
        property_rule_candidate_id: 'property_rule_own_small_tool',
        name: 'small knife',
        weight_kg: 0.4,
        condition: 'worn',
        carry_location: 'belt',
        access: 'quick',
        owner: 'pc_001',
        holder: 'pc_001',
        use: 'tool',
        risk: 'low'
      }]
    },
    property_and_access: { property_not_carried: [] },
    relations: { people: [{ relation_mode: 'candidate_npc_relation', npc_candidate_id: 'npc_candidate_uncle' }] },
    start_place_connection: { selected_candidate_id: 'start_node_001', reason: 'arrived with kin', why_now: 'morning departure' },
    constraints_and_risks: { social_risks: [] },
    selected_candidate_refs: {
      social_role_id: 'role_free_commoner',
      occupation_id: 'occ_hunter',
      npc_candidate_ids_used_for_relations: ['npc_candidate_uncle'],
      item_profile_candidate_ids_used: ['item_profile_knife'],
      container_profile_candidate_ids_used: ['container_profile_bag'],
      property_rule_candidate_ids_used: ['property_rule_own_small_tool']
    },
    source_trace: ['stage:3', 'candidate:social_role:role_free_commoner', 'candidate:item_profile:item_profile_knife'],
    audit_self_check: { pass: true, concerns: [], evidence: ['candidate refs checked'] },
    ...patch
  };
}

function codes(concerns) {
  return new Set(concerns.map((item) => item.code));
}

test('Stage 11 builds exact isolated player_character_generator_input with npc and item candidates', () => {
  const input = validInput();
  assert.equal(input.schema, STAGE11_INPUT_SCHEMA);
  assert.equal(input.version, 1);
  assert.ok(input.npc_candidate_set);
  assert.ok(input.item_profile_candidate_set);
  assert.equal(input.start_place_audit.pass, true);
});

test('Stage 11 input rejects missing start_place_audit.pass=true', () => {
  const input = validInput();
  input.start_place_audit = { version: 1, schema: 'start_place_audit', pass: false };
  assert.ok(codes(validateStage11PlayerCharacterInput(input)).has('PLAYER_CHARACTER_START_PLACE_AUDIT_NOT_PASSED'));
});

test('Stage 11 output accepts player_character_dossier, not game profile', () => {
  assert.deepEqual(validateStage11PlayerCharacterOutput(validDossier(), validInput()), []);
  assert.ok(codes(validateStage11PlayerCharacterOutput(validDossier({ schema: STAGE11_GAME_PROFILE_SCHEMA }), validInput())).has('PLAYER_CHARACTER_SCHEMA_MISMATCH'));
});

test('Stage 11 rejects social role and occupation outside candidate context', () => {
  const invalid = validDossier({
    selected_candidate_refs: { social_role_id: 'role_foreign_king', occupation_id: 'occ_space_pilot' },
    social_status: { social_role_id: 'role_foreign_king', occupation_id: 'occ_space_pilot' }
  });
  const found = codes(validateStage11PlayerCharacterOutput(invalid, validInput()));
  assert.ok(found.has('PLAYER_CHARACTER_SOCIAL_ROLE_NOT_ALLOWED'));
  assert.ok(found.has('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED'));
});

test('Stage 11 allows null occupation only with explicit reason', () => {
  const missingReason = validDossier({ selected_candidate_refs: { social_role_id: 'role_free_commoner', occupation_id: null }, social_status: { social_role_id: 'role_free_commoner', occupation_id: null } });
  assert.ok(codes(validateStage11PlayerCharacterOutput(missingReason, validInput())).has('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED'));
  const withReason = validDossier({ selected_candidate_refs: { social_role_id: 'role_free_commoner', occupation_id: null, occupation_null_reason: 'no fixed occupation yet' }, social_status: { social_role_id: 'role_free_commoner', occupation_id: null } });
  assert.ok(!codes(validateStage11PlayerCharacterOutput(withReason, validInput())).has('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED'));
});

test('Stage 11 allows empty inventory but rejects item outside item_profile_candidate_set', () => {
  const emptyInventory = validDossier({ inventory: { total_weight_kg: 0, load_category: 'light', occupied_hands: 0, items: [] } });
  assert.ok(!codes(validateStage11PlayerCharacterOutput(emptyInventory, validInput())).has('PLAYER_CHARACTER_INVENTORY_ITEM_NOT_ALLOWED'));
  const invalidItem = validDossier({ inventory: { total_weight_kg: 1, load_category: 'light', occupied_hands: 0, items: [{ ...validDossier().inventory.items[0], item_profile_candidate_id: 'item_profile_sword' }] } });
  assert.ok(codes(validateStage11PlayerCharacterOutput(invalidItem, validInput())).has('PLAYER_CHARACTER_INVENTORY_ITEM_NOT_ALLOWED'));
});

test('Stage 11 rejects visible_scene, intro prose, and G5 refs', () => {
  const found = codes(validateStage11PlayerCharacterOutput(validDossier({ visible_scene: {}, intro_prose: 'text', g5_anchor_id: 'a1' }), validInput()));
  assert.ok(found.has('PLAYER_CHARACTER_CREATED_VISIBLE_SCENE'));
  assert.ok(found.has('PLAYER_CHARACTER_CREATED_INTRO_PROSE'));
  assert.ok(found.has('PLAYER_CHARACTER_CREATED_G5'));
});

test('Stage 11 rejects materialized NPC outside npc_candidate_set and allows explicit abstract relation', () => {
  const invalid = validDossier({ relations: { people: [{ relation_mode: 'candidate_npc_relation', npc_candidate_id: 'npc_unknown' }] } });
  assert.ok(codes(validateStage11PlayerCharacterOutput(invalid, validInput())).has('PLAYER_CHARACTER_CREATED_NPC_OUTSIDE_CANDIDATES'));
  const abstract = validDossier({ relations: { people: [{ relation_mode: 'abstract_background_relation', person_label: 'mother', is_materialized_npc: false, not_in_current_scene: true }] } });
  assert.ok(!codes(validateStage11PlayerCharacterOutput(abstract, validInput())).has('PLAYER_CHARACTER_CREATED_NPC_OUTSIDE_CANDIDATES'));
});

test('Stage 11 rejects empty source_trace and empty audit evidence', () => {
  const found = codes(validateStage11PlayerCharacterOutput(validDossier({ source_trace: [], audit_self_check: { pass: true, concerns: [], evidence: [] } }), validInput()));
  assert.ok(found.has('PLAYER_CHARACTER_SOURCE_MISSING'));
  assert.ok(found.has('PLAYER_CHARACTER_EMPTY_AUDIT_EVIDENCE'));
});

test('Stage 11 rejects invalid states, attributes, and skill bonuses', () => {
  const found = codes(validateStage11PlayerCharacterOutput(validDossier({
    body: { health: 101, satiety: 80, vigor: 70, active_states: [{ name: 'pain' }] },
    attributes: { strength: 18, dexterity: 15, endurance: 14, reason: 14, attention: 13, influence: 12 },
    skills: { melee: { bonus: 5 }, bow: { bonus: 4, basis: 'hunting' }, sword: { bonus: 4, basis: 'war' } }
  }), validInput()));
  assert.ok(found.has('PLAYER_CHARACTER_STATE_OUT_OF_RANGE'));
  assert.ok(found.has('PLAYER_CHARACTER_STATE_WITHOUT_CAUSE'));
  assert.ok(found.has('PLAYER_CHARACTER_ATTRIBUTE_BALANCE_VIOLATION'));
  assert.ok(found.has('PLAYER_CHARACTER_SKILL_OUT_OF_RANGE'));
  assert.ok(found.has('PLAYER_CHARACTER_TOO_MANY_HIGH_SKILLS'));
});

test('Stage 11 shaping creates code-only game profile only after audit pass', () => {
  const dossier = validDossier();
  assert.throws(() => shapePlayerCharacterGameProfile(dossier, { pass: false }));
  const profile = shapePlayerCharacterGameProfile(dossier, { pass: true, evidence: ['audit'] });
  assert.equal(profile.schema, STAGE11_GAME_PROFILE_SCHEMA);
  assert.equal(profile.shaping_policy.code_only, true);
  assert.equal(profile.shaping_policy.no_new_semantic_facts, true);
});
