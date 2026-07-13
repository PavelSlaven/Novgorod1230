import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE12_INPUT_SCHEMA,
  STAGE12_OUTPUT_SCHEMA,
  buildStage12PlayerCharacterAuditInput,
  validateStage12PlayerCharacterAuditInput,
  validateStage12PlayerCharacterAuditOutput
} from './stages/stage12-player-character-audit.js';
import { shapePlayerCharacterGameProfile } from './stages/stage11-player-character.js';
import { runNewGameG5Stages13To14 } from './stages/g5-stages.js';

function contextWith(outputs = {}, env = {}) {
  return {
    requestId: 'req-12-test',
    env,
    requireStageOutput(id, label = String(id)) {
      const value = outputs[id] ?? outputs[String(id)];
      if (!value) throw new Error(`missing ${label}`);
      return value;
    },
    getStageOutput(id) {
      return outputs[id] ?? outputs[String(id)] ?? null;
    }
  };
}

function baseOutputs(overrides = {}) {
  const normalized = { version: 1, schema: 'new_game_normalized_request' };
  const frame = { version: 1, schema: 'historical_frame', region: { region_id: 'novgorod' }, year: { value: 1230 }, calendar: { season: 'winter' }, clock: { time_of_day: 'day' } };
  const regional = {
    version: 1,
    schema: 'regional_context_package',
    social_context: { social_roles: [{ social_role_id: 'role_free_peasant' }] },
    occupation_context: { occupations: [{ occupation_id: 'occ_farmer' }] },
    item_context: {},
    property_context: {}
  };
  const selected = { version: 1, schema: 'selected_start_node', selected_candidate_id: 'cand_1', selected_node_id: 'g4_1', selected_place_template_id: 'template_1' };
  const startAudit = { version: 1, schema: 'start_place_audit', pass: true };
  const npcSet = { version: 1, schema: 'npc_candidate_set', npc_candidates: [{ npc_candidate_id: 'npc_1' }] };
  const itemSet = { version: 1, schema: 'item_profile_candidate_set', item_profile_candidates: [{ item_profile_candidate_id: 'item_knife' }], property_rule_candidates: [{ property_rule_candidate_id: 'prop_personal' }] };
  const dossier = {
    version: 1,
    schema: 'player_character_dossier',
    request_id: 'req-12-test',
    generation_status: 'generated',
    identity: { character_id: 'pc_1', name: 'Test' },
    social_status: { social_role_id: 'role_free_peasant', occupation_id: 'occ_farmer' },
    origin: { home_region_id: 'novgorod' },
    body: { health: 80, satiety: 70, vigor: 60 },
    attributes: { strength: 10, dexterity: 10, endurance: 10, intellect: 10, perception: 10, will: 10 },
    skills: { farming: { bonus: 2, basis: 'lifelong rural work' } },
    knowledge: { known_region_id: 'novgorod' },
    memory: { recent: [] },
    goals: { immediate_need: 'find shelter', consequence_of_inaction: 'cold exposure' },
    inventory: { carried_items: [{ item_profile_candidate_id: 'item_knife', owner: 'self', holder: 'self', access: 'carried', weight: 0.2, condition: 'worn', risk: 'ordinary' }] },
    property_and_access: { property_rule_candidate_id: 'prop_personal' },
    relations: [{ relation_mode: 'candidate_npc_relation', npc_candidate_id: 'npc_1' }],
    start_place_connection: { selected_candidate_id: 'cand_1', selected_node_id: 'g4_1', selected_place_template_id: 'template_1', reason_here: 'passing through' },
    constraints_and_risks: {},
    selected_candidate_refs: { social_role_id: 'role_free_peasant', occupation_id: 'occ_farmer' },
    source_trace: ['stage:4', 'candidate:item_profile:item_knife'],
    audit_self_check: { pass: true, evidence: ['self-check'] }
  };
  return {
    2: normalized,
    3: frame,
    4: regional,
    7: npcSet,
    8: itemSet,
    9: selected,
    10: startAudit,
    11: dossier,
    ...overrides
  };
}

function validInput(overrides = {}) {
  return buildStage12PlayerCharacterAuditInput(contextWith(baseOutputs(overrides)));
}

function validAudit(overrides = {}) {
  return {
    version: 1,
    schema: STAGE12_OUTPUT_SCHEMA,
    request_id: 'req-12-test',
    pass: true,
    checks: {
      schema_and_structure: { pass: true },
      historical_compatibility: { pass: true },
      region_compatibility: { pass: true },
      start_place_compatibility: { pass: true },
      social_status: { pass: true },
      occupation: { pass: true },
      origin: { pass: true },
      body_state: { pass: true },
      attributes: { pass: true },
      skills: { pass: true },
      inventory: { pass: true },
      property_and_access: { pass: true },
      knowledge: { pass: true },
      relations: { pass: true },
      goals: { pass: true },
      source_trace: { pass: true },
      downstream_entity_leak_check: { pass: true }
    },
    concerns: [],
    evidence: ['all checks passed'],
    repair_route: null,
    commit_permission: {
      can_shape_game_profile: true,
      can_continue_to_g5_materialization: true,
      can_write_player_character_after_commit_gate: true
    },
    ...overrides
  };
}

function codes(concerns) {
  return new Set(concerns.map((item) => item.code));
}

test('stage12 builds exact player_character_audit_input and includes code_precheck', () => {
  const input = validInput();
  assert.equal(input.version, 1);
  assert.equal(input.schema, STAGE12_INPUT_SCHEMA);
  assert.equal(input.code_precheck.schema, 'player_character_code_precheck');
  assert.equal(input.code_precheck.pass, true);
  assert.deepEqual(Object.keys(input), [
    'version',
    'schema',
    'request_id',
    'normalized_request',
    'historical_frame',
    'regional_context_package',
    'selected_start_node',
    'start_place_audit',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'player_character_dossier',
    'audit_policy',
    'code_precheck'
  ]);
});

