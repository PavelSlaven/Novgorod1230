const STAGE_SPEC_ROOT = 'DOCUMENTS/documents-kg/corpus/DOCUMENTS/new_game_start';
const SHARED_PROMPT_TEMPLATE = 'DOCUMENTS/llm_agent_prompt_templates.md';

export const NEW_GAME_LLM_REQUIREMENTS = Object.freeze({
  NONE: 'none',
  OPTIONAL: 'optional',
  REQUIRED: 'required',
  PRACTICALLY_REQUIRED: 'practically_required'
});

export const NEW_GAME_MODEL_TIERS = Object.freeze({
  TIER_1_FAST: 'tier_1_fast',
  TIER_2_STANDARD: 'tier_2_standard',
  TIER_3_SENIOR: 'tier_3_senior',
  NONE: 'none'
});

export const NEW_GAME_CRITICAL_STAGE_IDS = Object.freeze([11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 26]);

export const NEW_GAME_REPAIR_ESCALATION_POLICY = Object.freeze({
  enabled: true,
  max_repair_attempts_before_senior: 1,
  senior_repair_required_from_attempt: 2,
  no_downgrade_after_senior: true,
  block_after_failed_senior_repair: true,
  tier_order: Object.freeze([
    NEW_GAME_MODEL_TIERS.TIER_1_FAST,
    NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    NEW_GAME_MODEL_TIERS.TIER_3_SENIOR
  ]),
  format_error: Object.freeze({
    first_repair_tier: NEW_GAME_MODEL_TIERS.TIER_1_FAST,
    second_repair_tier: NEW_GAME_MODEL_TIERS.TIER_3_SENIOR
  }),
  semantic_error: Object.freeze({
    first_repair_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    second_repair_tier: NEW_GAME_MODEL_TIERS.TIER_3_SENIOR
  }),
  failed_senior_statuses: Object.freeze([
    'stage_failed',
    'needs_manual_review',
    'needs_higher_level_rebuild'
  ])
});

