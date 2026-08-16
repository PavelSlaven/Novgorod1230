import { STAGE15_AUDIT_SCHEMA, STAGE15_PRECHECK_SCHEMA } from '@rus/contracts';
import { concern, dedupeConcerns, hasAny, isObject, nonEmptyArray } from '../shared/utils.js';
import { validateStage15NpcPlacementDraft } from './draft-validation.js';

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
  if ((input?.npc_candidate_set?.npc_candidates ?? []).some((candidate) => candidate?.require_complete_actor_appearance === true)) {
    checks.actor_base_appearance_valid = !hasAny(codes, ['NPC_PLACEMENT_ACTOR_APPEARANCE_INCOMPLETE', 'NPC_PLACEMENT_ACTOR_APPEARANCE_AUTHORED_VALUE_CHANGED']);
  }
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

export function validateStage15AuditCommitPermission(concerns, audit) {
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
