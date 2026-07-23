import { STAGE13_OUTPUT_SCHEMA, STAGE14_CODE_PRECHECK_SCHEMA, STAGE14_INPUT_SCHEMA } from '@rus/contracts';
import { normalizeStage14AuditPolicy } from '../policy/constants.js';
import { dedupeConcerns, isPlainObject, normalizeArray } from '../shared/utils.js';

export function buildStage14G5AuditInput(context, options = {}) {
  const draft = options.g5_scene_graph_draft ?? options.g5SceneGraphDraft ?? context.requireStageOutput?.(13, 'G5 scene graph draft');
  return {
    version: 1,
    schema: STAGE14_INPUT_SCHEMA,
    request_id: context.requestId,
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput?.(3, 'historical frame'),
    weather_state: options.weather_state ?? options.weatherState ?? context.getFrozenArtifactBySchema?.('weather_state')?.artifact ?? draft?.frame?.weather_state ?? null,
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput?.(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? options.startPlaceAudit ?? context.requireStageOutput?.(10, 'start place audit'),
    player_character: options.player_character ?? options.playerCharacter ?? context.getStageOutput?.(1101) ?? context.requireStageOutput?.(11, 'player character'),
    player_character_audit: options.player_character_audit ?? options.playerCharacterAudit ?? context.requireStageOutput?.(12, 'player character audit'),
    allowed_g5_template_set: normalizeAllowedG5TemplateSet(options.allowed_g5_template_set ?? options.allowedG5TemplateSet ?? context.getStageOutput?.(1300) ?? {}),
    g5_scene_graph_draft: draft,
    g5_scene_code_precheck: options.g5_scene_code_precheck ?? options.g5SceneCodePrecheck ?? context.getStageOutput?.(1301) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput?.(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput?.(8, 'item profile candidate set'),
    audit_policy: normalizeStage14AuditPolicy(options.audit_policy ?? options.policy ?? {})
  };
}

export function validateStage14G5AuditInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('G5_AUDIT_INPUT_SCHEMA_MISMATCH', 'Stage 14 input must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (input.version !== 1) {
    concerns.push(concern('G5_AUDIT_INPUT_VERSION_MISMATCH', 'Stage 14 input.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (input.schema !== STAGE14_INPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_INPUT_SCHEMA_MISMATCH', `Stage 14 input.schema must be ${STAGE14_INPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  for (const field of [
    'historical_frame',
    'selected_start_node',
    'start_place_audit',
    'player_character',
    'player_character_audit',
    'allowed_g5_template_set',
    'g5_scene_graph_draft',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'audit_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('G5_AUDIT_INPUT_REQUIRED_BLOCK_MISSING', `Stage 14 input.${field} is required.`, { field, severity: 'hard_block' }));
    }
  }
  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern('G5_AUDIT_START_PLACE_AUDIT_FAILED', 'Stage 14 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character_audit?.pass !== true) {
    concerns.push(concern('G5_AUDIT_PLAYER_CHARACTER_AUDIT_FAILED', 'Stage 14 requires player_character_audit.pass=true.', { field: 'player_character_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('G5_AUDIT_CHARACTER_SCHEMA_MISMATCH', 'Stage 14 requires player_character.schema=player_character_game_profile.', { field: 'player_character.schema', severity: 'hard_block' }));
  }
  if (input.g5_scene_graph_draft?.schema !== STAGE13_OUTPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_SCHEMA_MISMATCH', `Stage 14 requires g5_scene_graph_draft.schema=${STAGE13_OUTPUT_SCHEMA}.`, { field: 'g5_scene_graph_draft.schema', severity: 'hard_block' }));
  }
  if (input.g5_scene_graph_draft?.materialization_status !== 'materialized') {
    concerns.push(concern('G5_AUDIT_MATERIALIZATION_STATUS_INVALID', 'Stage 14 requires g5_scene_graph_draft.materialization_status=materialized.', { field: 'g5_scene_graph_draft.materialization_status', severity: 'hard_block' }));
  }
  if (input.g5_scene_code_precheck && input.g5_scene_code_precheck.schema !== STAGE14_CODE_PRECHECK_SCHEMA) {
    concerns.push(concern('G5_AUDIT_SCHEMA_MISMATCH', `Stage 14 g5_scene_code_precheck.schema must be ${STAGE14_CODE_PRECHECK_SCHEMA}.`, { field: 'g5_scene_code_precheck.schema', severity: 'hard_block' }));
  }
  if (!Array.isArray(input.allowed_g5_template_set?.allowed_g5_templates) || input.allowed_g5_template_set.allowed_g5_templates.length === 0) {
    concerns.push(concern('G5_AUDIT_ALLOWED_TEMPLATES_EMPTY', 'Stage 14 requires non-empty allowed_g5_template_set.allowed_g5_templates.', { field: 'allowed_g5_template_set.allowed_g5_templates', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

export function normalizeAllowedG5TemplateSet(value = {}) {
  return {
    version: value.version ?? 1,
    schema: value.schema ?? 'allowed_g5_template_set',
    selected_g4_type_id: value.selected_g4_type_id ?? value.g4_type_id ?? null,
    world_revision_id: value.world_revision_id ?? value.revision_id ?? null,
    source_catalog_digest: value.source_catalog_digest ?? null,
    catalog_digest: value.catalog_digest ?? null,
    allowed_g5_templates: normalizeArray(value.allowed_g5_templates ?? value.templates ?? value.g5_templates)
  };
}