const MATRIX = Object.freeze([
  stage(1, 'player_request', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.NONE,
    llm_role: null,
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: null,
    prompt_sources: [],
    context_blocks: ['raw_player_request'],
    input_schema: 'raw_start_request',
    output_schema: 'new_game_player_request',
    auditor_role: null,
    repairer_role: null,
    senior_repairer_role: null,
    repair_policy: null,
    code_gate_role: 'PlayerRequestCapture',
    returns_to_stage_on_failure: null
  }),
  stage(2, 'normalize_request', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'RequestNormalizer',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_1_FAST,
    prompt_id: 'new_game_start.stage_02.normalize_request.v1',
    context_blocks: ['raw_player_text', 'player_name', 'normalization_policy'],
    input_schema: 'new_game_player_request',
    output_schema: 'new_game_normalized_request',
    auditor_role: null,
    repairer_role: 'FormatRepairer',
    senior_repairer_role: 'SeniorRequestNormalizerRepairer',
    repair_policy: repairPolicy('format_first_fast'),
    code_gate_role: 'NormalizedRequestSchemaGate',
    returns_to_stage_on_failure: 2
  }),
  stage(3, 'historical_frame', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'HistoricalFrameSelector',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_03.historical_frame.v1',
    context_blocks: ['normalized_request', 'historical_candidate_set', 'region_constraints', 'calendar_constraints'],
    input_schema: 'historical_frame_selection_input',
    output_schema: 'historical_frame',
    auditor_role: null,
    repairer_role: 'HistoricalFrameRepairer',
    senior_repairer_role: 'SeniorHistoricalFrameRepairer',
    repair_policy: repairPolicy('semantic_standard'),
    code_gate_role: 'HistoricalFrameCompatibilityGate',
    returns_to_stage_on_failure: 3
  }),
  stage(4, 'regional_context', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'RegionalContextPackShaper',
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: 'new_game_start.stage_04.regional_context.v1',
    context_blocks: ['historical_frame', 'world_base_region_fragments'],
    input_schema: 'regional_context_input',
    output_schema: 'regional_context_package',
    auditor_role: 'RegionalContextAuditor',
    repairer_role: 'RegionalContextRepairer',
    senior_repairer_role: 'SeniorRegionalContextRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'RegionalContextAssemblyGate',
    returns_to_stage_on_failure: 4
  }),
  stage(5, 'start_candidates', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'StartCandidateSetCompressor',
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: 'new_game_start.stage_05.start_candidates.v1',
    context_blocks: ['historical_frame', 'regional_context_package', 'world_base_candidate_pool'],
    input_schema: 'start_candidate_set_input',
    output_schema: 'start_candidate_set',
    auditor_role: 'StartCandidateSetAuditor',
    repairer_role: 'StartCandidateExplanationWriter',
    senior_repairer_role: 'SeniorStartCandidateRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'StartCandidateSetGate',
    returns_to_stage_on_failure: 5
  }),
  stage(6, 'candidate_place_templates', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'PlaceTemplateSetCompressor',
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: 'new_game_start.stage_06.place_templates.v1',
    context_blocks: ['start_candidate_set', 'regional_context_package', 'template_links'],
    input_schema: 'candidate_place_template_input',
    output_schema: 'candidate_place_template_set',
    auditor_role: 'PlaceTemplateLinkAuditor',
    repairer_role: 'PlaceTemplateFormatRepairer',
    senior_repairer_role: 'SeniorPlaceTemplateRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'PlaceTemplateCandidateGate',
    returns_to_stage_on_failure: 6
  }),
  stage(7, 'npc_candidates', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'NpcCandidateSetCompressor',
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: 'new_game_start.stage_07.npc_candidates.v1',
    context_blocks: ['historical_frame', 'start_candidate_set', 'candidate_place_template_set'],
    input_schema: 'npc_candidate_set_input',
    output_schema: 'npc_candidate_set',
    auditor_role: 'NpcCandidateSetAuditor',
    repairer_role: 'NpcCandidateFormatRepairer',
    senior_repairer_role: 'SeniorNpcCandidateRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'NpcCandidateSetGate',
    returns_to_stage_on_failure: 7
  }),
  stage(8, 'item_profile_candidates', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'ItemProfileSetCompressor',
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: 'new_game_start.stage_08.item_profiles.v1',
    context_blocks: ['historical_frame', 'start_candidate_set', 'candidate_place_template_set'],
    input_schema: 'item_profile_candidate_set_input',
    output_schema: 'item_profile_candidate_set',
    auditor_role: 'ItemProfileSetAuditor',
    repairer_role: 'ItemProfileFormatRepairer',
    senior_repairer_role: 'SeniorItemProfileRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'ItemProfileCandidateSetGate',
    returns_to_stage_on_failure: 8
  }),
  stage(9, 'start_node_selection', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'StartNodeSelector',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_09.start_node_selection.v1',
    context_blocks: ['normalized_request', 'historical_frame', 'regional_context_package', 'start_candidate_set', 'candidate_place_template_set', 'npc_candidate_set', 'item_profile_candidate_set'],
    input_schema: 'selected_start_node_input',
    output_schema: 'selected_start_node',
    auditor_role: 'StartPlaceSemanticAuditor',
    repairer_role: 'StartNodeSelectionRepairer',
    senior_repairer_role: 'SeniorStartNodeSelectionRepairer',
    repair_policy: repairPolicy('semantic_standard'),
    code_gate_role: 'StartNodeCandidateGate',
    returns_to_stage_on_failure: 9
  }),
  stage(10, 'start_place_audit', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.OPTIONAL,
    llm_role: 'StartPlaceSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_10.start_place_audit.v1',
    context_blocks: ['selected_start_node', 'candidate_provenance', 'compatibility_facts'],
    input_schema: 'start_place_audit_input',
    output_schema: 'start_place_audit',
    auditor_role: 'StartPlaceSemanticAuditor',
    repairer_role: 'StartPlaceAuditFormatRepairer',
    senior_repairer_role: 'SeniorStartPlaceAuditRepairer',
    repair_policy: repairPolicy('optional_code_first'),
    code_gate_role: 'StartPlaceCompatibilityGate',
    returns_to_stage_on_failure: 10
  }),
  stage(11, 'player_character', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'PlayerCharacterDossierGenerator',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_11.player_character.v1',
    context_blocks: ['normalized_request', 'historical_frame', 'selected_start_node', 'item_affordances', 'social_constraints'],
    input_schema: 'player_character_generation_input',
    output_schema: 'player_character_game_profile',
    auditor_role: 'PlayerCharacterSemanticAuditor',
    repairer_role: 'PlayerCharacterRepairer',
    senior_repairer_role: 'SeniorPlayerCharacterRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'PlayerCharacterSchemaGate',
    returns_to_stage_on_failure: 11
  }),
  stage(12, 'player_character_audit', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'PlayerCharacterSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_12.player_character_audit.v1',
    context_blocks: ['player_character_game_profile', 'source_provenance'],
    input_schema: 'player_character_audit_input',
    output_schema: 'player_character_audit',
    auditor_role: 'PlayerCharacterSemanticAuditor',
    repairer_role: 'PlayerCharacterAuditRepairer',
    senior_repairer_role: 'SeniorPlayerCharacterAuditRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'PlayerCharacterSemanticGate',
    returns_to_stage_on_failure: 11
  }),
  stage(13, 'g5_materialization', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'G5SceneMaterializer',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_13.g5_materialization.v1',
    context_blocks: [
      'normalized_request',
      'historical_frame',
      'regional_context_package',
      'selected_start_node',
      'start_place_audit',
      'player_character',
      'player_character_audit',
      'npc_candidate_set',
      'item_profile_candidate_set',
      'allowed_g5_template_set',
      'materialization_policy'
    ],
    input_schema: 'g5_materialization_input',
    output_schema: 'g5_scene_graph_draft',
    auditor_role: 'G5SceneSemanticAuditor',
    repairer_role: 'G5SceneMaterializationRepairer',
    senior_repairer_role: 'SeniorG5SceneMaterializationRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'G5SceneGraphDraftGate',
    returns_to_stage_on_failure: 13
  }),
  stage(14, 'g5_audit', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'G5SceneSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_14.g5_audit.v1',
    context_blocks: [
      'historical_frame',
      'selected_start_node',
      'start_place_audit',
      'player_character',
      'player_character_audit',
      'allowed_g5_template_set',
      'g5_scene_graph_draft',
      'g5_scene_code_precheck',
      'npc_candidate_set',
      'item_profile_candidate_set',
      'audit_policy'
    ],
    input_schema: 'g5_scene_audit_input',
    output_schema: 'g5_scene_audit',
    auditor_role: 'G5SceneSemanticAuditor',
    router_role: 'G5SceneAuditRouter',
    format_repairer_role: 'G5SceneAuditFormatRepairer',
    repairer_role: 'G5SceneSemanticRepairer',
    senior_repairer_role: 'SeniorG5SceneRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'G5SceneAuditGate',
    returns_to_stage_on_failure: 13
  }),
  stage(15, 'npc_placement', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'InitialNpcPlacer',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_15.npc_placement.v1',
    context_blocks: ['historical_frame', 'selected_start_node', 'player_character', 'g5_scene_graph_draft', 'npc_candidate_set'],
    input_schema: 'initial_npc_placement_input',
    output_schema: 'initial_npc_placement_draft',
    auditor_role: 'InitialNpcPlacementAuditor',
    repairer_role: 'InitialNpcPlacementRepairer',
    senior_repairer_role: 'SeniorInitialNpcPlacementRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'InitialNpcPlacementGate',
    returns_to_stage_on_failure: 15
  }),
  stage(16, 'item_placement', {
    primary_executor: 'llm',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'InitialItemPlacer',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_16.item_placement.v1',
    context_blocks: ['historical_frame', 'selected_start_node', 'player_character', 'g5_scene_graph_draft', 'initial_npc_placement_draft', 'item_profile_candidate_set'],
    input_schema: 'initial_item_placement_input',
    output_schema: 'initial_item_placement_draft',
    auditor_role: 'InitialItemPlacementAuditor',
    repairer_role: 'InitialItemPlacementRepairer',
    senior_repairer_role: 'SeniorInitialItemPlacementRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'InitialItemPlacementGate',
    returns_to_stage_on_failure: 16
  }),
  stage(17, 'time_light_gate', {
    primary_executor: 'code',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'TimeLightSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_17.time_light_gate.v1',
    context_blocks: [
      'historical_frame',
      'weather_state',
      'selected_start_node',
      'player_character',
      'g5_scene_graph',
      'g5_scene_audit',
      'initial_npc_placement',
      'npc_placement_audit',
      'initial_item_placement',
      'item_placement_audit',
      'draft_visible_context_package',
      'time_light_policy'
    ],
    input_schema: 'time_light_consistency_input',
    output_schema: 'time_light_consistency_audit',
    auditor_role: 'TimeLightSemanticAuditor',
    router_role: 'TimeLightAuditRouter',
    format_repairer_role: 'TimeLightAuditFormatRepairer',
    repairer_role: 'TimeLightAuditFormatRepairer',
    senior_repairer_role: 'SeniorTimeLightRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'TimeLightConsistencyGate',
    returns_to_stage_on_failure: 17
  }),
  stage(18, 'map_knowledge', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'CharacterKnowledgeMapBuilder',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_18.map_knowledge.v1',
    context_blocks: [
      'historical_frame', 'weather_state', 'selected_start_node', 'player_character',
      'current_position', 'g5_scene_graph', 'approved_placement_layers',
      'time_light_consistency_audit', 'regional_context_package',
      'world_base_route_snapshot', 'knowledge_policy'
    ],
    input_schema: 'character_knowledge_map_input',
    output_schema: 'stage18_character_knowledge_result',
    semantic_output_schema: 'character_knowledge_map',
    code_precheck_schema: 'character_knowledge_map_code_precheck',
    audit_output_schema: 'character_knowledge_map_audit',
    write_projection_schema: 'character_knowledge_write_projection',
    auditor_role: 'CharacterKnowledgeMapAuditor',
    format_repairer_role: 'CharacterKnowledgeMapFormatRepairer',
    repairer_role: 'CharacterKnowledgeMapSemanticRepairer',
    senior_repairer_role: 'CharacterKnowledgeMapSeniorRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'CharacterKnowledgeMapCodePrecheck',
    provided_output_policy: 'forbidden_all_environments',
    returns_to_stage_on_failure: 18
  }),
  stage(19, 'hidden_state', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'FullHiddenStateBuilder',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_19.hidden_state.v1',
    context_blocks: [
      'historical_frame',
      'weather_state',
      'selected_start_node',
      'player_character',
      'g5_scene_graph',
      'approved_placement_layers',
      'time_light_consistency_audit',
      'character_knowledge_map',
      'regional_context_package',
      'world_base_route_snapshot',
      'hidden_state_policy'
    ],
    input_schema: 'hidden_state_builder_input',
    output_schema: 'stage19_hidden_state_result',
    semantic_output_schema: 'full_hidden_scene_state',
    code_precheck_schema: 'full_hidden_state_code_precheck',
    audit_output_schema: 'full_hidden_state_audit',
    auditor_role: 'FullHiddenStateAuditor',
    format_repairer_role: 'FullHiddenStateFormatRepairer',
    repairer_role: 'FullHiddenStateSemanticRepairer',
    senior_repairer_role: 'FullHiddenStateSeniorRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'FullHiddenStateCodePrecheck',
    provided_output_policy: 'forbidden_all_environments',
    returns_to_stage_on_failure: 19
  }),
  stage(20, 'visible_context', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'VisibleContextBuilder',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_20.visible_context.v1',
    context_blocks: [
      'historical_frame', 'weather_state', 'selected_start_node', 'player_character',
      'current_position', 'g5_scene_graph', 'approved_placement_layers',
      'time_light_consistency_audit', 'character_knowledge_map',
      'full_hidden_scene_state', 'visible_context_policy', 'visibility_filter'
    ],
    input_schema: 'visible_context_builder_input',
    output_schema: 'stage20_visible_context_result',
    semantic_output_schema: 'visible_context_package',
    visibility_filter_schema: 'visible_context_visibility_filter',
    code_precheck_schema: 'visible_context_code_precheck',
    format_repairer_role: 'VisibleContextFormatRepairer',
    repairer_role: 'VisibleContextSemanticRepairer',
    senior_repairer_role: 'SeniorVisibleContextSemanticRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'VisibleContextBoundaryGate',
    provided_output_policy: 'forbidden_all_environments',
    downstream_permission: 'can_continue_to_visible_context_audit',
    narrator_permission: 'always_false_at_stage_20',
    returns_to_stage_on_failure: 20
  }),
  stage(21, 'visible_context_audit', {
    primary_executor: 'isolated_llm_audit_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'VisibleContextSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_21.visible_context_audit.v2',
    context_blocks: ['exact_visible_context_audit_input', 'independent_code_precheck', 'package_digest'],
    input_schema: 'visible_context_audit_input',
    output_schema: 'stage21_visible_context_audit_result',
    semantic_output_schema: 'visible_context_audit',
    code_precheck_schema: 'visible_context_audit_code_precheck',
    repair_route_schema: 'visible_context_audit_repair_route',
    auditor_role: 'VisibleContextSemanticAuditor',
    format_repairer_role: 'VisibleContextAuditFormatRepairer',
    senior_auditor_role: 'SeniorVisibleContextSemanticAuditor',
    router_role: 'VisibleContextAuditRouter',
    repair_policy: repairPolicy('audit_route_only'),
    code_gate_role: 'VisibleContextApprovalGate',
    provided_output_policy: 'forbidden_all_environments',
    package_binding: 'sha256_canonical_json',
    returns_to_stage_on_failure: null
  }),
  stage(22, 'narrator_prose', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'NarratorStartingProseWriter',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_22.narrator_prose.v2',
    context_blocks: ['exact_narrator_start_input', 'approved_visible_context_only', 'package_digest'],
    input_schema: 'narrator_start_input',
    output_schema: 'stage22_narrator_prose_result',
    semantic_output_schema: 'narrator_starting_prose',
    code_precheck_schema: 'narrator_start_code_precheck',
    writer_role: 'NarratorStartingProseWriter',
    format_repairer_role: 'NarratorProseFormatRepairer',
    senior_writer_role: 'SeniorNarratorStartingProseWriter',
    semantic_repairer_role: 'NarratorProseSemanticRepairer',
    senior_semantic_repairer_role: 'SeniorNarratorProseSemanticRepairer',
    repair_policy: repairPolicy('critical_semantic'),
    code_gate_role: 'NarratorVisibleOnlyGate',
    provided_output_policy: 'forbidden_all_environments',
    package_binding: 'sha256_canonical_json',
    returns_to_stage_on_failure: null
  }),
  stage(23, 'narrator_prose_audit', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'NarratorProseSemanticAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_23.narrator_prose_audit.v3',
    context_blocks: ['exact_narrator_prose_audit_input', 'approved_visible_context_only', 'narrator_starting_prose', 'prose_audit_policy', 'package_digest', 'prose_digest'],
    input_schema: 'narrator_prose_audit_input',
    code_precheck_schema: 'narrator_prose_code_precheck',
    output_schema: 'narrator_prose_audit',
    result_schema: 'stage23_narrator_prose_audit_result',
    route_schema: 'narrator_prose_audit_route',
    auditor_role: 'NarratorProseSemanticAuditor',
    format_repairer_role: 'NarratorProseAuditFormatRepairer',
    senior_auditor_role: 'SeniorNarratorProseSemanticAuditor',
    router_role: 'NarratorProseAuditRouter',
    repair_policy: repairPolicy('audit_route_only'),
    code_gate_role: 'NarratorProseApprovalGate',
    provided_output_policy: 'forbidden_all_environments',
    package_binding: 'sha256_canonical_json',
    prose_binding: 'sha256_canonical_json',
    returns_to_stage_on_failure: null
  }),
  stage(24, 'party_write_plan', {
    primary_executor: 'isolated_llm_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'PartyDbWritePlanBuilder',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_24.party_write_plan.v2',
    context_blocks: ['exact_party_db_write_plan_input', 'approved_pipeline_manifest', 'party_database_schema_snapshot', 'world_base_reference_snapshot', 'write_policy'],
    input_schema: 'party_db_write_plan_input',
    code_precheck_schema: 'party_db_write_plan_code_precheck',
    plan_schema: 'party_db_write_plan',
    audit_schema: 'party_db_write_plan_audit',
    route_schema: 'party_db_write_plan_repair_route',
    output_schema: 'stage24_party_db_write_plan_result',
    plan_format_repairer_role: 'PartyDbWritePlanFormatRepairer',
    auditor_role: 'PartyDbWritePlanAuditor',
    audit_format_repairer_role: 'PartyDbWritePlanAuditFormatRepairer',
    router_role: 'PartyDbWritePlanAuditRouter',
    semantic_repairer_role: 'PartyDbWritePlanSemanticRepairer',
    senior_semantic_repairer_role: 'SeniorPartyDbWritePlanSemanticRepairer',
    senior_builder_role: 'SeniorPartyDbWritePlanBuilder',
    senior_auditor_role: 'SeniorPartyDbWritePlanAuditor',
    repair_policy: repairPolicy('audit_route_only'),
    code_gate_role: 'PartyDbWritePlanCodePrecheck',
    provided_output_policy: 'forbidden_all_environments',
    package_binding: 'sha256_canonical_json',
    returns_to_stage_on_failure: null
  }),
  stage(25, 'party_commit', {
    primary_executor: 'isolated_code_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.NONE,
    llm_role: null,
    model_tier: NEW_GAME_MODEL_TIERS.NONE,
    prompt_id: null,
    context_blocks: ['exact_commit_gate_input', 'stage24_result_approval', 'physical_plan_digest', 'dry_run_result', 'transaction_result', 'postcommit_state'],
    input_schema: 'commit_gate_input',
    preflight_schema: 'stage25_commit_preflight',
    dry_run_schema: 'party_write_plan_dry_run_result',
    gate_schema: 'commit_gate_result',
    transaction_schema: 'party_transaction_result',
    postcommit_schema: 'party_postcommit_validation',
    output_schema: 'stage25_party_start_commit_result',
    provided_output_policy: 'forbidden_all_environments',
    repair_policy: repairPolicy('code_only_gate'),
    code_gate_role: 'Stage25AtomicCommitAuthority',
    returns_to_stage_on_failure: 24
  }),
  stage(26, 'first_game_screen', {
    primary_executor: 'isolated_code_and_audit_block',
    llm_requirement: NEW_GAME_LLM_REQUIREMENTS.REQUIRED,
    llm_role: 'FirstScreenSafetyAuditor',
    model_tier: NEW_GAME_MODEL_TIERS.TIER_2_STANDARD,
    prompt_id: 'new_game_start.stage_26.first_game_screen.v2',
    context_blocks: ['exact_first_game_screen_input', 'stage25_party_commit_approval', 'committed_public_read_model', 'approved_narrator_output', 'approved_visible_context'],
    input_schema: 'first_game_screen_input',
    precheck_schema: 'first_screen_code_precheck',
    screen_schema: 'first_game_screen',
    safety_audit_schema: 'first_screen_safety_audit',
    action_audit_schema: 'first_screen_action_label_audit',
    output_schema: 'stage26_first_game_screen_result',
    safety_auditor_role: 'FirstScreenSafetyAuditor',
    action_label_auditor_role: 'FirstScreenActionLabelAuditor',
    auditor_role: 'FirstScreenActionLabelAuditor',
    format_repairer_role: 'FirstScreenFormatRepairer',
    semantic_repairer_role: 'FirstScreenSemanticRepairer',
    repairer_role: 'FirstScreenSemanticRepairer',
    senior_repairer_role: 'SeniorFirstScreenRepairer',
    repair_policy: repairPolicy('semantic_standard'),
    code_gate_role: 'FirstGameScreenSafetyGate',
    provided_output_policy: 'forbidden_all_environments',
    returns_to_stage_on_failure: null
  })
]);

