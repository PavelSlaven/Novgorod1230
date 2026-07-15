import { STAGE16_AUDIT_SCHEMA, STAGE16_PRECHECK_SCHEMA } from '@rus/contracts';
import { REQUIRED_AUDIT_CHECKS } from '../policy/constants.js';
import { concern, dedupeConcerns, isObject, nonEmptyArray } from '../shared/utils.js';
import { validateStage16ItemPlacementDraft } from './draft-validation.js';
import { evaluateStage16ContainerPacking } from './packing-validation.js';

export function buildStage16ItemPlacementCodePrecheck(draft, input) {
  const concerns = validateStage16ItemPlacementDraft(draft, input);
  const packing = evaluateStage16ContainerPacking(draft, input);
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...values) => values.every((value) => !codes.has(value));
  const nonePrefix = (...prefixes) => [...codes].every((code) => !prefixes.some((prefix) => code.startsWith(prefix)));
  const checks = {
    schema_valid: none('ITEM_PLACEMENT_INVALID_JSON', 'ITEM_PLACEMENT_SCHEMA_MISMATCH', 'ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING'),
    placement_status_valid: none('ITEM_PLACEMENT_STATUS_INVALID', 'NO_ALLOWED_ITEM_PLACEMENT'),
    all_item_profile_candidates_exist: none('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_ITEM_PROFILE_MISMATCH'),
    all_container_profile_candidates_exist: none('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_CONTAINER_PROFILE_MISMATCH'),
    all_property_rule_candidates_exist: none('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_CREATED_PROPERTY_RULE'),
    all_anchors_exist: none('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4'),
    all_anchors_support_item_or_container: none('ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_ITEM', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_CONTAINER', 'ITEM_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED'),
    all_npc_holders_exist: none('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND'),
    all_player_holders_exist: none('ITEM_PLACEMENT_PLAYER_HOLDER_NOT_FOUND'),
    all_container_holders_exist: none('ITEM_PLACEMENT_CONTAINER_HOLDER_NOT_FOUND'),
    all_owners_controllers_exist: none('ITEM_PLACEMENT_OWNER_NOT_FOUND', 'ITEM_PLACEMENT_CONTROLLER_NOT_FOUND'),
    causal_basis_present: none('ITEM_PLACEMENT_NO_CAUSAL_BASIS'),
    no_player_desire_materialization: none('ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED'),
    physical_properties_valid: none('ITEM_PLACEMENT_WEIGHT_MISSING', 'ITEM_PLACEMENT_SIZE_MISSING', 'ITEM_PLACEMENT_CONDITION_MISSING'),
    visibility_valid: none('ITEM_PLACEMENT_VISIBILITY_MISSING', 'ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE'),
    access_valid: none('ITEM_PLACEMENT_ACCESS_MISSING', 'ITEM_PLACEMENT_ACCESS_INVALID'),
    property_valid: none('ITEM_PLACEMENT_PROPERTY_MISSING', 'ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND'),
    risk_valid: nonePrefix('ITEM_PLACEMENT_RISK_', 'ITEM_PLACEMENT_RARE_ITEM_', 'ITEM_PLACEMENT_FOREIGN_ITEM_', 'ITEM_PLACEMENT_DISPUTED_ITEM_', 'ITEM_PLACEMENT_SERVICE_ITEM_'),
    no_hidden_items_revealed: none('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE'),
    no_closed_container_contents_leaked: none('ITEM_PLACEMENT_CLOSED_CONTAINER_CONTENTS_LEAK'),
    no_player_inventory_duplicates: none('ITEM_PLACEMENT_PLAYER_INVENTORY_DUPLICATE'),
    no_new_npcs_created: none('ITEM_PLACEMENT_CREATED_NPC'),
    no_new_g5_anchors_created: none('ITEM_PLACEMENT_CREATED_G5_ANCHOR'),
    no_prose_created: none('ITEM_PLACEMENT_CREATED_VISIBLE_SCENE', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'),
    no_hidden_events_created: none('ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'),
    source_trace_present: none('ITEM_PLACEMENT_SOURCE_MISSING'),
    audit_self_check_evidence_present: none('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE')
  };
  const pass = concerns.length === 0 && Object.values(checks).every(Boolean);
  return {
    version: 1,
    schema: STAGE16_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? draft?.request_id ?? null,
    pass,
    checks,
    concerns,
    evidence: [
      { kind: 'stage16_code_precheck', checked_item_count: draft?.item_instances?.length ?? 0, checked_container_count: draft?.container_instances?.length ?? 0 },
      ...(packing.traces.length > 0 ? [{ kind: 'packing_slots_v1', containers: packing.traces }] : [])
    ]
  };
}

export function buildStage16ItemPlacementAuditInput(input, draft, codePrecheck) {
  return {
    version: 1,
    schema: 'initial_item_placement_audit_input',
    request_id: input?.request_id ?? null,
    item_placement_input: input,
    initial_item_placement_draft: draft,
    initial_item_placement_code_precheck: codePrecheck,
    audit_policy: {
      do_not_modify_draft: true,
      do_not_create_items: true,
      do_not_create_containers: true,
      do_not_create_npcs: true,
      do_not_change_g5_scene: true,
      require_non_empty_evidence: true,
      require_repair_route_on_failure: true
    }
  };
}

export function validateStage16ItemPlacementAudit(audit, draft, input) {
  const concerns = [];
  if (!isObject(audit)) return [concern('ITEM_PLACEMENT_AUDIT_INVALID_JSON', 'Stage 16 audit must be an object.')];
  if (audit.version !== 1 || audit.schema !== STAGE16_AUDIT_SCHEMA) concerns.push(concern('ITEM_PLACEMENT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE16_AUDIT_SCHEMA} version 1.`));
  if (typeof audit.pass !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'Audit pass must be boolean.', { field: 'pass' }));
  if (audit.request_id != null && audit.request_id !== input?.request_id) concerns.push(concern('ITEM_PLACEMENT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', { field: 'request_id' }));
  if (!nonEmptyArray(audit.evidence)) concerns.push(concern('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE', 'Audit evidence must not be empty.', { field: 'evidence' }));
  if (!isObject(audit.checks)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'Audit checks object is required.', { field: 'checks' }));
  else for (const key of REQUIRED_AUDIT_CHECKS) if (!isObject(audit.checks[key]) && typeof audit.checks[key] !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', `Audit check ${key} is required.`, { field: `checks.${key}` }));
  if (audit.pass === false && !nonEmptyArray(audit.concerns)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', { field: 'concerns' }));
  if (audit.pass === false && !isObject(audit.repair_route)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REPAIR_ROUTE_MISSING', 'Failed audit requires repair_route.', { field: 'repair_route' }));
  if (audit.pass === true && audit.repair_route != null) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REPAIR_ROUTE_INVALID', 'Passed audit must have repair_route=null.', { field: 'repair_route' }));
  validateAuditCommitPermission(concerns, audit);
  for (const key of ['initial_item_placement_draft', 'modified_draft', 'item_instances', 'container_instances', 'new_items', 'new_containers', 'new_npcs', 'new_anchors', 'visible_scene', 'intro_prose', 'hidden_event']) {
    if (Object.prototype.hasOwnProperty.call(audit, key)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_MUTATED_OUTPUT', `Audit must not contain ${key}.`, { field: key }));
  }
  if (audit.pass === true && validateStage16ItemPlacementDraft(draft, input).length > 0) concerns.push(concern('ITEM_PLACEMENT_AUDIT_APPROVED_INVALID_DRAFT', 'Audit cannot pass an invalid item placement draft.'));
  return dedupeConcerns(concerns);
}

export function validateAuditCommitPermission(concerns, audit) {
  const permission = audit?.commit_permission;
  if (!isObject(permission)) {
    concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'commit_permission is required.', { field: 'commit_permission' }));
    return;
  }
  const keys = ['can_commit_item_instances', 'can_commit_container_instances', 'can_continue_to_time_light_gate', 'can_continue_to_visible_context'];
  for (const key of keys) if (typeof permission[key] !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', `commit_permission.${key} must be boolean.`, { field: `commit_permission.${key}` }));
  if (audit.pass === true) {
    for (const key of ['can_commit_item_instances', 'can_commit_container_instances', 'can_continue_to_time_light_gate']) if (permission[key] !== true) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', `${key} must be true when audit passes.`, { field: `commit_permission.${key}` }));
    if (permission.can_continue_to_visible_context !== false) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', 'Stage 16 must not directly permit visible context.', { field: 'commit_permission.can_continue_to_visible_context' }));
  } else if (keys.some((key) => permission[key] !== false)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', 'All commit permissions must be false when audit fails.', { field: 'commit_permission' }));
}