test('stage12 rejects missing player_character_dossier', () => {
  const input = { ...validInput(), player_character_dossier: undefined };
  input.code_precheck = { version: 1, schema: 'player_character_code_precheck', pass: false, concerns: [], checks: {}, evidence: [] };
  assert.ok(codes(validateStage12PlayerCharacterAuditInput(input)).has('PLAYER_AUDIT_MISSING_REQUIRED_FIELD'));
});

test('stage12 rejects dossier schema mismatch', () => {
  const input = validInput({ 11: { ...baseOutputs()[11], schema: 'player_character_game_profile' } });
  assert.ok(codes(validateStage12PlayerCharacterAuditInput(input)).has('PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH'));
});

test('stage12 rejects start_place_audit.pass=false', () => {
  const input = validInput({ 10: { version: 1, schema: 'start_place_audit', pass: false } });
  assert.ok(codes(validateStage12PlayerCharacterAuditInput(input)).has('PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED'));
});

test('stage12 rejects empty evidence on pass=true', () => {
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(validAudit({ evidence: [] }), validInput())).has('PLAYER_AUDIT_EVIDENCE_MISSING'));
});

test('stage12 rejects pass=false without concerns', () => {
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(validAudit({ pass: false, concerns: [], evidence: ['x'], repair_route: { return_to_stage: 'player_character_semantic_repair' }, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } }), validInput())).has('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID'));
});

test('stage12 rejects pass=false without repair_route', () => {
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(validAudit({ pass: false, concerns: [{ code: 'PLAYER_AUDIT_REGION_MISMATCH', severity: 'hard_block', message: 'x' }], evidence: ['x'], repair_route: null, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } }), validInput())).has('PLAYER_AUDIT_REPAIR_ROUTE_INVALID'));
});

test('stage12 rejects commit_permission mismatch', () => {
  const audit = validAudit({ commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: true, can_write_player_character_after_commit_gate: true } });
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(audit, validInput())).has('PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH'));
});

test('stage12 rejects audit containing modified character', () => {
  const audit = validAudit({ modified_character: { social_status: {} } });
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(audit, validInput())).has('PLAYER_AUDIT_MODIFIED_CHARACTER'));
});

test('stage12 rejects visible_scene/intro_prose/G5/new NPC in audit', () => {
  const concerns = validateStage12PlayerCharacterAuditOutput(validAudit({ visible_scene: {}, intro_prose: 'x', g5_scene_graph: {}, new_npcs: [] }), validInput());
  const c = codes(concerns);
  assert.ok(c.has('PLAYER_AUDIT_CREATED_VISIBLE_SCENE'));
  assert.ok(c.has('PLAYER_AUDIT_CREATED_INTRO_PROSE'));
  assert.ok(c.has('PLAYER_AUDIT_CREATED_G5'));
  assert.ok(c.has('PLAYER_AUDIT_CREATED_NPC'));
});

test('stage12 validates concern code enum', () => {
  const audit = validAudit({ pass: false, concerns: [{ code: 'BAD_CODE', severity: 'hard_block', message: 'bad' }], evidence: ['x'], repair_route: { return_to_stage: 'player_character_semantic_repair' }, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } });
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(audit, validInput())).has('PLAYER_AUDIT_CONCERN_ENUM_INVALID'));
});

test('stage12 validates severity enum', () => {
  const audit = validAudit({ pass: false, concerns: [{ code: 'PLAYER_AUDIT_REGION_MISMATCH', severity: 'bad', message: 'bad' }], evidence: ['x'], repair_route: { return_to_stage: 'player_character_semantic_repair' }, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } });
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(audit, validInput())).has('PLAYER_AUDIT_SEVERITY_ENUM_INVALID'));
});

test('stage12 validates repair_route enum', () => {
  const audit = validAudit({ pass: false, concerns: [{ code: 'PLAYER_AUDIT_REGION_MISMATCH', severity: 'hard_block', message: 'bad' }], evidence: ['x'], repair_route: { return_to_stage: 'bad_route' }, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } });
  assert.ok(codes(validateStage12PlayerCharacterAuditOutput(audit, validInput())).has('PLAYER_AUDIT_REPAIR_ROUTE_INVALID'));
});

test('stage12 fail blocks game profile shaping', () => {
  assert.throws(() => shapePlayerCharacterGameProfile(baseOutputs()[11], validAudit({ pass: false, concerns: [{ code: 'PLAYER_AUDIT_REGION_MISMATCH', severity: 'hard_block', message: 'bad' }], evidence: ['x'], repair_route: { return_to_stage: 'player_character_semantic_repair' }, commit_permission: { can_shape_game_profile: false, can_continue_to_g5_materialization: false, can_write_player_character_after_commit_gate: false } })));
});

test('stage12 pass allows game profile shaping', () => {
  const profile = shapePlayerCharacterGameProfile(baseOutputs()[11], validAudit());
  assert.equal(profile.schema, 'player_character_game_profile');
});

test('stage13 receives only shaped profile after Stage 12 pass', async () => {
  const context = { requestId: 'req', env: {}, setGateResult() {}, setLifecycleState() {}, setStageOutput() {}, freezeArtifact() {}, note() {} };
  await assert.rejects(() => runNewGameG5Stages13To14(context, { playerCharacter: baseOutputs()[11], playerCharacterAudit: validAudit() }, { materialize: async () => ({ schema: 'g5_scene_graph_draft' }), audit: async () => ({ schema: 'g5_scene_audit', pass: true, commit_allowed: true }) }), /player_character_game_profile/);
});
