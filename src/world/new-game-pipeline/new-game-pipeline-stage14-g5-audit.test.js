import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STAGE14_INPUT_SCHEMA,
  STAGE14_OUTPUT_SCHEMA,
  STAGE14_REQUIRED_CHECKS,
  buildStage14G5AuditInput,
  buildStage14G5SceneCodePrecheck,
  runStage14G5AuditBlock,
  validateStage14G5AuditInput,
  validateStage14G5SceneAuditOutput
} from './stages/stage14-g5-audit.js';

function createContext(overrides = {}) {
  const outputs = new Map(Object.entries(overrides.outputs ?? {}).map(([k, v]) => [Number(k), v]));
  return {
    requestId: 'req-stage14',
    getStageOutput(id) { return outputs.get(id); },
    requireStageOutput(id, label = 'stage output') {
      if (!outputs.has(id)) throw new Error(`Missing ${label}`);
      return outputs.get(id);
    }
  };
}

function selectedStartNode() {
  return {
    version: 1,
    schema: 'selected_start_node',
    selected: {
      selected_candidate_id: 'cand-1',
      selected_node_id: 'g4-yard',
      selected_scale_level: 'G4',
      selected_place_template_id: 'yard-template'
    },
    selected_node_chain: {
      g1_node_id: 'g1',
      g2_node_id: 'g2',
      g3_node_id: 'g3',
      g4_node_id: 'g4-yard'
    }
  };
}

function allowedTemplates() {
  return {
    version: 1,
    schema: 'allowed_g5_template_set',
    selected_g4_type_id: 'yard',
    allowed_g5_templates: [
      { g5_template_id: 'tpl-door', g4_type_id: 'yard', status: 'active', allowed_anchor_types: ['door', 'bench', 'well'] }
    ]
  };
}

function draft(overrides = {}) {
  return {
    version: 1,
    schema: 'g5_scene_graph_draft',
    request_id: 'req-stage14',
    materialization_status: 'materialized',
    parent_location: {
      g1_node_id: 'g1',
      g2_node_id: 'g2',
      g3_node_id: 'g3',
      g4_node_id: 'g4-yard',
      place_template_id: 'yard-template',
      g4_type_id: 'yard'
    },
    g5_minilocations: [
      { minilocation_id: 'mini-yard', parent_g4_node_id: 'g4-yard', minilocation_type: 'yard', light_state: 'daylight', movement_space: 'open', visibility_notes: 'clear', access_notes: 'open' }
    ],
    g5_anchors: [
      { anchor_id: 'a-door', minilocation_id: 'mini-yard', parent_g4_node_id: 'g4-yard', g5_template_id: 'tpl-door', anchor_type: 'door', visible_now: true, visibility: { state: 'visible' }, access: { state: 'open' } },
      { anchor_id: 'a-bench', minilocation_id: 'mini-yard', parent_g4_node_id: 'g4-yard', g5_template_id: 'tpl-door', anchor_type: 'bench', visible_now: true, visibility: { state: 'visible' }, access: { state: 'open' } },
      { anchor_id: 'a-well', minilocation_id: 'mini-yard', parent_g4_node_id: 'g4-yard', g5_template_id: 'tpl-door', anchor_type: 'well', visible_now: true, visibility: { state: 'visible' }, access: { state: 'open' } }
    ],
    g5_edges: [
      { edge_id: 'e1', from_anchor_id: 'a-door', to_anchor_id: 'a-bench' },
      { edge_id: 'e2', from_anchor_id: 'a-bench', to_anchor_id: 'a-well' }
    ],
    player_start_position: { location_id: 'g4-yard', minilocation_id: 'mini-yard', anchor_id: 'a-door' },
    visibility_model: { model: 'visibility', visible_anchor_ids: ['a-door', 'a-bench', 'a-well'] },
    access_model: { model: 'access', accessible_anchor_ids: ['a-door', 'a-bench', 'a-well'] },
    closed_zones: [],
    risk_model: { movement: 'low', witnesses: 'possible', stealth: 'normal' },
    npc_materialization_slots: [],
    item_materialization_slots: [],
    source_trace: [{ source: 'stage13', id: 'tpl-door' }],
    audit_self_check: { pass: true, evidence: [{ kind: 'self_check' }] },
    ...overrides
  };
}