export function getNewGameStageMatrix() {
  return MATRIX.map((entry) => structuredClone(entry));
}

export function getNewGameStageMatrixEntry(idOrSlug) {
  const key = String(idOrSlug ?? '').trim();
  const entry = MATRIX.find((item) => String(item.stage_id) === key || item.slug === key) ?? null;
  return entry ? structuredClone(entry) : null;
}

function stage(stageId, slug, overrides = {}) {
  const stageSpecSource = stageId >= 2 && stageId <= 26
    ? `${STAGE_SPEC_ROOT}/${stageId}.txt`
    : null;
  const promptSources = stageSpecSource
    ? [stageSpecSource, ...(overrides.primary_executor === 'llm' ? [SHARED_PROMPT_TEMPLATE] : [])]
    : [];
  return Object.freeze({
    stage_id: stageId,
    slug,
    prompt_sources: Object.freeze(overrides.prompt_sources ?? promptSources),
    stage_type: overrides.stage_type ?? defaultStageType(overrides.primary_executor, slug),
    requires_semantic_audit: overrides.requires_semantic_audit ?? /audit/u.test(slug),
    freeze_policy: Object.freeze(overrides.freeze_policy ?? { freeze_full_artifact: true }),
    pre_dependency_requirements: Object.freeze(overrides.pre_dependency_requirements ?? []),
    post_dependency_requirements: Object.freeze(overrides.post_dependency_requirements ?? []),
    canonical_artifact_schema: overrides.canonical_artifact_schema ?? overrides.output_schema ?? null,
    ...overrides
  });
}

