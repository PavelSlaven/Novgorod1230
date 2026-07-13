import { assertGatePassed, createGateResult } from '../gate.js';
import { createFrozenArtifactRecord } from '../lifecycle.js';

export const STAGE15_INPUT_SCHEMA = 'npc_placement_input';
export const STAGE15_DRAFT_SCHEMA = 'initial_npc_placement_draft';
export const STAGE15_AUDIT_SCHEMA = 'initial_npc_placement_audit';
export const STAGE15_PRECHECK_SCHEMA = 'initial_npc_placement_code_precheck';

export const STAGE15_PLACEMENT_STATUSES = Object.freeze([
  'placed',
  'empty_allowed',
  'blocked',
  'requires_repair'
]);

export const STAGE15_PROFILE_LEVELS = Object.freeze(['background', 'scene', 'key']);

export const DEFAULT_STAGE15_NPC_PLACEMENT_POLICY = Object.freeze({
  target_visible_background_npcs_min: 0,
  target_visible_background_npcs_max: 6,
  target_scene_npcs_min: 0,
  target_scene_npcs_max: 3,
  target_key_seed_npcs_max: 1,
  allow_empty_scene_if_place_supports_it: true,
  require_anchor_supports_npc: true,
  require_anchor_visibility_match: true,
  require_time_of_day_match: true,
  require_season_match: true,
  require_place_template_match: true,
  require_social_order_match: true,
  require_reason_for_presence: true,
  require_profile_level_limits: true,
  require_name_pool_for_named_scene_or_key_npc: true,
  allow_unnamed_background_npc: true,
  require_source_trace: true,
  do_not_write_intro_prose: true,
  do_not_create_dialogue: true,
  do_not_create_items_for_npc_yet: true,
  do_not_change_g5_scene: true,
  do_not_create_hidden_event: true,
  do_not_create_new_social_roles: true,
  do_not_create_new_occupations: true,
  do_not_create_new_npc_archetypes: true
});

const PROFILE_RANK = Object.freeze({ background: 1, scene: 2, key: 3, key_seed: 3 });
const FORMAT_CODES = new Set([
  'NPC_PLACEMENT_INVALID_JSON',
  'NPC_PLACEMENT_SCHEMA_MISMATCH',
  'NPC_PLACEMENT_REQUIRED_BLOCK_MISSING',
  'NPC_PLACEMENT_AUDIT_SCHEMA_MISMATCH',
  'NPC_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING'
]);