function stageInput(overrides = {}) {
  const input = {
    version: 1,
    schema: STAGE14_INPUT_SCHEMA,
    request_id: 'req-stage14',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'novgorod' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock: { day: 1, hour: 10, minute: 0, time_of_day: 'day', light_profile: 'daylight' }
    },
    selected_start_node: selectedStartNode(),
    start_place_audit: { version: 1, schema: 'start_place_audit', pass: true },
    player_character: { version: 1, schema: 'player_character_game_profile', character_id: 'pc-1' },
    player_character_audit: { version: 1, schema: 'player_character_audit', pass: true },
    allowed_g5_template_set: allowedTemplates(),
    g5_scene_graph_draft: draft(),
    g5_scene_code_precheck: { version: 1, schema: 'g5_scene_code_precheck', pass: true, checks: {}, concerns: [], evidence: [{ kind: 'stage13' }] },
    npc_candidate_set: { version: 1, schema: 'npc_candidate_set' },
    item_profile_candidate_set: { version: 1, schema: 'item_profile_candidate_set' },
    audit_policy: {}
  };
  return { ...input, ...overrides };
}

function checks() {
  return Object.fromEntries(STAGE14_REQUIRED_CHECKS.map((name) => [name, { pass: true, evidence: [{ kind: name }] }]));
}

function auditOutput(overrides = {}) {
  return {
    version: 1,
    schema: STAGE14_OUTPUT_SCHEMA,
    request_id: 'req-stage14',
    pass: true,
    checks: checks(),
    concerns: [],
    evidence: [{ kind: 'semantic_audit', code: 'all_clear' }],
    repair_route: null,
    commit_permission: {
      can_commit_g5_scene_graph: true,
      can_continue_to_npc_placement: true,
      can_continue_to_item_placement: true,
      can_continue_to_visible_context: false
    },
    ...overrides
  };
}

test('stage14 builds exact g5_scene_audit_input and full audit_policy', () => {
  const context = createContext({ outputs: { 3: stageInput().historical_frame, 7: stageInput().npc_candidate_set, 8: stageInput().item_profile_candidate_set, 9: selectedStartNode(), 10: stageInput().start_place_audit, 11: stageInput().player_character, 12: stageInput().player_character_audit, 13: draft(), 1301: stageInput().g5_scene_code_precheck } });
  const input = buildStage14G5AuditInput(context, { allowed_g5_template_set: allowedTemplates() });
  assert.equal(input.schema, 'g5_scene_audit_input');
  assert.equal(input.version, 1);
  assert.equal(input.g5_scene_graph_draft.schema, 'g5_scene_graph_draft');
  assert.equal(input.g5_scene_code_precheck.schema, 'g5_scene_code_precheck');
  assert.equal(input.audit_policy.reject_visible_scene, true);
  assert.equal(input.audit_policy.require_risk_model, true);
});

test('stage14 input gate rejects failed dependencies and non-materialized draft', () => {
  assert.ok(validateStage14G5AuditInput(stageInput({ start_place_audit: { pass: false } })).some((c) => c.code === 'G5_AUDIT_START_PLACE_AUDIT_FAILED'));
  assert.ok(validateStage14G5AuditInput(stageInput({ player_character_audit: { pass: false } })).some((c) => c.code === 'G5_AUDIT_PLAYER_CHARACTER_AUDIT_FAILED'));
  assert.ok(validateStage14G5AuditInput(stageInput({ player_character: { schema: 'player_character_dossier' } })).some((c) => c.code === 'G5_AUDIT_CHARACTER_SCHEMA_MISMATCH'));
  assert.ok(validateStage14G5AuditInput(stageInput({ g5_scene_graph_draft: draft({ materialization_status: 'requires_repair' }) })).some((c) => c.code === 'G5_AUDIT_MATERIALIZATION_STATUS_INVALID'));
});

test('stage14 code_precheck.pass=false blocks LLM audit', async () => {
  let called = false;
  const input = stageInput({ g5_scene_graph_draft: draft({ visible_scene: { prose: 'leak' } }) });
  const result = await runStage14G5AuditBlock({ input, audit: async () => { called = true; return auditOutput(); } });
  assert.equal(called, false);
  assert.equal(result.output.pass, false);
  assert.ok(result.output.repair_route);
});

test('stage14 validates audit output schema checks evidence and commit_permission', () => {
  assert.deepEqual(validateStage14G5SceneAuditOutput(auditOutput(), stageInput()), []);
  assert.ok(validateStage14G5SceneAuditOutput(auditOutput({ evidence: [] }), stageInput()).some((c) => c.code === 'G5_AUDIT_OUTPUT_EVIDENCE_EMPTY'));
  const incomplete = auditOutput({ checks: { schema_and_structure: { pass: true } } });
  assert.ok(validateStage14G5SceneAuditOutput(incomplete, stageInput()).some((c) => c.code === 'G5_AUDIT_OUTPUT_CHECK_MISSING'));
  assert.ok(validateStage14G5SceneAuditOutput(auditOutput({ commit_allowed: true }), stageInput()).some((c) => c.code === 'G5_AUDIT_COMMIT_ALLOWED_LEGACY_FIELD'));
});

