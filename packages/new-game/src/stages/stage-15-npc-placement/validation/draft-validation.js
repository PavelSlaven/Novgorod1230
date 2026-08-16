import { STAGE15_DRAFT_SCHEMA, STAGE15_PLACEMENT_STATUSES, STAGE15_PROFILE_LEVELS } from '@rus/contracts';
import { ACTOR_BASE_APPEARANCE_PATHS, validateActorBaseAppearance } from '@rus/actors';
import { DEFAULT_STAGE15_NPC_PLACEMENT_POLICY, FORBIDDEN_OUTPUT_KEYS } from '../policy/constants.js';
import { buildStage15AnchorIndex, buildStage15CandidateIndex } from '../references/indexes.js';
import { anchorAccess, anchorSupportsNpc, anchorVisibility, asArray, candidateAllowsProfile, candidateMatchesSeason, candidateMatchesSelectedPlace, candidateMatchesTime, compareCandidateRef, concern, dedupeConcerns, hasKeySeed, hasText, isObject, nonEmptyArray, normalizeProfileLevel, selectedG4NodeId, selectedPlaceTemplateId } from '../shared/utils.js';

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

    compareCandidateRef(concerns, npc?.base_refs?.social_role_id, candidateRecord.social_role_id ?? candidateRecord.social_role_ids ?? candidateRecord.social_role?.social_role_id, 'NPC_PLACEMENT_SOCIAL_ROLE_MISMATCH', `${path}.base_refs.social_role_id`);
    compareCandidateRef(concerns, npc?.base_refs?.occupation_id, candidateRecord.occupation_id ?? candidateRecord.occupation_ids ?? candidateRecord.occupation?.occupation_id, 'NPC_PLACEMENT_OCCUPATION_MISMATCH', `${path}.base_refs.occupation_id`, true);
    compareCandidateRef(concerns, npc?.base_refs?.npc_archetype_id, candidateRecord.npc_archetype_id ?? candidateRecord.npc_archetype_ids ?? candidateRecord.npc_archetype?.npc_archetype_id, 'NPC_PLACEMENT_ARCHETYPE_MISMATCH', `${path}.base_refs.npc_archetype_id`);

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

export function validateNpcVisibility(concerns, npc, anchor, input, path) {
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

export function validateNpcIdentity(concerns, npc, candidateRecord, profileLevel, policy, path) {
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
  if (candidateRecord.require_complete_actor_appearance === true) {
    if (npc.appearance_contract_version !== 'actor_base_appearance_v1') {
      concerns.push(concern('NPC_PLACEMENT_ACTOR_APPEARANCE_INCOMPLETE', 'New NPC requires actor_base_appearance_v1.', { field: `${path}.appearance_contract_version` }));
    }
    const validation = validateActorBaseAppearance(identity, { requireComplete: true });
    for (const message of validation.errors) {
      concerns.push(concern('NPC_PLACEMENT_ACTOR_APPEARANCE_INCOMPLETE', message, { field: `${path}.identity` }));
    }
    for (const appearancePath of ACTOR_BASE_APPEARANCE_PATHS) {
      const authored = readPath(candidateRecord.identity_state, appearancePath);
      if (authored != null && readPath(identity, appearancePath) !== authored) {
        concerns.push(concern('NPC_PLACEMENT_ACTOR_APPEARANCE_AUTHORED_VALUE_CHANGED', `Authored ${appearancePath} must be preserved.`, { field: `${path}.identity.${appearancePath}` }));
      }
    }
  }
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

export function validateNpcDepth(concerns, npc, profileLevel, candidateRecord, path) {
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

export function validateNpcKnowledge(concerns, npc, path) {
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

export function validateResourceHints(concerns, npc, input, path) {
  const hints = npc?.npc_resource_hints;
  if (!isObject(hints)) return;
  const allowed = new Set((input.item_profile_candidate_set?.item_profile_candidates ?? input.item_profile_candidate_set?.candidates ?? []).map((item) => item.item_profile_candidate_id ?? item.candidate_id ?? item.id).filter(Boolean));
  for (const field of ['may_control_item_profile_candidate_ids', 'may_hold_item_profile_candidate_ids', 'may_guard_container_profile_candidate_ids']) {
    for (const id of asArray(hints[field])) {
      if (allowed.size > 0 && !allowed.has(id)) concerns.push(concern('NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY', 'Resource hint must reference item_profile_candidate_set.', { field: `${path}.npc_resource_hints.${field}` }));
    }
  }
}

export function validateBindingArrays(concerns, draft, instanceIds, anchorIndex) {
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

export function collectForbiddenFields(value, concerns, path = 'root', seen = new WeakSet()) {
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
