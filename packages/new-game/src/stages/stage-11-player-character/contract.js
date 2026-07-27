import { STAGE11_GAME_PROFILE_SCHEMA, STAGE11_INPUT_SCHEMA, STAGE11_OUTPUT_SCHEMA } from './constants.js';
import { firstText, isPlainObject } from './shared.js';

export function buildStage11PlayerCharacterInput(context, options = {}) {
  return {
    version: 1,
    schema: STAGE11_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.requireStageOutput(2, 'normalized request'),
    historical_frame: options.historical_frame ?? context.requireStageOutput(3, 'historical frame'),
    regional_context_package: options.regional_context_package ?? context.requireStageOutput(4, 'regional context package'),
    selected_start_node: options.selected_start_node ?? context.requireStageOutput(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? context.requireStageOutput(10, 'start place audit'),
    npc_candidate_set: options.npc_candidate_set ?? context.requireStageOutput(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? context.requireStageOutput(8, 'item profile candidate set'),
    character_generation_policy: normalizeCharacterGenerationPolicy(options.character_generation_policy ?? options.policy ?? {})
  };
}

export function normalizeCharacterGenerationPolicy(policy = {}) {
  return {
    allow_random_if_unspecified: policy.allow_random_if_unspecified ?? true,
    preserve_player_intent_core: policy.preserve_player_intent_core ?? true,
    adapt_impossible_request_to_historical_frame: policy.adapt_impossible_request_to_historical_frame ?? true,
    require_social_role_from_candidate_set: policy.require_social_role_from_candidate_set ?? true,
    require_occupation_from_candidate_set: policy.require_occupation_from_candidate_set ?? true,
    require_inventory_from_item_profile_candidates: policy.require_inventory_from_item_profile_candidates ?? true,
    require_property_rules_for_inventory: policy.require_property_rules_for_inventory ?? true,
    require_reason_for_start_place: policy.require_reason_for_start_place ?? true,
    require_body_state: policy.require_body_state ?? true,
    require_character_knowledge_limits: policy.require_character_knowledge_limits ?? true,
    require_sources: policy.require_sources ?? true,
    do_not_create_intro_prose: policy.do_not_create_intro_prose ?? true,
    do_not_materialize_g5: policy.do_not_materialize_g5 ?? true,
    do_not_commit_to_party_db_yet: policy.do_not_commit_to_party_db_yet ?? true,
    allow_empty_or_minimal_inventory: policy.allow_empty_or_minimal_inventory ?? true,
    allow_abstract_background_relations: policy.allow_abstract_background_relations ?? true,
    temporary_source_trace_refs_allowed: policy.temporary_source_trace_refs_allowed ?? true,
    repair_required_for_missing_critical_item_profile: policy.repair_required_for_missing_critical_item_profile ?? true,
    ...(Object.hasOwn(policy, 'trace_player_profile_policy') && policy.trace_player_profile_policy !== null
      ? { trace_player_profile_policy: policy.trace_player_profile_policy }
      : {})
  };
}

export function shapePlayerCharacterGameProfile(dossier = {}, audit = {}, options = {}) {
  if (!isPlainObject(dossier)) {
    throw new Error('shapePlayerCharacterGameProfile requires player_character_dossier object.');
  }
  if (dossier.schema !== STAGE11_OUTPUT_SCHEMA) {
    throw new Error(`shapePlayerCharacterGameProfile expected ${STAGE11_OUTPUT_SCHEMA}.`);
  }
  if (audit?.pass !== true && audit?.approval_status !== 'approved_to_persist') {
    throw new Error('shapePlayerCharacterGameProfile requires successful player character audit.');
  }
  const characterId = firstText(
    dossier.identity?.character_id,
    dossier.character_id,
    dossier.player_character_id,
    'player_character_001'
  );
  return {
    version: 1,
    schema: STAGE11_GAME_PROFILE_SCHEMA,
    request_id: dossier.request_id ?? options.request_id ?? null,
    player_character_id: characterId,
    character_id: characterId,
    dossier_ref: {
      schema: STAGE11_OUTPUT_SCHEMA,
      character_id: characterId,
      source_trace: structuredClone(dossier.source_trace ?? [])
    },
    identity: structuredClone(dossier.identity ?? {}),
    social_status: structuredClone(dossier.social_status ?? {}),
    origin: structuredClone(dossier.origin ?? {}),
    body: structuredClone(dossier.body ?? {}),
    attributes: structuredClone(dossier.attributes ?? {}),
    skills: structuredClone(dossier.skills ?? {}),
    knowledge: structuredClone(dossier.knowledge ?? {}),
    memory: structuredClone(dossier.memory ?? {}),
    goals: structuredClone(dossier.goals ?? {}),
    inventory: structuredClone(dossier.inventory ?? {}),
    property_and_access: structuredClone(dossier.property_and_access ?? {}),
    relations: structuredClone(dossier.relations ?? {}),
    start_place_connection: structuredClone(dossier.start_place_connection ?? {}),
    constraints_and_risks: structuredClone(dossier.constraints_and_risks ?? {}),
    selected_candidate_refs: structuredClone(dossier.selected_candidate_refs ?? {}),
    source_trace: structuredClone(dossier.source_trace ?? []),
    approved_by_audit: structuredClone(audit),
    shaping_policy: {
      code_only: true,
      no_new_semantic_facts: true,
      no_inventory_creation: true,
      no_npc_creation: true,
      no_g5_materialization: true
    }
  };
}
