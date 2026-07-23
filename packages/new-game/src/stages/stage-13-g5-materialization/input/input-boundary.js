import { STAGE13_INPUT_SCHEMA } from '@rus/contracts';
import { concern, isPlainObject, readSelectedChain, readSelectedPlaceTemplateId, readSelectedScaleLevel } from '../../../g5-scene/shared.js';
import { filterAllowedG5Templates, normalizeAllowedG5TemplateSet } from '../../../g5-scene/templates.js';
import { normalizeStage13MaterializationPolicy } from '../policy/constants.js';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { buildAllowedG5TemplateSet } from '@rus/world-catalog-workflow';

export function buildStage13G5MaterializationInput(context, options = {}) {
  const selectedStartNode = options.selected_start_node
    ?? options.selectedStartNode
    ?? context.getStageOutput?.(9);
  const allowedG5TemplateSet = normalizeAllowedG5TemplateSet(
    options.allowed_g5_template_set
    ?? options.allowedG5TemplateSet
    ?? context.getStageOutput?.(1300)
    ?? buildRuntimeTemplateSet(context.runtimeCatalogContext, selectedStartNode)
    ?? {}
  );
  const input = {
    version: 1,
    schema: STAGE13_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? options.normalizedRequest ?? context.requireStageOutput?.(2, 'normalized request'),
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput?.(3, 'historical frame'),
    weather_state: options.weather_state ?? options.weatherState ?? context.getFrozenArtifactBySchema?.('weather_state')?.artifact ?? null,
    regional_context_package: options.regional_context_package ?? options.regionalContextPackage ?? context.requireStageOutput?.(4, 'regional context package'),
    selected_start_node: selectedStartNode ?? context.requireStageOutput?.(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? options.startPlaceAudit ?? context.requireStageOutput?.(10, 'start place audit'),
    player_character: options.player_character ?? options.playerCharacter ?? context.getStageOutput?.(1101) ?? context.requireStageOutput?.(11, 'player character'),
    player_character_audit: options.player_character_audit ?? options.playerCharacterAudit ?? context.requireStageOutput?.(12, 'player character audit'),
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput?.(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput?.(8, 'item profile candidate set'),
    allowed_g5_template_set: allowedG5TemplateSet,
    materialization_context: {
      party_id: options.party_id ?? options.party_creation_context?.party_id ?? context.partyId,
      g1_id: options.g1_id ?? readSelectedChain(options.selected_start_node ?? options.selectedStartNode ?? context.getStageOutput?.(9))?.g1_node_id,
      world_revision_id: options.world_revision_id ?? allowedG5TemplateSet.world_revision_id,
      region_id: options.region_id ?? (options.regional_context_package ?? options.regionalContextPackage ?? context.getStageOutput?.(4))?.region_id,
      year: options.year ?? (options.historical_frame ?? options.historicalFrame ?? context.getStageOutput?.(3))?.calendar?.year,
      season: options.season ?? (options.historical_frame ?? options.historicalFrame ?? context.getStageOutput?.(3))?.calendar?.season,
      trigger: options.trigger ?? 'new_game',
      occurrence: options.occurrence ?? 0,
      materializer_version: MATERIALIZER_VERSION,
      rng_version: RNG_VERSION
    },
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

function buildRuntimeTemplateSet(runtimeContext, selectedStartNode) {
  const records = runtimeContext?.applicable_catalog?.records_by_table;
  const pin = runtimeContext?.pin;
  const selectedChain = readSelectedChain(selectedStartNode);
  const graphNodeId = selectedChain.g4_node_id;
  if (!records || !pin || !graphNodeId) return null;
  return buildAllowedG5TemplateSet({
    records_by_table: records,
    graph_node_id: graphNodeId,
    world_revision_id: pin.compatible_world_revision_id,
    selected_g4_type_id: selectedStartNode?.selected?.selected_g4_type_id ?? null,
    source_catalog_digest: pin.catalog_digest
  });
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
    'materialization_context',
    'materialization_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('G5_MATERIALIZATION_INPUT_MISSING_BLOCK', `Stage 13 input.${field} must be an object.`, { field, severity: 'hard_block' }));
    }
  }
  const materializationContext = input.materialization_context;
  for (const field of ['party_id', 'g1_id', 'world_revision_id', 'region_id', 'season', 'trigger', 'materializer_version', 'rng_version']) {
    if (typeof materializationContext?.[field] !== 'string' || !materializationContext[field].trim()) concerns.push(concern('G5_MATERIALIZATION_CONTEXT_INVALID', `materialization_context.${field} is required.`, { field: `materialization_context.${field}`, severity: 'hard_block' }));
  }
  if (!Number.isInteger(materializationContext?.year)) concerns.push(concern('G5_MATERIALIZATION_CONTEXT_INVALID', 'materialization_context.year is required.', { field: 'materialization_context.year', severity: 'hard_block' }));
  if (materializationContext?.world_revision_id !== input.allowed_g5_template_set?.world_revision_id) concerns.push(concern('G5_MATERIALIZATION_CONTEXT_INVALID', 'materialization_context.world_revision_id must match the catalog snapshot.', { field: 'materialization_context.world_revision_id', severity: 'hard_block' }));
  if (!Number.isInteger(materializationContext?.occurrence) || materializationContext.occurrence < 0) concerns.push(concern('G5_MATERIALIZATION_CONTEXT_INVALID', 'materialization_context.occurrence must be a non-negative integer.', { field: 'materialization_context.occurrence', severity: 'hard_block' }));
  if (materializationContext?.materializer_version !== MATERIALIZER_VERSION || materializationContext?.rng_version !== RNG_VERSION) concerns.push(concern('G5_MATERIALIZATION_VERSION_PIN_MISMATCH', 'Stage 13 materializer/RNG pins are unsupported.', { field: 'materialization_context', severity: 'hard_block' }));
  if (materializationContext?.g1_id && materializationContext.g1_id !== readSelectedChain(input.selected_start_node).g1_node_id) concerns.push(concern('G5_MATERIALIZATION_CONTEXT_INVALID', 'materialization_context.g1_id must match selected node chain.', { field: 'materialization_context.g1_id', severity: 'hard_block' }));
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