test('stage14 pass=false requires concerns and repair_route', () => {
  const noConcerns = auditOutput({ pass: false, concerns: [], repair_route: { return_to_stage: 'g5_materialization_repair' }, commit_permission: { can_commit_g5_scene_graph: false, can_continue_to_npc_placement: false, can_continue_to_item_placement: false, can_continue_to_visible_context: false } });
  assert.ok(validateStage14G5SceneAuditOutput(noConcerns, stageInput()).some((c) => c.code === 'G5_AUDIT_OUTPUT_CONCERNS_MISSING'));
  const noRoute = auditOutput({ pass: false, concerns: [{ code: 'G5_AUDIT_TEMPLATE_NOT_ALLOWED', severity: 'hard_block' }], repair_route: null, commit_permission: { can_commit_g5_scene_graph: false, can_continue_to_npc_placement: false, can_continue_to_item_placement: false, can_continue_to_visible_context: false } });
  assert.ok(validateStage14G5SceneAuditOutput(noRoute, stageInput()).some((c) => c.code === 'G5_AUDIT_OUTPUT_REPAIR_ROUTE_MISSING'));
});

test('stage14 rejects forbidden audit payload and enum violations', () => {
  assert.ok(validateStage14G5SceneAuditOutput(auditOutput({ modified_draft: {} }), stageInput()).some((c) => c.code === 'G5_AUDIT_FORBIDDEN_OUTPUT_FIELD'));
  assert.ok(validateStage14G5SceneAuditOutput(auditOutput({ new_anchors: [] }), stageInput()).some((c) => c.code === 'G5_AUDIT_FORBIDDEN_OUTPUT_FIELD'));
  assert.ok(validateStage14G5SceneAuditOutput(auditOutput({ visible_scene: {} }), stageInput()).some((c) => c.code === 'G5_AUDIT_FORBIDDEN_OUTPUT_FIELD'));
  const badCode = auditOutput({ pass: false, concerns: [{ code: 'UNKNOWN', severity: 'hard_block' }], repair_route: { return_to_stage: 'g5_materialization_repair' }, commit_permission: { can_commit_g5_scene_graph: false, can_continue_to_npc_placement: false, can_continue_to_item_placement: false, can_continue_to_visible_context: false } });
  assert.ok(validateStage14G5SceneAuditOutput(badCode, stageInput()).some((c) => c.code === 'G5_AUDIT_CONCERN_CODE_UNKNOWN'));
  const badSeverity = auditOutput({ pass: false, concerns: [{ code: 'G5_AUDIT_TEMPLATE_NOT_ALLOWED', severity: 'weird' }], repair_route: { return_to_stage: 'g5_materialization_repair' }, commit_permission: { can_commit_g5_scene_graph: false, can_continue_to_npc_placement: false, can_continue_to_item_placement: false, can_continue_to_visible_context: false } });
  assert.ok(validateStage14G5SceneAuditOutput(badSeverity, stageInput()).some((c) => c.code === 'G5_AUDIT_CONCERN_SEVERITY_UNKNOWN'));
  const badRoute = auditOutput({ pass: false, concerns: [{ code: 'G5_AUDIT_TEMPLATE_NOT_ALLOWED', severity: 'hard_block' }], repair_route: { return_to_stage: 'stage_99' }, commit_permission: { can_commit_g5_scene_graph: false, can_continue_to_npc_placement: false, can_continue_to_item_placement: false, can_continue_to_visible_context: false } });
  assert.ok(validateStage14G5SceneAuditOutput(badRoute, stageInput()).some((c) => c.code === 'G5_AUDIT_REPAIR_ROUTE_UNKNOWN'));
});

test('stage14 pass allows next stages only through commit_permission', async () => {
  const result = await runStage14G5AuditBlock({ input: stageInput(), audit: async () => auditOutput() });
  assert.equal(result.pass, true);
  assert.equal(result.output.commit_permission.can_continue_to_npc_placement, true);
  assert.equal(result.output.commit_permission.can_continue_to_item_placement, true);
  assert.equal(result.output.commit_permission.can_continue_to_visible_context, false);
});
