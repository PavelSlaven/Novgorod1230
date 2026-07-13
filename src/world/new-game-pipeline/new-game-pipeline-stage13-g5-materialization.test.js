import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage13G5CodePrecheck,
  buildStage13G5MaterializationInput,
  filterAllowedG5Templates,
  runStage13G5MaterializationBlock,
  validateStage13G5MaterializationInput,
  validateStage13G5SceneGraphDraft
} from './stages/stage13-g5-materialization.js';

function context() {
  const outputs = new Map();
  return {
    requestId: 'req-13',
    env: { NODE_ENV: 'test' },
    requireStageOutput(id) { return outputs.get(id); },
    getStageOutput(id) { return outputs.get(id); },
    setStageOutput(id, value) { outputs.set(id, value); }
  };
}

function baseInput() {
  const ctx = context();
  return buildStage13G5MaterializationInput(ctx, {
    normalized_request: { version: 1, schema: 'new_game_normalized_request' },
    historical_frame: { version: 1, schema: 'historical_frame', clock: { light_profile: 'dim' } },
    weather_state: {
      version: 1,
      schema: 'weather_state',
      request_id: 'req-13',
      weather_profile_id: 'weather_profile_1',
      weather_kind: 'cloudy',
      temperature_band: 'cold',
      precipitation: 'none',
      wind: 'weak',
      visibility_weather_modifier: 'reduced',
      ground_state: 'snow',
      weather_source: 'regional_rule'
    },
    regional_context_package: { version: 1, schema: 'regional_context_package' },
    selected_start_node: {
      version: 1,
      schema: 'selected_start_node',
      selected: {
        selected_scale_level: 'G4',
        selected_place_template_id: 'place_template_1',
        selected_g4_type_id: 'yard'
      },
      selected_node_chain: {
        g1_node_id: 'g1',
        g2_node_id: 'g2',
        g3_node_id: 'g3',
        g4_node_id: 'g4'
      }
    },
    start_place_audit: { version: 1, schema: 'start_place_audit', pass: true },
    player_character: { version: 1, schema: 'player_character_game_profile' },
    player_character_audit: { version: 1, schema: 'player_character_audit', pass: true, commit_permission: { can_continue_to_g5_materialization: true } },
    npc_candidate_set: { version: 1, schema: 'npc_candidate_set' },
    item_profile_candidate_set: { version: 1, schema: 'item_profile_candidate_set' },
    allowed_g5_template_set: {
      version: 1,
      schema: 'allowed_g5_template_set',
      selected_g4_type_id: 'yard',
      allowed_g5_templates: [
        { id: 'tpl_yard', g4_type_id: 'yard', status: 'active', allowed_anchor_types: ['door', 'bench', 'well', 'path'] },
        { id: 'tpl_bad', g4_type_id: 'yard', status: 'rejected', allowed_anchor_types: ['forbidden'] }
      ]
    }
  });
}

function goodDraft(overrides = {}) {
  return {
    version: 1,
    schema: 'g5_scene_graph_draft',
    request_id: 'req-13',
    materialization_status: 'materialized',
    frame: {},
    parent_location: {
      g1_node_id: 'g1',
      g2_node_id: 'g2',
      g3_node_id: 'g3',
      g4_node_id: 'g4',
      place_template_id: 'place_template_1',
      g4_type_id: 'yard'
    },
    g5_minilocations: [
      { minilocation_id: 'ml_1', parent_g4_node_id: 'g4' }
    ],
    g5_anchors: [
      { anchor_id: 'a_1', minilocation_id: 'ml_1', template_id: 'tpl_yard', anchor_type: 'door', visible_now: true, visibility_reason: 'threshold' },
      { anchor_id: 'a_2', minilocation_id: 'ml_1', template_id: 'tpl_yard', anchor_type: 'bench', visible_now: true, visibility_reason: 'nearby' },
      { anchor_id: 'a_3', minilocation_id: 'ml_1', template_id: 'tpl_yard', anchor_type: 'well', visible_now: false }
    ],
    g5_edges: [
      { edge_id: 'e_1', from_anchor_id: 'a_1', to_anchor_id: 'a_2' },
      { edge_id: 'e_2', from_anchor_id: 'a_2', to_anchor_id: 'a_3' }
    ],
    player_start_position: { location_id: 'g4', minilocation_id: 'ml_1', anchor_id: 'a_1' },
    visibility_model: { mode: 'local_visibility' },
    access_model: { mode: 'local_access' },
    npc_materialization_slots: [{ slot_id: 'npc_slot_1', anchor_id: 'a_2' }],
    item_materialization_slots: [{ slot_id: 'item_slot_1', anchor_id: 'a_3' }],
    unmaterialized_possible_details: [],
    downstream_constraints: { must_preserve: [], must_not_create_yet: [], must_resolve_later: [] },
    source_trace: ['stage:9', 'candidate:g5_template:tpl_yard'],
    audit_self_check: { pass: true, concerns: [], evidence: ['anchors use allowed template'] },
    ...overrides
  };
}

