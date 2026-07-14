import { STAGE_2_SELECTION_MODES, STAGE_2_SOURCES, STAGE_2_CONFIDENCE } from './constants.js';

export function buildStage2NormalizationPolicy() {
  return {
    version: 1,
    schema: 'stage_2_normalization_policy',
    stage_id: 2,
    stage_slug: 'normalize_request',
    stage_boundary: {
      purpose: 'Normalize player desire into a strict machine-readable start request.',
      player_request_is: 'desire_not_world_fact',
      empty_input_means: 'random_when_allow_random_if_missing_is_true',
      may_extract: [
        'explicit or broad era/year/season/time preferences',
        'raw region text and raw start-place text',
        'desired character concept as raw text or category hint',
        'desired status/role/occupation/skills as raw text only',
        'tone, difficulty, hard constraints and soft preferences',
        'contradictions, modern terms, impossible terms and unresolved values',
        'unknowns that later stages must resolve from world_base or candidate sets'
      ],
      must_not_create: [
        'region_id or any resolved world_base id',
        'place_id, graph_node_id, route_id, G1-G5 id or scene anchor id',
        'social_role_id, occupation_id or skill_id',
        'player character profile, attributes, inventory or biography as fact',
        'NPCs, items, containers, events, hidden state or visible scene',
        'start location, start scene, prose, conflict, quest, goal or secret motive'
      ]
    },
    request_value_shape: {
      selection_mode: STAGE_2_SELECTION_MODES,
      source: STAGE_2_SOURCES,
      confidence: STAGE_2_CONFIDENCE,
      missing_value_policy: 'value=null and selection_mode=random when allow_random_if_missing=true',
      explicit_random_policy: 'value=null and source=explicit_player_random; do not invent a concrete value'
    },
    character_request_policy: {
      allowed_fields: [
        'type_text',
        'type_category_hint',
        'status_text',
        'status_category_hint',
        'role_text',
        'role_category_hint',
        'occupation_text',
        'occupation_category_hint',
        'skills_text',
        'property_text',
        'gender_text',
        'age_band_text',
        'origin_text',
        'goal_text',
        'selection_mode',
        'source',
        'confidence',
        'notes'
      ],
      forbidden_fields: ['social_role_id', 'occupation_id', 'skill_id', 'item_id', 'inventory'],
      exact_mapping_stage: 'after stage 4 regional/world_base context is loaded'
    },
    downstream_resolution: {
      historical_frame_stage: 3,
      world_base_loading_stage: 4,
      start_candidate_stages: [5, 6, 7, 8],
      start_node_selection_stage: 9,
      character_generation_stage: 11
    },
    output_rules: {
      schema: 'new_game_normalized_request',
      version: 1,
      response_format: 'json_object',
      preserve_raw_text_meaning: true,
      mark_each_meaningful_value_source: true,
      mark_unknowns_to_resolve: true,
      never_emit_database_ids: true,
      audit_is_self_report_only: true
    }
  };
}
