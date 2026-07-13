import { STAGE13_CODE_PRECHECK_SCHEMA, STAGE13_OUTPUT_SCHEMA } from '@rus/contracts';
import { validateStage13G5SceneGraphDraft } from '../../../g5-scene/draft-validation.js';

export function buildStage13G5CodePrecheck(output = {}, input = {}) {
  const concerns = validateStage13G5SceneGraphDraft(output, input);
  const has = (code) => !concerns.some((item) => item.code === code);
  return {
    version: 1,
    schema: STAGE13_CODE_PRECHECK_SCHEMA,
    pass: concerns.length === 0,
    checks: {
      schema_valid: has('G5_SCENE_GRAPH_SCHEMA_MISMATCH') && has('G5_SCENE_GRAPH_VERSION_MISMATCH'),
      selected_g4_valid: has('G5_SCENE_GRAPH_PARENT_G4_MISMATCH') && has('G5_SCENE_GRAPH_NEW_PARENT_LOCATION'),
      all_minilocations_inside_selected_g4: has('G5_SCENE_GRAPH_MINILOCATION_OUTSIDE_SELECTED_G4'),
      all_anchors_have_allowed_templates: has('G5_SCENE_GRAPH_ANCHOR_TEMPLATE_NOT_ALLOWED') && has('G5_SCENE_GRAPH_ANCHOR_TYPE_NOT_ALLOWED'),
      player_start_anchor_exists: has('G5_SCENE_GRAPH_START_ANCHOR_MISSING'),
      player_start_minilocation_exists: has('G5_SCENE_GRAPH_START_MINILOCATION_MISSING'),
      all_edges_reference_existing_anchors: has('G5_SCENE_GRAPH_EDGE_REF_MISSING'),
      clock_light_consistency: has('G5_SCENE_GRAPH_DARK_VISIBILITY_CONTRADICTION'),
      weather_consistency: has('G5_SCENE_GRAPH_WEATHER_STATE_MISMATCH') && has('G5_MATERIALIZATION_WEATHER_STATE_INVALID'),
      no_npcs_materialized: has('G5_MATERIALIZATION_CREATED_NPC'),
      no_items_materialized: has('G5_MATERIALIZATION_CREATED_ITEM'),
      no_intro_prose: has('G5_MATERIALIZATION_CREATED_INTRO_PROSE'),
      source_trace_present: has('G5_SCENE_GRAPH_SOURCE_TRACE_EMPTY')
    },
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 13 code precheck passed: G5 draft remains inside selected G4 and uses allowed templates.']
      : concerns.map((item) => item.code)
  };
}

export function buildBlockedG5SceneDraft(input, concerns) {
  return {
    version: 1,
    schema: STAGE13_OUTPUT_SCHEMA,
    request_id: input?.request_id ?? null,
    materialization_status: 'blocked',
    frame: {},
    parent_location: {},
    g5_minilocations: [],
    g5_anchors: [],
    g5_edges: [],
    player_start_position: {},
    visibility_model: {},
    access_model: {},
    npc_materialization_slots: [],
    item_materialization_slots: [],
    unmaterialized_possible_details: [],
    downstream_constraints: {
      must_preserve: ['selected_g4', 'player_character', 'historical_frame'],
      must_not_create_yet: ['npc', 'item', 'intro_prose', 'hidden_event'],
      must_resolve_later: []
    },
    source_trace: [],
    audit_self_check: {
      pass: false,
      concerns,
      evidence: concerns.map((item) => item.code)
    }
  };
}

export function buildFailedInputPrecheck(concerns) {
  return {
    version: 1,
    schema: STAGE13_CODE_PRECHECK_SCHEMA,
    pass: false,
    checks: {
      schema_valid: !concerns.some((item) => /SCHEMA|VERSION/u.test(item.code)),
      selected_g4_valid: !concerns.some((item) => /SELECTED|G4/u.test(item.code)),
      all_minilocations_inside_selected_g4: false,
      all_anchors_have_allowed_templates: !concerns.some((item) => /TEMPLATE/u.test(item.code)),
      player_start_anchor_exists: false,
      player_start_minilocation_exists: false,
      all_edges_reference_existing_anchors: false,
      clock_light_consistency: false,
      no_npcs_materialized: true,
      no_items_materialized: true,
      no_intro_prose: true,
      source_trace_present: false
    },
    concerns,
    evidence: concerns.map((item) => item.code)
  };
}