function codes(concerns) {
  return new Set(concerns.map((item) => item.code));
}

test('stage13 builds exact g5_materialization_input and includes full policy', () => {
  const input = baseInput();
  assert.equal(input.version, 1);
  assert.equal(input.schema, 'g5_materialization_input');
  assert.equal(input.player_character.schema, 'player_character_game_profile');
  assert.equal(input.weather_state.schema, 'weather_state');
  assert.equal(input.materialization_policy.materialize_only_selected_g4, true);
  assert.equal(input.materialization_policy.do_not_change_player_character_without_repair, true);
  assert.equal(input.materialization_policy.require_weather_consistency, true);
  assert.equal(input.materialization_policy.do_not_change_weather_state, true);
});

test('stage13 rejects invalid input gates', () => {
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), schema: 'wrong' })).has('G5_MATERIALIZATION_INPUT_SCHEMA_MISMATCH'));
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), start_place_audit: { pass: false } })).has('G5_MATERIALIZATION_START_PLACE_AUDIT_NOT_PASSED'));
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), player_character_audit: { pass: false } })).has('G5_MATERIALIZATION_PLAYER_CHARACTER_AUDIT_NOT_PASSED'));
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), player_character: { schema: 'player_character_dossier' } })).has('G5_MATERIALIZATION_PLAYER_CHARACTER_NOT_GAME_PROFILE'));
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), weather_state: { version: 1, schema: 'wrong' } })).has('G5_MATERIALIZATION_WEATHER_STATE_INVALID'));
  assert.ok(codes(validateStage13G5MaterializationInput({ ...baseInput(), weather_state: { ...baseInput().weather_state, request_id: 'other' } })).has('G5_MATERIALIZATION_WEATHER_REQUEST_MISMATCH'));
  const notG4 = structuredClone(baseInput());
  notG4.selected_start_node.selected.selected_scale_level = 'G3';
  assert.ok(codes(validateStage13G5MaterializationInput(notG4)).has('G5_MATERIALIZATION_SELECTED_SCALE_NOT_G4'));
  const noG4Id = structuredClone(baseInput());
  delete noG4Id.selected_start_node.selected_node_chain.g4_node_id;
  assert.ok(codes(validateStage13G5MaterializationInput(noG4Id)).has('G5_MATERIALIZATION_SELECTED_G4_MISSING'));
});

test('stage13 rejects empty allowlist and filters rejected/conflict templates', () => {
  const input = baseInput();
  assert.deepEqual(filterAllowedG5Templates(input).map((x) => x.id), ['tpl_yard']);
  const empty = { ...input, allowed_g5_template_set: { version: 1, schema: 'allowed_g5_template_set', selected_g4_type_id: 'yard', allowed_g5_templates: [] } };
  assert.ok(codes(validateStage13G5MaterializationInput(empty)).has('G5_MATERIALIZATION_NO_ALLOWED_TEMPLATES'));
});

test('stage13 rejects requires_repair and graph contract violations', () => {
  const input = baseInput();
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ materialization_status: 'requires_repair' }), input)).has('G5_SCENE_GRAPH_STATUS_NOT_MATERIALIZED'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ parent_location: { ...goodDraft().parent_location, g4_node_id: 'other' } }), input)).has('G5_SCENE_GRAPH_NEW_PARENT_LOCATION'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ parent_location: { ...goodDraft().parent_location, place_template_id: 'other' } }), input)).has('G5_SCENE_GRAPH_PLACE_TEMPLATE_MISMATCH'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_minilocations: [] }), input)).has('G5_SCENE_GRAPH_MINILOCATION_COUNT_OUT_OF_RANGE'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_anchors: [] }), input)).has('G5_SCENE_GRAPH_ANCHOR_COUNT_OUT_OF_RANGE'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_edges: [] }), input)).has('G5_SCENE_GRAPH_EDGE_COUNT_OUT_OF_RANGE'));
});