const FORBIDDEN_OUTPUT_KEYS = new Map([
  ['item_id', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['items', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['inventory', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['npc_inventory', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['container_contents', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['dialogue', 'NPC_PLACEMENT_CREATED_DIALOGUE_TOO_EARLY'],
  ['spoken_line', 'NPC_PLACEMENT_CREATED_DIALOGUE_TOO_EARLY'],
  ['visible_scene', 'NPC_PLACEMENT_CREATED_VISIBLE_SCENE_TOO_EARLY'],
  ['intro_prose', 'NPC_PLACEMENT_CREATED_INTRO_PROSE_TOO_EARLY'],
  ['narrator_prose', 'NPC_PLACEMENT_CREATED_INTRO_PROSE_TOO_EARLY'],
  ['hidden_event', 'NPC_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['quest', 'NPC_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['modified_g5_scene', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['g5_scene_graph_draft', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['new_anchor', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['new_edge', 'NPC_PLACEMENT_CHANGED_G5_SCENE']
]);

export function normalizeStage15NpcPlacementPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE15_NPC_PLACEMENT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}

export function buildStage15NpcPlacementInput(context, options = {}) {
  const explicit = isObject(options) ? options : {};
  const g5SceneGraph = explicit.g5_scene_graph
    ?? explicit.g5_scene_graph_draft
    ?? context?.getStageOutput?.(13)
    ?? null;
  const g5SceneAudit = explicit.g5_scene_audit
    ?? context?.getStageOutput?.(14)
    ?? null;

  return {
    version: 1,
    schema: STAGE15_INPUT_SCHEMA,
    request_id: explicit.request_id ?? context?.requestId ?? null,
    historical_frame: explicit.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: explicit.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    start_place_audit: explicit.start_place_audit ?? context?.getStageOutput?.(10) ?? null,
    player_character: explicit.player_character
      ?? context?.getStageOutput?.(1101)
      ?? context?.getStageOutput?.(11)
      ?? null,
    player_character_audit: explicit.player_character_audit ?? context?.getStageOutput?.(12) ?? null,
    g5_scene_graph: g5SceneGraph,
    g5_scene_audit: g5SceneAudit,
    npc_candidate_set: explicit.npc_candidate_set ?? context?.getStageOutput?.(7) ?? null,
    item_profile_candidate_set: explicit.item_profile_candidate_set ?? context?.getStageOutput?.(8) ?? null,
    npc_placement_policy: normalizeStage15NpcPlacementPolicy(
      explicit.npc_placement_policy ?? explicit.policy ?? {}
    )
  };
}

export function validateStage15NpcPlacementInput(input) {
  const concerns = [];
  if (!isObject(input)) return [concern('NPC_PLACEMENT_INVALID_JSON', 'Stage 15 input must be an object.')];
  if (input.version !== 1 || input.schema !== STAGE15_INPUT_SCHEMA) {
    concerns.push(concern('NPC_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE15_INPUT_SCHEMA} version 1.`));
  }
  requirePass(concerns, input.start_place_audit, 'start_place_audit', 'NPC_PLACEMENT_START_PLACE_AUDIT_FAILED');
  requirePass(concerns, input.player_character_audit, 'player_character_audit', 'NPC_PLACEMENT_PLAYER_AUDIT_FAILED');
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('NPC_PLACEMENT_PLAYER_PROFILE_INVALID', 'player_character must be a shaped player_character_game_profile.', { field: 'player_character.schema' }));
  }
  if (input.g5_scene_graph?.schema !== 'g5_scene_graph_draft' || input.g5_scene_graph?.materialization_status !== 'materialized') {
    concerns.push(concern('NPC_PLACEMENT_G5_SCENE_NOT_MATERIALIZED', 'g5_scene_graph must be a materialized g5_scene_graph_draft.', { field: 'g5_scene_graph' }));
  }
  if (input.g5_scene_audit?.schema !== 'g5_scene_audit' || input.g5_scene_audit?.pass !== true) {
    concerns.push(concern('NPC_PLACEMENT_G5_AUDIT_FAILED', 'g5_scene_audit must pass.', { field: 'g5_scene_audit' }));
  }
  if (input.g5_scene_audit?.commit_permission?.can_continue_to_npc_placement !== true) {
    concerns.push(concern('NPC_PLACEMENT_G5_PERMISSION_DENIED', 'Stage 14 did not permit NPC placement.', { field: 'g5_scene_audit.commit_permission.can_continue_to_npc_placement' }));
  }
  if (input.npc_candidate_set?.schema !== 'npc_candidate_set' || input.npc_candidate_set?.selection_status !== 'ready') {
    concerns.push(concern('NPC_PLACEMENT_CANDIDATE_SET_NOT_READY', 'npc_candidate_set must have selection_status=ready.', { field: 'npc_candidate_set' }));
  }
  if (!Array.isArray(input.npc_candidate_set?.npc_candidates)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'npc_candidate_set.npc_candidates must be an array.', { field: 'npc_candidate_set.npc_candidates' }));
  }
  if (!Array.isArray(input.g5_scene_graph?.g5_anchors)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'g5_scene_graph.g5_anchors must be an array.', { field: 'g5_scene_graph.g5_anchors' }));
  }
  if (!isObject(input.npc_placement_policy)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'npc_placement_policy is required.', { field: 'npc_placement_policy' }));
  }
  return concerns;
}

export function buildStage15CandidateIndex(input) {
  const candidates = input?.npc_candidate_set?.npc_candidates ?? [];
  const byId = new Map();
  const byProfileLevel = new Map();
  const byPlaceTemplateId = new Map();
  const byAnchorFunction = new Map();
  const bySocialRoleId = new Map();
  const byOccupationId = new Map();
  const byArchetypeId = new Map();
  const byNamePoolId = new Map();

  for (const candidate of candidates) {
    const id = candidateId(candidate);
    if (!id) continue;
    byId.set(id, candidate);
    indexMany(byProfileLevel, asArray(candidate.profile_level ?? candidate.allowed_profile_levels), candidate);
    indexMany(byPlaceTemplateId, candidatePlaceTemplateIds(candidate), candidate);
    indexMany(byAnchorFunction, asArray(candidate.anchor_functions ?? candidate.allowed_anchor_functions), candidate);
    indexMany(bySocialRoleId, asArray(candidate.social_role_id ?? candidate.social_role_ids), candidate);
    indexMany(byOccupationId, asArray(candidate.occupation_id ?? candidate.occupation_ids), candidate);
    indexMany(byArchetypeId, asArray(candidate.npc_archetype_id ?? candidate.npc_archetype_ids), candidate);
    indexMany(byNamePoolId, asArray(candidate.name_pool_ids ?? candidate.name_pool_id), candidate);
  }

  return {
    candidates,
    byId,
    byProfileLevel,
    byPlaceTemplateId,
    byAnchorFunction,
    bySocialRoleId,
    byOccupationId,
    byArchetypeId,
    byNamePoolId
  };
}

export function buildStage15AnchorIndex(input) {
  const anchors = input?.g5_scene_graph?.g5_anchors ?? [];
  const minilocations = input?.g5_scene_graph?.g5_minilocations ?? [];
  const byId = new Map();
  const minilocationById = new Map();
  const npcCapable = [];
  const visible = new Set();
  const audible = new Set();
  const hidden = new Set();
  const forbidden = new Set();
  const capacityById = new Map();

  for (const minilocation of minilocations) {
    const id = minilocationId(minilocation);
    if (id) minilocationById.set(id, minilocation);
  }
  for (const anchor of anchors) {
    const id = anchorId(anchor);
    if (!id) continue;
    byId.set(id, anchor);
    const visibility = anchorVisibility(anchor);
    if (visibility === 'visible' || visibility === 'visible_on_inspection') visible.add(id);
    if (visibility === 'audible') audible.add(id);
    if (visibility === 'hidden' || visibility === 'offscreen' || visibility === 'blocked') hidden.add(id);
    if (anchorAccess(anchor) === 'forbidden') forbidden.add(id);
    const capacity = normalizeCapacity(anchor);
    capacityById.set(id, capacity);
    if (anchorSupportsNpc(anchor) && !forbidden.has(id) && capacity > 0) npcCapable.push(anchor);
  }

  return {
    anchors,
    minilocations,
    byId,
    minilocationById,
    npcCapable,
    visible,
    audible,
    hidden,
    forbidden,
    capacityById
  };
}

export function filterStage15EligibleCandidates(input, indexes = buildStage15CandidateIndex(input)) {
  const selectedTemplateId = selectedPlaceTemplateId(input.selected_start_node);
  const season = input.historical_frame?.calendar?.season ?? null;
  const timeOfDay = input.historical_frame?.clock?.time_of_day ?? null;
  return indexes.candidates.filter((candidate) => {
    if (candidate.status === 'rejected' || candidate.status === 'conflict' || candidate.enabled === false) return false;
    const placeIds = candidatePlaceTemplateIds(candidate);
    if (selectedTemplateId && placeIds.length > 0 && !placeIds.includes(selectedTemplateId)) return false;
    if (!matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)) return false;
    if (!matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.allowed_time_of_day_values ?? candidate.time_of_day, timeOfDay)) return false;
    return true;
  });
}

export function filterStage15EligibleAnchors(input, indexes = buildStage15AnchorIndex(input)) {
  const selectedG4 = selectedG4NodeId(input.selected_start_node);
  return indexes.npcCapable.filter((anchor) => {
    const parentG4 = anchor.parent_g4_node_id ?? anchor.parent_location_id ?? input.g5_scene_graph?.parent_location?.g4_node_id;
    return !selectedG4 || !parentG4 || parentG4 === selectedG4;
  });
}

