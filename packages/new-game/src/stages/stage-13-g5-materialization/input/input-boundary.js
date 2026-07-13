import { STAGE13_INPUT_SCHEMA } from '@rus/contracts';
import { isPlainObject, readSelectedChain, readSelectedPlaceTemplateId, readSelectedScaleLevel } from '../../../g5-scene/shared.js';
import { filterAllowedG5Templates, normalizeAllowedG5TemplateSet } from '../../../g5-scene/templates.js';
import { normalizeStage13MaterializationPolicy } from '../policy/constants.js';

export function buildStage13G5MaterializationInput(context, options = {}) {
  const allowedG5TemplateSet = normalizeAllowedG5TemplateSet(options.allowed_g5_template_set ?? options.allowedG5TemplateSet ?? context.getStageOutput?.(1300) ?? {});
  const input = {
    version: 1,
    schema: STAGE13_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? options.normalizedRequest ?? context.requireStageOutput?.(2, 'normalized request'),
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput?.(3, 'historical frame'),
    weather_state: options.weather_state ?? options.weatherState ?? context.getFrozenArtifactBySchema?.('weather_state')?.artifact ?? null,
    regional_context_package: options.regional_context_package ?? options.regionalContextPackage ?? context.requireStageOutput?.(4, 'regional context package'),
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput?.(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? options.startPlaceAudit ?? context.requireStageOutput?.(10, 'start place audit'),
    player_character: options.player_character ?? options.playerCharacter ?? context.getStageOutput?.(1101) ?? context.requireStageOutput?.(11, 'player character'),
    player_character_audit: options.player_character_audit ?? options.playerCharacterAudit ?? context.requireStageOutput?.(12, 'player character audit'),
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput?.(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput?.(8, 'item profile candidate set'),
    allowed_g5_template_set: allowedG5TemplateSet,
    materialization_policy: normalizeStage13MaterializationPolicy(options.materialization_policy ?? options.policy ?? {})
  };
  return {
    ...input,
    allowed_g5_template_set: {
      ...input.allowed_g5_template_set,
      allowed_g5_templates: filterAllowedG5Templates(input)
    }
  };
}

export function validateStage13G5MaterializationInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('G5_MATERIALIZATION_INPUT_NOT_OBJECT', 'Stage 13 input must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (input.version !== 1) {
    concerns.push(concern('G5_MATERIALIZATION_INPUT_VERSION_MISMATCH', 'Stage 13 input.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (input.schema !== STAGE13_INPUT_SCHEMA) {
    concerns.push(concern('G5_MATERIALIZATION_INPUT_SCHEMA_MISMATCH', `Stage 13 input.schema must be ${STAGE13_INPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  for (const field of [
    'normalized_request',
    'historical_frame',
    'weather_state',
    'regional_context_package',
    'selected_start_node',
    'start_place_audit',
    'player_character',
    'player_character_audit',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'allowed_g5_template_set',
    'materialization_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('G5_MATERIALIZATION_INPUT_MISSING_BLOCK', `Stage 13 input.${field} must be an object.`, { field, severity: 'hard_block' }));
    }
  }
  if (input.weather_state?.version !== 1 || input.weather_state?.schema !== 'weather_state') {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_STATE_INVALID', 'Stage 13 requires approved weather_state version 1.', { field: 'weather_state', severity: 'hard_block' }));
  }
  if (input.materialization_policy?.require_weather_consistency !== true || input.materialization_policy?.do_not_change_weather_state !== true) {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_POLICY_INVALID', 'Stage 13 weather policy must require consistency and forbid weather mutation.', { field: 'materialization_policy', severity: 'hard_block' }));
  }
  if (input.weather_state?.request_id && input.request_id && input.weather_state.request_id !== input.request_id) {
    concerns.push(concern('G5_MATERIALIZATION_WEATHER_REQUEST_MISMATCH', 'weather_state.request_id must match Stage 13 request_id.', { field: 'weather_state.request_id', severity: 'hard_block' }));
  }
  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern('G5_MATERIALIZATION_START_PLACE_AUDIT_NOT_PASSED', 'Stage 13 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character_audit?.pass !== true) {
    concerns.push(concern('G5_MATERIALIZATION_PLAYER_CHARACTER_AUDIT_NOT_PASSED', 'Stage 13 requires player_character_audit.pass=true.', { field: 'player_character_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('G5_MATERIALIZATION_PLAYER_CHARACTER_NOT_GAME_PROFILE', 'Stage 13 requires shaped player_character_game_profile.', { field: 'player_character.schema', severity: 'hard_block' }));
  }
  if (readSelectedScaleLevel(input.selected_start_node) !== 'G4') {
    concerns.push(concern('G5_MATERIALIZATION_SELECTED_SCALE_NOT_G4', 'Stage 13 requires selected_start_node.selected.selected_scale_level=G4.', { field: 'selected_start_node.selected.selected_scale_level', severity: 'hard_block' }));
  }
  if (!readSelectedChain(input.selected_start_node).g4_node_id) {
    concerns.push(concern('G5_MATERIALIZATION_SELECTED_G4_MISSING', 'Stage 13 requires selected_start_node.selected_node_chain.g4_node_id.', { field: 'selected_start_node.selected_node_chain.g4_node_id', severity: 'hard_block' }));
  }
  if (!readSelectedPlaceTemplateId(input.selected_start_node)) {
    concerns.push(concern('G5_MATERIALIZATION_PLACE_TEMPLATE_MISSING', 'Stage 13 requires selected_start_node.selected.selected_place_template_id.', { field: 'selected_start_node.selected.selected_place_template_id', severity: 'hard_block' }));
  }
  const filteredTemplates = filterAllowedG5Templates(input);
  if (filteredTemplates.length === 0) {
    concerns.push(concern('G5_MATERIALIZATION_NO_ALLOWED_TEMPLATES', 'Stage 13 requires non-empty allowed_g5_template_set after G4/status filtering.', { field: 'allowed_g5_template_set.allowed_g5_templates', severity: 'hard_block' }));
  }
  return concerns;
}