function repairPolicy(kind) {
  const critical = kind === 'critical_semantic';
  if (kind === 'code_only_gate') {
    return Object.freeze({
      kind,
      format_error_first_repair_tier: null,
      format_error_second_repair_tier: null,
      semantic_error_first_repair_tier: null,
      semantic_error_second_repair_tier: NEW_GAME_MODEL_TIERS.TIER_3_SENIOR,
      max_attempts: 0,
      failed_senior_statuses: NEW_GAME_REPAIR_ESCALATION_POLICY.failed_senior_statuses
    });
  }
  return Object.freeze({
    kind,
    enabled: kind !== 'code_only_gate',
    normal_role_id: kind === 'code_only_gate' ? null : 'normal_repair',
    senior_role_id: 'senior_repair',
    max_normal_attempts: kind === 'code_only_gate' ? 0 : 1,
    max_senior_attempts: kind === 'code_only_gate' ? 0 : 1,
    allowed_error_kinds: Object.freeze(kind === 'code_only_gate'
      ? []
      : ['format', 'schema', 'structural_validation', 'semantic_audit', 'semantic_audit_format', 'dependency_consistency']),
    format_error_first_repair_tier: NEW_GAME_MODEL_TIERS.TIER_1_FAST,
    format_error_second_repair_tier: NEW_GAME_MODEL_TIERS.TIER_3_SENIOR,
    semantic_error_first_repair_tier: critical
      ? NEW_GAME_MODEL_TIERS.TIER_2_STANDARD
      : (kind === 'optional_code_first' ? null : NEW_GAME_MODEL_TIERS.TIER_2_STANDARD),
    semantic_error_second_repair_tier: critical || kind === 'semantic_standard'
      ? NEW_GAME_MODEL_TIERS.TIER_3_SENIOR
      : null,
    max_attempts: critical ? 2 : 2,
    failed_senior_statuses: NEW_GAME_REPAIR_ESCALATION_POLICY.failed_senior_statuses
  });
}

function defaultStageType(primaryExecutor, slug) {
  if (/audit/u.test(slug)) return 'semantic_audit';
  if (/select|choose/u.test(slug)) return 'semantic_selection';
  if (/normalize|write_plan/u.test(slug)) return 'contract_shaping';
  if (primaryExecutor === 'llm') return 'semantic_generation';
  return 'contract_shaping';
}