export function validateStage15NpcPlacementDraft(draft, input) {
  const concerns = [];
  if (!isObject(draft)) return [concern('NPC_PLACEMENT_INVALID_JSON', 'Initial NPC placement draft must be an object.')];
  if (draft.schema !== STAGE15_DRAFT_SCHEMA || draft.version !== 1) {
    concerns.push(concern('NPC_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE15_DRAFT_SCHEMA} version 1.`));
  }
  if (!STAGE15_PLACEMENT_STATUSES.includes(draft.placement_status)) {
    concerns.push(concern('NPC_PLACEMENT_STATUS_INVALID', 'placement_status is outside the allowed enum.', { field: 'placement_status' }));
  }
  if (draft.placement_status === 'blocked' || draft.placement_status === 'requires_repair') {
    concerns.push(concern('NPC_PLACEMENT_STATUS_NOT_COMMITTABLE', `placement_status=${draft.placement_status} cannot pass the Stage 15 commit gate.`, { field: 'placement_status' }));
  }
  if (draft.request_id !== input.request_id) {
    concerns.push(concern('NPC_PLACEMENT_REQUEST_ID_MISMATCH', 'request_id must match npc_placement_input.', { field: 'request_id' }));
  }

  const policy = input.npc_placement_policy ?? DEFAULT_STAGE15_NPC_PLACEMENT_POLICY;
  const candidateIndex = buildStage15CandidateIndex(input);
  const anchorIndex = buildStage15AnchorIndex(input);
  const selectedG4 = selectedG4NodeId(input.selected_start_node);
  const selectedTemplateId = selectedPlaceTemplateId(input.selected_start_node);
  const instances = Array.isArray(draft.npc_instances) ? draft.npc_instances : [];
  const instanceIds = new Set();
  const anchorUsage = new Map();

  if (!Array.isArray(draft.npc_instances)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'npc_instances must be an array.', { field: 'npc_instances' }));
  }
  if (draft.parent_scene?.g4_node_id !== selectedG4) {
    concerns.push(concern('NPC_PLACEMENT_ANCHOR_OUTSIDE_G4', 'parent_scene.g4_node_id must match selected G4.', { field: 'parent_scene.g4_node_id' }));
  }
  if (draft.parent_scene?.selected_place_template_id !== selectedTemplateId) {
    concerns.push(concern('NPC_PLACEMENT_PLACE_TEMPLATE_MISMATCH', 'parent_scene.selected_place_template_id must match selected place template.', { field: 'parent_scene.selected_place_template_id' }));
  }

  if (draft.placement_status === 'empty_allowed') {
    if (instances.length !== 0) concerns.push(concern('NPC_PLACEMENT_EMPTY_STATUS_WITH_NPCS', 'empty_allowed requires npc_instances=[]'));
    if (policy.allow_empty_scene_if_place_supports_it !== true) concerns.push(concern('NO_ALLOWED_NPC_PLACEMENT', 'Policy does not permit an empty scene.'));
    if (!hasText(draft.empty_scene_reason ?? draft.placement_reason) && !nonEmptyArray(draft.audit_self_check?.evidence)) {
      concerns.push(concern('NPC_PLACEMENT_EMPTY_REASON_MISSING', 'empty_allowed requires an explicit LLM reason/evidence.'));
    }
  }
  if (draft.placement_status === 'placed' && instances.length === 0) {
    concerns.push(concern('NO_ALLOWED_NPC_PLACEMENT', 'placement_status=placed requires at least one NPC instance.'));
  }

  for (let index = 0; index < instances.length; index += 1) {
    const npc = instances[index];
    const path = `npc_instances[${index}]`;
    const instanceId = npc?.npc_instance_id;
    if (!hasText(instanceId) || instanceIds.has(instanceId)) {
      concerns.push(concern('NPC_PLACEMENT_DUPLICATE_INSTANCE_ID', 'Each npc_instance_id must be non-empty and unique.', { field: `${path}.npc_instance_id` }));
    } else instanceIds.add(instanceId);

    const candidate = candidateIndex.byId.get(npc?.npc_candidate_id) ?? null;
    if (!candidate) {
      concerns.push(concern('NPC_PLACEMENT_CANDIDATE_NOT_FOUND', 'npc_candidate_id must exist in npc_candidate_set.', { field: `${path}.npc_candidate_id` }));
    }
    const candidateRecord = candidate ?? {};

    const profileLevel = normalizeProfileLevel(npc.profile_level);
    if (!STAGE15_PROFILE_LEVELS.includes(profileLevel)) {
      concerns.push(concern('NPC_PLACEMENT_PROFILE_LEVEL_NOT_ALLOWED', 'profile_level is invalid.', { field: `${path}.profile_level` }));
    } else if (policy.require_profile_level_limits === true && !candidateAllowsProfile(candidateRecord, profileLevel)) {
      concerns.push(concern('NPC_PLACEMENT_PROFILE_LEVEL_NOT_ALLOWED', 'profile_level exceeds candidate permission.', { field: `${path}.profile_level` }));
    }

    compareCandidateRef(concerns, npc?.base_refs?.social_role_id, candidateRecord.social_role_id ?? candidateRecord.social_role_ids, 'NPC_PLACEMENT_SOCIAL_ROLE_MISMATCH', `${path}.base_refs.social_role_id`);
    compareCandidateRef(concerns, npc?.base_refs?.occupation_id, candidateRecord.occupation_id ?? candidateRecord.occupation_ids, 'NPC_PLACEMENT_OCCUPATION_MISMATCH', `${path}.base_refs.occupation_id`, true);
    compareCandidateRef(concerns, npc?.base_refs?.npc_archetype_id, candidateRecord.npc_archetype_id ?? candidateRecord.npc_archetype_ids, 'NPC_PLACEMENT_ARCHETYPE_MISMATCH', `${path}.base_refs.npc_archetype_id`);

    if (profileLevel === 'key' && !hasKeySeed(npc, candidateRecord)) {
      concerns.push(concern('NPC_PLACEMENT_KEY_SEED_MISSING', 'Key NPC requires an allowed key_npc_seed_id/persistence basis.', { field: `${path}.base_refs.key_npc_seed_id` }));
    }

    const placement = npc?.placement ?? {};
    const anchor = anchorIndex.byId.get(placement.g5_anchor_id);
    const minilocation = anchorIndex.minilocationById.get(placement.g5_minilocation_id);
    if (!anchor) concerns.push(concern('NPC_PLACEMENT_ANCHOR_NOT_FOUND', 'g5_anchor_id must exist.', { field: `${path}.placement.g5_anchor_id` }));
    if (!minilocation) concerns.push(concern('NPC_PLACEMENT_MINILOCATION_NOT_FOUND', 'g5_minilocation_id must exist.', { field: `${path}.placement.g5_minilocation_id` }));
    if (anchor && !anchorSupportsNpc(anchor)) concerns.push(concern('NPC_PLACEMENT_ANCHOR_CANNOT_HOLD_NPC', 'Anchor must support can_hold_npc=true.', { field: `${path}.placement.g5_anchor_id` }));
    if (anchor && anchorAccess(anchor) === 'forbidden') concerns.push(concern('NPC_PLACEMENT_ANCHOR_ACCESS_FORBIDDEN', 'NPC cannot be placed on a forbidden anchor.', { field: `${path}.placement.g5_anchor_id` }));
    const anchorMiniloc = anchor?.parent_minilocation_id ?? anchor?.minilocation_id;
    if (anchor && anchorMiniloc && placement.g5_minilocation_id !== anchorMiniloc) {
      concerns.push(concern('NPC_PLACEMENT_MINILOCATION_NOT_FOUND', 'NPC minilocation must match anchor parent minilocation.', { field: `${path}.placement.g5_minilocation_id` }));
    }
    if (placement.parent_g4_node_id !== selectedG4 || (anchor?.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4)) {
      concerns.push(concern('NPC_PLACEMENT_ANCHOR_OUTSIDE_G4', 'NPC and anchor must belong to selected G4.', { field: `${path}.placement.parent_g4_node_id` }));
    }
    if (anchor) {
      const used = (anchorUsage.get(placement.g5_anchor_id) ?? 0) + 1;
      anchorUsage.set(placement.g5_anchor_id, used);
      if (used > (anchorIndex.capacityById.get(placement.g5_anchor_id) ?? 1)) {
        concerns.push(concern('NPC_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED', 'Anchor NPC capacity was exceeded.', { field: `${path}.placement.g5_anchor_id` }));
      }
    }

    if (policy.require_reason_for_presence === true && !hasText(placement.presence_reason)) {
      concerns.push(concern('NPC_PLACEMENT_PRESENCE_REASON_MISSING', 'NPC presence_reason is required.', { field: `${path}.placement.presence_reason` }));
    }
    if (!candidateMatchesSelectedPlace(candidateRecord, selectedTemplateId)) concerns.push(concern('NPC_PLACEMENT_PLACE_TEMPLATE_MISMATCH', 'NPC candidate is not compatible with selected place template.', { field: `${path}.npc_candidate_id` }));
    if (!candidateMatchesSeason(candidateRecord, input.historical_frame?.calendar?.season)) concerns.push(concern('NPC_PLACEMENT_SEASON_CONFLICT', 'NPC candidate is incompatible with season.', { field: `${path}.npc_candidate_id` }));
    if (!candidateMatchesTime(candidateRecord, input.historical_frame?.clock?.time_of_day)) concerns.push(concern('NPC_PLACEMENT_TIME_OF_DAY_CONFLICT', 'NPC candidate is incompatible with time_of_day.', { field: `${path}.npc_candidate_id` }));

    if (anchor) validateNpcVisibility(concerns, npc, anchor, input, path);
    validateNpcIdentity(concerns, npc, candidateRecord, profileLevel, policy, path);
    validateNpcDepth(concerns, npc, profileLevel, candidateRecord, path);
    validateNpcKnowledge(concerns, npc, path);
    validateResourceHints(concerns, npc, input, path);

    if (policy.require_source_trace === true && !nonEmptyArray(npc?.source_trace)) {
      concerns.push(concern('NPC_PLACEMENT_SOURCE_MISSING', 'Each NPC requires non-empty source_trace.', { field: `${path}.source_trace` }));
    }
  }

  validateBindingArrays(concerns, draft, instanceIds, anchorIndex);
  collectForbiddenFields(draft, concerns);
  if (policy.require_source_trace === true && !nonEmptyArray(draft.source_trace)) concerns.push(concern('NPC_PLACEMENT_SOURCE_MISSING', 'Draft source_trace must not be empty.', { field: 'source_trace' }));
  if (!nonEmptyArray(draft.audit_self_check?.evidence)) concerns.push(concern('NPC_PLACEMENT_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', { field: 'audit_self_check.evidence' }));
  if (draft.audit_self_check?.pass === false && !nonEmptyArray(draft.audit_self_check?.concerns)) concerns.push(concern('NPC_PLACEMENT_SELF_CHECK_INVALID', 'Failed audit_self_check requires concerns.', { field: 'audit_self_check.concerns' }));
  return dedupeConcerns(concerns);
}