test('stage13 validates anchors, edges and start position', () => {
  const input = baseInput();
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_anchors: goodDraft().g5_anchors.map((a) => ({ ...a, template_id: 'not_allowed' })) }), input)).has('G5_SCENE_GRAPH_ANCHOR_TEMPLATE_NOT_ALLOWED'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_anchors: goodDraft().g5_anchors.map((a) => ({ ...a, anchor_type: 'not_allowed' })) }), input)).has('G5_SCENE_GRAPH_ANCHOR_TYPE_NOT_ALLOWED'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ player_start_position: { location_id: 'g4', minilocation_id: 'missing', anchor_id: 'a_1' } }), input)).has('G5_SCENE_GRAPH_START_MINILOCATION_MISSING'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ player_start_position: { location_id: 'g4', minilocation_id: 'ml_1', anchor_id: 'missing' } }), input)).has('G5_SCENE_GRAPH_START_ANCHOR_MISSING'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_edges: [{ from_anchor_id: 'a_1', to_anchor_id: 'missing' }, { from_anchor_id: 'a_2', to_anchor_id: 'a_3' }] }), input)).has('G5_SCENE_GRAPH_EDGE_REF_MISSING'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ g5_edges: [{ from_anchor_id: 'a_2', to_anchor_id: 'a_3' }, { from_anchor_id: 'a_2', to_anchor_id: 'a_3' }] }), input)).has('G5_SCENE_GRAPH_START_ANCHOR_ISOLATED'));
});

test('stage13 preserves the approved weather state', () => {
  const input = baseInput();
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ weather_state: { ...input.weather_state, weather_kind: 'clear' } }), input)).has('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ frame: { weather_state: { ...input.weather_state, wind: 'strong' } } }), input)).has('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH'));
  assert.equal(validateStage13G5SceneGraphDraft(goodDraft({ frame: { weather_state: structuredClone(input.weather_state) } }), input).length, 0);
});

test('stage13 validates visibility/access/light consistency', () => {
  const input = baseInput();
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ access_model: null }), input)).has('G5_SCENE_GRAPH_ACCESS_MODEL_MISSING'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ visibility_model: { same: true }, access_model: { same: true } }), input)).has('G5_SCENE_GRAPH_VISIBILITY_ACCESS_MERGED'));
  const dark = structuredClone(input);
  dark.historical_frame.clock.light_profile = 'dark';
  const allVisible = goodDraft({ g5_anchors: goodDraft().g5_anchors.map((a) => ({ ...a, visible_now: true, visibility_reason: null })) });
  assert.ok(codes(validateStage13G5SceneGraphDraft(allVisible, dark)).has('G5_SCENE_GRAPH_DARK_VISIBILITY_CONTRADICTION'));
});

test('stage13 rejects downstream entity leaks and empty provenance', () => {
  const input = baseInput();
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ visible_scene: {} }), input)).has('G5_MATERIALIZATION_CREATED_VISIBLE_SCENE'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ intro_prose: 'text' }), input)).has('G5_MATERIALIZATION_CREATED_INTRO_PROSE'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ hidden_event: {} }), input)).has('G5_MATERIALIZATION_CREATED_HIDDEN_EVENT'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ npc_materialization_slots: [{ npc_id: 'npc_1' }] }), input)).has('G5_MATERIALIZATION_CREATED_NPC'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ item_materialization_slots: [{ item_id: 'item_1' }] }), input)).has('G5_MATERIALIZATION_CREATED_ITEM'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ item_materialization_slots: [{ contents: ['coin'] }] }), input)).has('G5_MATERIALIZATION_CREATED_ITEM'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ new_g4_node_id: 'g4_new' }), input)).has('G5_MATERIALIZATION_CREATED_NEW_G4'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ source_trace: [] }), input)).has('G5_SCENE_GRAPH_SOURCE_TRACE_EMPTY'));
  assert.ok(codes(validateStage13G5SceneGraphDraft(goodDraft({ audit_self_check: { pass: true, concerns: [], evidence: [] } }), input)).has('G5_SCENE_GRAPH_SELF_CHECK_EVIDENCE_EMPTY'));
});

test('stage13 block returns code_precheck, pass allows Stage 14 and fail blocks Stage 14/15', async () => {
  const input = baseInput();
  const pass = await runStage13G5MaterializationBlock({ input, materialize: async () => goodDraft() });
  assert.equal(pass.pass, true);
  assert.equal(pass.code_precheck.schema, 'g5_scene_code_precheck');
  const fail = await runStage13G5MaterializationBlock({ input, materialize: async () => goodDraft({ materialization_status: 'requires_repair' }) });
  assert.equal(fail.pass, false);
  assert.ok(codes(fail.concerns).has('G5_SCENE_GRAPH_STATUS_NOT_MATERIALIZED'));
});