export function buildStage15NpcPlacementCodePrecheck(draft, input) {
  const concerns = validateStage15NpcPlacementDraft(draft, input);
  const codes = new Set(concerns.map((item) => item.code));
  const checks = {
    schema_valid: !hasAny(codes, ['NPC_PLACEMENT_INVALID_JSON', 'NPC_PLACEMENT_SCHEMA_MISMATCH', 'NPC_PLACEMENT_REQUIRED_BLOCK_MISSING']),
    placement_status_valid: !hasAny(codes, ['NPC_PLACEMENT_STATUS_INVALID', 'NPC_PLACEMENT_STATUS_NOT_COMMITTABLE']),
    all_npc_candidates_exist: !codes.has('NPC_PLACEMENT_CANDIDATE_NOT_FOUND'),
    all_profile_levels_valid: !codes.has('NPC_PLACEMENT_PROFILE_LEVEL_NOT_ALLOWED'),
    all_anchors_exist: !codes.has('NPC_PLACEMENT_ANCHOR_NOT_FOUND'),
    all_anchors_support_npc: !hasAny(codes, ['NPC_PLACEMENT_ANCHOR_CANNOT_HOLD_NPC', 'NPC_PLACEMENT_ANCHOR_ACCESS_FORBIDDEN', 'NPC_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED']),
    all_minilocations_exist: !codes.has('NPC_PLACEMENT_MINILOCATION_NOT_FOUND'),
    selected_g4_match: !codes.has('NPC_PLACEMENT_ANCHOR_OUTSIDE_G4'),
    place_template_match: !codes.has('NPC_PLACEMENT_PLACE_TEMPLATE_MISMATCH'),
    time_and_season_valid: !hasAny(codes, ['NPC_PLACEMENT_TIME_OF_DAY_CONFLICT', 'NPC_PLACEMENT_SEASON_CONFLICT']),
    visibility_valid: !hasAny(codes, ['NPC_PLACEMENT_VISIBILITY_CONFLICT', 'NPC_PLACEMENT_HIDDEN_NPC_VISIBLE']),
    name_pool_refs_valid: !codes.has('NPC_PLACEMENT_NAME_POOL_MISSING'),
    no_items_created: !codes.has('NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'),
    no_dialogue_created: !codes.has('NPC_PLACEMENT_CREATED_DIALOGUE_TOO_EARLY'),
    no_prose_created: !hasAny(codes, ['NPC_PLACEMENT_CREATED_VISIBLE_SCENE_TOO_EARLY', 'NPC_PLACEMENT_CREATED_INTRO_PROSE_TOO_EARLY']),
    g5_scene_unchanged: !codes.has('NPC_PLACEMENT_CHANGED_G5_SCENE'),
    source_trace_present: !codes.has('NPC_PLACEMENT_SOURCE_MISSING'),
    audit_self_check_evidence_present: !codes.has('NPC_PLACEMENT_EMPTY_AUDIT_EVIDENCE')
  };
  return {
    version: 1,
    schema: STAGE15_PRECHECK_SCHEMA,
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: Object.entries(checks).map(([check, pass]) => ({ check, pass }))
  };
}

export function buildStage15NpcPlacementAuditInput(input, draft, codePrecheck) {
  return {
    version: 1,
    schema: 'initial_npc_placement_audit_input',
    request_id: input.request_id,
    historical_frame: input.historical_frame,
    selected_start_node: input.selected_start_node,
    player_character: input.player_character,
    g5_scene_graph: input.g5_scene_graph,
    g5_scene_audit: input.g5_scene_audit,
    npc_candidate_set: input.npc_candidate_set,
    item_profile_candidate_set: input.item_profile_candidate_set,
    npc_placement_policy: input.npc_placement_policy,
    initial_npc_placement_draft: draft,
    initial_npc_placement_code_precheck: codePrecheck
  };
}

export function validateStage15NpcPlacementAudit(audit, draft, input) {
  const concerns = [];
  if (!isObject(audit)) return [concern('NPC_PLACEMENT_AUDIT_INVALID_JSON', 'NPC placement audit must be an object.')];
  if (audit.schema !== STAGE15_AUDIT_SCHEMA || audit.version !== 1) concerns.push(concern('NPC_PLACEMENT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE15_AUDIT_SCHEMA} version 1.`));
  if (typeof audit.pass !== 'boolean') concerns.push(concern('NPC_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'Audit pass must be boolean.', { field: 'pass' }));
  if (!nonEmptyArray(audit.evidence)) concerns.push(concern('NPC_PLACEMENT_EMPTY_AUDIT_EVIDENCE', 'Audit evidence must not be empty.', { field: 'evidence' }));
  if (audit.pass === false && !nonEmptyArray(audit.concerns)) concerns.push(concern('NPC_PLACEMENT_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', { field: 'concerns' }));
  if (audit.pass === false && !isObject(audit.repair_route)) concerns.push(concern('NPC_PLACEMENT_AUDIT_REPAIR_ROUTE_MISSING', 'Failed audit requires repair_route.', { field: 'repair_route' }));
  if (audit.pass === true && audit.repair_route != null) concerns.push(concern('NPC_PLACEMENT_AUDIT_REPAIR_ROUTE_INVALID', 'Passed audit must have repair_route=null.', { field: 'repair_route' }));
  validateStage15AuditCommitPermission(concerns, audit);
  if (audit.request_id != null && audit.request_id !== input.request_id) concerns.push(concern('NPC_PLACEMENT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', { field: 'request_id' }));
  for (const key of ['initial_npc_placement_draft', 'modified_draft', 'npc_instances', 'new_npcs', 'new_anchors', 'new_edges', 'items', 'dialogue', 'visible_scene', 'intro_prose', 'hidden_event']) {
    if (Object.prototype.hasOwnProperty.call(audit, key)) concerns.push(concern('NPC_PLACEMENT_AUDIT_MUTATED_OUTPUT', `Audit must not contain ${key}.`, { field: key }));
  }
  if (audit.pass === true && validateStage15NpcPlacementDraft(draft, input).length > 0) concerns.push(concern('NPC_PLACEMENT_AUDIT_APPROVED_INVALID_DRAFT', 'Audit cannot pass an invalid placement draft.'));
  return dedupeConcerns(concerns);
}

export async function runStage15NpcPlacementBlock({
  input,
  place,
  audit,
  formatRepair = null,
  semanticRepair = null
} = {}) {
  const inputConcerns = validateStage15NpcPlacementInput(input);
  if (inputConcerns.length > 0) throw stage15Error('Stage 15 input gate failed.', inputConcerns, routeForInputConcerns(inputConcerns));

  const candidateIndex = buildStage15CandidateIndex(input);
  const anchorIndex = buildStage15AnchorIndex(input);
  const eligibleCandidates = filterStage15EligibleCandidates(input, candidateIndex);
  const eligibleAnchors = filterStage15EligibleAnchors(input, anchorIndex);

  if (eligibleAnchors.length === 0) {
    throw stage15Error('No valid G5 anchor can hold an NPC.', [concern('NO_ALLOWED_NPC_PLACEMENT', 'No existing allowed G5 anchor supports NPC placement.')], {
      repair_kind: 'semantic',
      return_to_stage: 13,
      rerun_from_stage: 13,
      reason_code: 'NO_ALLOWED_NPC_ANCHOR'
    });
  }

  const placerInput = {
    ...input,
    eligible_npc_candidates: eligibleCandidates,
    eligible_g5_anchors: eligibleAnchors
  };

  let draft = await callJsonRole(place, placerInput, 'InitialNpcPlacer');
  let precheck = buildStage15NpcPlacementCodePrecheck(draft, input);

  if (!precheck.pass && typeof formatRepair === 'function' && precheck.concerns.some((item) => FORMAT_CODES.has(item.code))) {
    draft = await callJsonRole(formatRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialNpcPlacementFormatRepairer');
    precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass && typeof semanticRepair === 'function') {
    draft = await callJsonRole(semanticRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialNpcPlacementSemanticRepairer');
    precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass) {
    throw stage15Error('Initial NPC placement draft failed code precheck.', precheck.concerns, routeForDraftConcerns(precheck.concerns), { draft, code_precheck: precheck });
  }

  let auditOutput = await callJsonRole(audit, buildStage15NpcPlacementAuditInput(input, draft, precheck), 'InitialNpcPlacementAuditor');
  let auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
  if (auditConcerns.length > 0 && typeof formatRepair === 'function') {
    auditOutput = await callJsonRole(formatRepair, { input, draft, audit: auditOutput, validation_errors: auditConcerns }, 'InitialNpcPlacementFormatRepairer');
    auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
  }
  if (auditConcerns.length > 0) {
    throw stage15Error('Initial NPC placement audit output is invalid.', auditConcerns, {
      repair_kind: 'format',
      return_to_stage: 15,
      rerun_from_stage: 15,
      reason_code: 'NPC_PLACEMENT_AUDIT_FORMAT_INVALID'
    }, { draft, code_precheck: precheck, audit: auditOutput });
  }
  if (auditOutput.pass !== true) {
    if (typeof semanticRepair === 'function') {
      draft = await callJsonRole(semanticRepair, { input, draft, audit_concerns: auditOutput.concerns }, 'InitialNpcPlacementSemanticRepairer');
      precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
      if (precheck.pass) {
        auditOutput = await callJsonRole(audit, buildStage15NpcPlacementAuditInput(input, draft, precheck), 'InitialNpcPlacementAuditor');
        auditConcerns = validateStage15NpcPlacementAudit(auditOutput, draft, input);
      }
    }
    if (auditOutput.pass !== true || auditConcerns.length > 0) {
      throw stage15Error('Initial NPC placement semantic audit failed.', auditOutput.concerns ?? auditConcerns, normalizeAuditRepairRoute(auditOutput.repair_route), { draft, code_precheck: precheck, audit: auditOutput });
    }
  }

  return {
    pass: true,
    draft,
    code_precheck: precheck,
    audit: auditOutput,
    eligible_candidate_count: eligibleCandidates.length,
    eligible_anchor_count: eligibleAnchors.length
  };
}

export async function runStage15NpcPlacement(context, options = {}) {
  const input = options.input?.schema === STAGE15_INPUT_SCHEMA
    ? options.input
    : buildStage15NpcPlacementInput(context, options.input ?? options);

  const providedDraft = options.providedDraft ?? options.stageOutputs?.[15] ?? options.stageOutputs?.npc_placement ?? null;
  const providedAudit = options.providedAudit
    ?? options.stageOutputs?.[1502]
    ?? options.stageOutputs?.initial_npc_placement_audit
    ?? providedDraft?.initial_npc_placement_audit
    ?? null;

  let result;
  if (providedDraft) {
    rejectProductionProvidedStage15(context, options);
    const draft = providedDraft.initial_npc_placement_draft ?? providedDraft;
    const precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
    const auditConcerns = validateStage15NpcPlacementAudit(providedAudit, draft, input);
    if (!precheck.pass || auditConcerns.length > 0 || providedAudit?.pass !== true) {
      throw stage15Error('Provided Stage 15 output failed validation.', [...precheck.concerns, ...auditConcerns], {
        repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'PROVIDED_STAGE15_INVALID'
      });
    }
    result = { pass: true, draft, code_precheck: precheck, audit: providedAudit };
  } else {
    const executor = options.executor;
    if (typeof executor !== 'function') throw new Error('Stage 15 requires an executor.');
    const roleCall = (role) => async (roleInput) => executor({
      context,
      input: roleInput,
      stage: {
        id: 15,
        slug: 'npc_placement',
        role,
        output_schema: role === 'InitialNpcPlacementAuditor' ? STAGE15_AUDIT_SCHEMA : STAGE15_DRAFT_SCHEMA,
        spec_file: '15.txt'
      }
    });
    result = await runStage15NpcPlacementBlock({
      input,
      place: options.place ?? roleCall('InitialNpcPlacer'),
      audit: options.audit ?? roleCall('InitialNpcPlacementAuditor'),
      formatRepair: options.formatRepair ?? roleCall('InitialNpcPlacementFormatRepairer'),
      semanticRepair: options.semanticRepair ?? roleCall('InitialNpcPlacementSemanticRepairer')
    });
  }

  commitStage15Artifacts(context, result, input);
  return result.draft;
}

export function commitStage15Artifacts(context, result, input) {
  const gate = createGateResult({
    stageId: 15,
    stageSlug: 'npc_placement',
    gateKind: 'commit_ready_artifact',
    pass: result.pass === true
      && result.code_precheck?.pass === true
      && result.audit?.pass === true
      && result.audit?.commit_permission?.can_continue_to_item_placement === true,
    concerns: result.pass === true ? [] : (result.code_precheck?.concerns ?? result.audit?.concerns ?? []),
    evidence: [
      ...(result.code_precheck?.evidence ?? []),
      ...(result.audit?.evidence ?? [])
    ]
  });
  context.setGateResult(15, gate);
  assertGatePassed(gate);
  context.setStageOutput(15, result.draft);
  context.setStageOutput(1501, result.code_precheck);
  context.setStageOutput(1502, result.audit);
  context.setLifecycleState(15, {
    stage_id: 15,
    stage_slug: 'npc_placement',
    stage_type: 'semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.draft),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.audit),
    pre_dependency_gate: createGateResult({ stageId: 15, stageSlug: 'npc_placement', gateKind: 'pre_dependency_gate', pass: true }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freeze(context, 15, 'npc_placement', result.draft, 'passed', 'passed');
  freeze(context, 1501, 'npc_placement_code_precheck', result.code_precheck, 'passed', 'not_required');
  freeze(context, 1502, 'npc_placement_audit', result.audit, 'passed', 'passed');
  context.note(15, { label: 'npc_placement', message: 'npc_placement ready', responseRaw: { gate } });
}

function freeze(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact,
    stageId,
    stageSlug,
    schema: artifact.schema,
    version: artifact.version ?? 1,
    producedBy: stageSlug,
    validationStatus,
    auditStatus,
    dependencyStatus: 'passed'
  }));
}

function rejectProductionProvidedStage15(context, options) {
  if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
    throw new Error('Provided stage 15 output is disabled in production unless allowProvidedStageOutputs=true.');
  }
}

function stage15Error(message, concerns, route, snapshots = {}) {
  const error = new Error(message);
  error.lifecycle = {
    stage_id: 15,
    stage_slug: 'npc_placement',
    stage_type: 'semantic_generation',
    failed_gate: route?.repair_kind === 'format' ? 'structural_validation' : 'semantic_validation',
    concerns: concerns ?? [],
    terminal_status: 'stage_failed',
    ...snapshots
  };
  error.semanticRecoveryRoute = route;
  return error;
}

function routeForInputConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('NPC_PLACEMENT_G5_SCENE_NOT_MATERIALIZED')) return { repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'G5_SCENE_INVALID' };
  if (codes.has('NPC_PLACEMENT_G5_AUDIT_FAILED') || codes.has('NPC_PLACEMENT_G5_PERMISSION_DENIED')) return { repair_kind: 'semantic', return_to_stage: 14, rerun_from_stage: 14, reason_code: 'G5_AUDIT_NOT_APPROVED' };
  if (codes.has('NPC_PLACEMENT_CANDIDATE_SET_NOT_READY')) return { repair_kind: 'semantic', return_to_stage: 7, rerun_from_stage: 7, reason_code: 'NPC_CANDIDATE_SET_NOT_READY' };
  return { repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_INPUT_INVALID' };
}

function routeForDraftConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('NPC_PLACEMENT_ANCHOR_NOT_FOUND') || codes.has('NPC_PLACEMENT_ANCHOR_CANNOT_HOLD_NPC') || codes.has('NPC_PLACEMENT_ANCHOR_OUTSIDE_G4')) {
    return { repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'G5_ANCHOR_INVALID' };
  }
  if (codes.has('NPC_PLACEMENT_CANDIDATE_NOT_FOUND')) return { repair_kind: 'semantic', return_to_stage: 7, rerun_from_stage: 7, reason_code: 'NPC_CANDIDATE_NOT_FOUND' };
  if ([...codes].some((code) => FORMAT_CODES.has(code))) return { repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_FORMAT_INVALID' };
  return { repair_kind: 'semantic', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_SEMANTIC_INVALID' };
}

function normalizeAuditRepairRoute(route) {
  if (isObject(route)) return {
    repair_kind: route.repair_kind ?? 'semantic',
    return_to_stage: Number(route.return_to_stage ?? 15),
    rerun_from_stage: Number(route.rerun_from_stage ?? route.return_to_stage ?? 15),
    reason_code: route.reason_code ?? 'NPC_PLACEMENT_AUDIT_FAILED'
  };
  return { repair_kind: 'semantic', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_AUDIT_FAILED' };
}

async function callJsonRole(callback, input, role) {
  if (typeof callback !== 'function') throw new Error(`${role} callback is required.`);
  const raw = await callback(input);
  const candidate = raw?.output ?? raw?.parsed_output ?? raw;
  if (typeof candidate === 'string') {
    try { return JSON.parse(candidate); } catch (error) {
      const failure = stage15Error(`${role} returned invalid JSON.`, [concern('NPC_PLACEMENT_INVALID_JSON', error.message)], {
        repair_kind: 'format', return_to_stage: 15, rerun_from_stage: 15, reason_code: 'NPC_PLACEMENT_INVALID_JSON'
      });
      failure.raw_output = candidate;
      throw failure;
    }
  }
  return candidate;
}


function validateStage15AuditCommitPermission(concerns, audit) {
  const permission = audit?.commit_permission;
  if (!isObject(permission)) {
    concerns.push(concern('NPC_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'commit_permission is required.', { field: 'commit_permission' }));
    return;
  }
  const keys = ['can_commit_npc_instances', 'can_continue_to_item_placement', 'can_continue_to_visible_context'];
  for (const key of keys) {
    if (typeof permission[key] !== 'boolean') concerns.push(concern('NPC_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', `commit_permission.${key} must be boolean.`, { field: `commit_permission.${key}` }));
  }
  if (audit.pass === true) {
    if (permission.can_commit_npc_instances !== true) concerns.push(concern('NPC_PLACEMENT_AUDIT_PERMISSION_INVALID', 'can_commit_npc_instances must be true when audit passes.', { field: 'commit_permission.can_commit_npc_instances' }));
    if (permission.can_continue_to_item_placement !== true) concerns.push(concern('NPC_PLACEMENT_AUDIT_PERMISSION_INVALID', 'can_continue_to_item_placement must be true when audit passes.', { field: 'commit_permission.can_continue_to_item_placement' }));
    if (permission.can_continue_to_visible_context !== false) concerns.push(concern('NPC_PLACEMENT_AUDIT_PERMISSION_INVALID', 'Stage 15 must not directly permit visible context.', { field: 'commit_permission.can_continue_to_visible_context' }));
  } else if (keys.some((key) => permission[key] !== false)) {
    concerns.push(concern('NPC_PLACEMENT_AUDIT_PERMISSION_INVALID', 'All commit permissions must be false when audit fails.', { field: 'commit_permission' }));
  }
}

function validateNpcVisibility(concerns, npc, anchor, input, path) {
  const state = npc?.visibility_state ?? {};
  const anchorState = anchorVisibility(anchor);
  const visible = state.visible_to_player === true;
  const hidden = state.hidden_from_player === true;
  if (visible && (anchorState === 'hidden' || anchorState === 'offscreen' || anchorState === 'blocked') && !hasText(state.visibility_basis)) {
    concerns.push(concern('NPC_PLACEMENT_HIDDEN_NPC_VISIBLE', 'Hidden/offscreen anchor cannot produce a visible NPC without explicit basis.', { field: `${path}.visibility_state` }));
  }
  if (visible && hidden) concerns.push(concern('NPC_PLACEMENT_VISIBILITY_CONFLICT', 'NPC cannot be both visible and hidden.', { field: `${path}.visibility_state` }));
  if (input.historical_frame?.clock?.light_profile === 'dark' && visible && state.requires_approach !== true && !hasText(state.visibility_basis)) {
    concerns.push(concern('NPC_PLACEMENT_VISIBILITY_CONFLICT', 'Dark light requires approach/light/visibility justification.', { field: `${path}.visibility_state.visibility_basis` }));
  }
}

function validateNpcIdentity(concerns, npc, candidateRecord, profileLevel, policy, path) {
  const identity = npc?.identity ?? {};
  const named = hasText(identity.name) || ['known_name', 'nickname'].includes(identity.name_status);
  const allowedPools = asArray(candidateRecord.name_pool_ids ?? candidateRecord.name_pool_id);
  if (named && policy.require_name_pool_for_named_scene_or_key_npc === true && !hasText(identity.name_pool_id)) {
    concerns.push(concern('NPC_PLACEMENT_NAME_POOL_MISSING', 'Named NPC requires name_pool_id.', { field: `${path}.identity.name_pool_id` }));
  } else if (named && allowedPools.length > 0 && !allowedPools.includes(identity.name_pool_id)) {
    concerns.push(concern('NPC_PLACEMENT_NAME_POOL_MISSING', 'name_pool_id is not allowed by candidate.', { field: `${path}.identity.name_pool_id` }));
  }
  if (identity.identity_known_to_player === false && hasText(identity.name) && identity.name_status === 'known_name') {
    concerns.push(concern('NPC_PLACEMENT_VISIBILITY_CONFLICT', 'Unknown NPC identity cannot expose a known full name.', { field: `${path}.identity` }));
  }
  if (profileLevel === 'background' && !named && policy.allow_unnamed_background_npc !== true) {
    concerns.push(concern('NPC_PLACEMENT_NAME_POOL_MISSING', 'Unnamed background NPC is not permitted by policy.', { field: `${path}.identity` }));
  }
}

function validateNpcDepth(concerns, npc, profileLevel, candidateRecord, path) {
  if (profileLevel === 'background') {
    for (const key of ['biography', 'full_biography', 'life_history', 'persistent_memory_profile', 'long_term_relationships']) {
      if (npc?.[key] != null) concerns.push(concern('NPC_PLACEMENT_BACKGROUND_PROFILE_TOO_DEEP', `Background NPC cannot contain ${key}.`, { field: `${path}.${key}` }));
    }
  }
  if (profileLevel === 'scene' && !isObject(npc?.interaction_state)) {
    concerns.push(concern('NPC_PLACEMENT_SCENE_PROFILE_TOO_SHALLOW', 'Scene NPC requires interaction_state.', { field: `${path}.interaction_state` }));
  }
  if (profileLevel === 'key' && !hasKeySeed(npc, candidateRecord)) {
    concerns.push(concern('NPC_PLACEMENT_KEY_PROFILE_WITHOUT_PERSISTENCE_BASIS', 'Key NPC requires persistence basis.', { field: `${path}.base_refs.key_npc_seed_id` }));
  }
}

function validateNpcKnowledge(concerns, npc, path) {
  const facts = [
    ...asArray(npc?.knowledge_scope?.known_facts_now),
    ...asArray(npc?.knowledge_scope?.rumors_now),
    ...asArray(npc?.knowledge_scope?.mistaken_beliefs)
  ];
  for (const fact of facts) {
    if (isObject(fact) && ['hidden', 'player_only', 'future'].includes(fact.visibility_scope ?? fact.scope)) {
      concerns.push(concern('NPC_PLACEMENT_KNOWLEDGE_LEAK', 'NPC knowledge contains hidden/player-only/future fact.', { field: `${path}.knowledge_scope` }));
    }
  }
}

function validateResourceHints(concerns, npc, input, path) {
  const hints = npc?.npc_resource_hints;
  if (!isObject(hints)) return;
  const allowed = new Set((input.item_profile_candidate_set?.item_profile_candidates ?? input.item_profile_candidate_set?.candidates ?? []).map((item) => item.item_profile_candidate_id ?? item.candidate_id ?? item.id).filter(Boolean));
  for (const field of ['may_control_item_profile_candidate_ids', 'may_hold_item_profile_candidate_ids', 'may_guard_container_profile_candidate_ids']) {
    for (const id of asArray(hints[field])) {
      if (allowed.size > 0 && !allowed.has(id)) concerns.push(concern('NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY', 'Resource hint must reference item_profile_candidate_set.', { field: `${path}.npc_resource_hints.${field}` }));
    }
  }
}

function validateBindingArrays(concerns, draft, instanceIds, anchorIndex) {
  for (const [field, items] of Object.entries({
    npc_anchor_bindings: draft.npc_anchor_bindings,
    npc_visibility_state: draft.npc_visibility_state,
    npc_attention_and_witness_state: draft.npc_attention_and_witness_state,
    npc_schedule_state: draft.npc_schedule_state
  })) {
    if (!Array.isArray(items)) {
      concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} must be an array.`, { field }));
      continue;
    }
    items.forEach((item, index) => {
      if (!instanceIds.has(item?.npc_instance_id)) concerns.push(concern('NPC_PLACEMENT_CANDIDATE_NOT_FOUND', `${field} references unknown npc_instance_id.`, { field: `${field}[${index}].npc_instance_id` }));
      if (field === 'npc_anchor_bindings' && !anchorIndex.byId.has(item?.g5_anchor_id)) concerns.push(concern('NPC_PLACEMENT_ANCHOR_NOT_FOUND', 'npc_anchor_binding references unknown anchor.', { field: `${field}[${index}].g5_anchor_id` }));
    });
  }
}

function collectForbiddenFields(value, concerns, path = 'root', seen = new WeakSet()) {
  if (!isObject(value) && !Array.isArray(value)) return;
  if (isObject(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(key) && child != null && !(Array.isArray(child) && child.length === 0)) {
        concerns.push(concern(FORBIDDEN_OUTPUT_KEYS.get(key), `Forbidden field ${key} is not allowed in Stage 15.`, { field: `${path}.${key}` }));
      }
      collectForbiddenFields(child, concerns, `${path}.${key}`, seen);
    }
  } else value.forEach((item, index) => collectForbiddenFields(item, concerns, `${path}[${index}]`, seen));
}

function requirePass(concerns, value, field, code) {
  if (value?.pass !== true) concerns.push(concern(code, `${field}.pass must be true.`, { field: `${field}.pass` }));
}

function compareCandidateRef(concerns, actual, allowedRaw, code, field, allowNull = false) {
  if (allowNull && actual == null) return;
  const allowed = asArray(allowedRaw).filter(Boolean);
  if (!hasText(actual) || (allowed.length > 0 && !allowed.includes(actual))) concerns.push(concern(code, `${field} does not match the selected candidate.`, { field }));
}

function candidateAllowsProfile(candidateRecord, profileLevel) {
  const allowed = asArray(candidateRecord.allowed_profile_levels ?? candidateRecord.profile_levels ?? candidateRecord.profile_level).map(normalizeProfileLevel);
  if (allowed.length > 0) return allowed.includes(profileLevel);
  const max = normalizeProfileLevel(candidateRecord.max_profile_level ?? candidateRecord.profile_level_max ?? candidateRecord.profile_level);
  return !max || PROFILE_RANK[profileLevel] <= PROFILE_RANK[max];
}

function hasKeySeed(npc, candidateRecord) {
  const keySeed = npc?.base_refs?.key_npc_seed_id;
  if (hasText(keySeed)) {
    const allowed = asArray(candidateRecord.key_npc_seed_ids ?? candidateRecord.key_npc_seed_id).filter(Boolean);
    return allowed.length === 0 || allowed.includes(keySeed);
  }
  return candidateRecord.key_seed === true || candidateRecord.allows_key_profile === true || hasText(candidateRecord.persistence_basis);
}

function candidateMatchesSelectedPlace(candidateRecord, selectedTemplateId) {
  const ids = candidatePlaceTemplateIds(candidateRecord);
  return !selectedTemplateId || ids.length === 0 || ids.includes(selectedTemplateId);
}

function candidateMatchesSeason(candidate, season) {
  return matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season);
}

function candidateMatchesTime(candidate, timeOfDay) {
  return matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.allowed_time_of_day_values ?? candidate.time_of_day, timeOfDay);
}

function candidatePlaceTemplateIds(candidate) {
  return asArray(candidate.selected_candidate_place_template_link_id
    ?? candidate.candidate_place_template_link_ids
    ?? candidate.place_template_ids
    ?? candidate.selected_place_template_id).filter(Boolean);
}

function matchesAllowedValue(raw, value) {
  const allowed = asArray(raw).filter(Boolean);
  return value == null || allowed.length === 0 || allowed.includes(value) || allowed.includes('any') || allowed.includes('all');
}

function selectedPlaceTemplateId(selected) {
  return selected?.selected?.selected_place_template_id
    ?? selected?.selected_place_template_id
    ?? selected?.selected_candidate_place_template_link_id
    ?? null;
}

function selectedG4NodeId(selected) {
  return selected?.selected_node_chain?.g4_node_id
    ?? selected?.selected?.selected_node_id
    ?? selected?.selected_node_id
    ?? null;
}

function candidateId(candidate) {
  return candidate?.npc_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null;
}

function anchorId(anchor) {
  return anchor?.anchor_id ?? anchor?.g5_anchor_id ?? anchor?.id ?? null;
}

function minilocationId(item) {
  return item?.minilocation_id ?? item?.g5_minilocation_id ?? item?.id ?? null;
}

function anchorSupportsNpc(anchor) {
  return anchor?.supports?.can_hold_npc === true
    || anchor?.supports_npc === true
    || anchor?.can_hold_npc === true;
}

function anchorVisibility(anchor) {
  return anchor?.visibility?.visibility_default
    ?? anchor?.visibility_default
    ?? anchor?.visibility?.state
    ?? anchor?.visibility
    ?? 'unknown';
}

function anchorAccess(anchor) {
  return anchor?.access?.access_state ?? anchor?.access_state ?? 'unknown';
}

function normalizeCapacity(anchor) {
  const raw = anchor?.supports?.npc_capacity
    ?? anchor?.supports?.capacity
    ?? anchor?.npc_capacity
    ?? anchor?.capacity
    ?? (anchor?.supports?.can_hold_group === true ? 6 : 1);
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1;
}

function normalizeProfileLevel(value) {
  return value === 'key_seed' ? 'key' : value;
}

function indexMany(map, values, item) {
  for (const value of values.filter(Boolean)) {
    const list = map.get(value) ?? [];
    list.push(item);
    map.set(value, list);
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAny(set, values) {
  return values.some((value) => set.has(value));
}

function concern(code, message, details = {}) {
  return { code, severity: details.severity ?? 'error', message, ...details };
}

function dedupeConcerns(concerns) {
  const seen = new Set();
  return concerns.filter((item) => {
    const key = `${item.code}|${item.field ?? ''}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
