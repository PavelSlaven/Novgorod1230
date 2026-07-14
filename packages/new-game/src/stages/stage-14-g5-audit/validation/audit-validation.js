import { STAGE14_CONCERN_CODE_ENUM, STAGE14_OUTPUT_SCHEMA, STAGE14_REPAIR_ROUTE_ENUM, STAGE14_REQUIRED_CHECKS, STAGE14_SEVERITY_ENUM } from '@rus/contracts';
import { concern, dedupeConcerns, hasOwnRecursive, isPlainObject, normalizeArray } from '../shared/utils.js';

export function validateStage14G5SceneAuditOutput(output = {}, input = {}) {
  const concerns = [];
  if (!isPlainObject(output)) {
    return [concern('G5_AUDIT_OUTPUT_SCHEMA_MISMATCH', 'Stage 14 audit output must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (output.version !== 1) {
    concerns.push(concern('G5_AUDIT_OUTPUT_VERSION_MISMATCH', 'g5_scene_audit.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (output.schema !== STAGE14_OUTPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_OUTPUT_SCHEMA_MISMATCH', `g5_scene_audit.schema must be ${STAGE14_OUTPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  if (typeof output.pass !== 'boolean') {
    concerns.push(concern('G5_AUDIT_OUTPUT_PASS_MISSING', 'g5_scene_audit.pass must be boolean.', { field: 'pass', severity: 'hard_block' }));
  }
  if (!isPlainObject(output.checks)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_CHECKS_MISSING', 'g5_scene_audit.checks is required.', { field: 'checks', severity: 'hard_block' }));
  } else {
    for (const checkName of STAGE14_REQUIRED_CHECKS) {
      if (!isPlainObject(output.checks[checkName])) {
        concerns.push(concern('G5_AUDIT_OUTPUT_CHECK_MISSING', `g5_scene_audit.checks.${checkName} is required.`, { field: `checks.${checkName}`, severity: 'hard_block' }));
      }
    }
  }
  if (!Array.isArray(output.evidence) || output.evidence.length === 0) {
    concerns.push(concern('G5_AUDIT_OUTPUT_EVIDENCE_EMPTY', 'g5_scene_audit.evidence must not be empty.', { field: 'evidence', severity: 'hard_block' }));
  }
  if (output.pass === false && (!Array.isArray(output.concerns) || output.concerns.length === 0)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_CONCERNS_MISSING', 'Failed g5_scene_audit must include concerns.', { field: 'concerns', severity: 'hard_block' }));
  }
  if (output.pass === false && !isPlainObject(output.repair_route)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_REPAIR_ROUTE_MISSING', 'Failed g5_scene_audit must include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
  }
  if (output.pass === true && output.repair_route !== null) {
    concerns.push(concern('G5_AUDIT_OUTPUT_REPAIR_ROUTE_UNEXPECTED', 'Passing g5_scene_audit must have repair_route=null.', { field: 'repair_route', severity: 'hard_block' }));
  }
  validateCommitPermission(output, concerns);
  validateConcerns(output, concerns);
  validateRepairRoute(output, concerns);
  validateNoForbiddenAuditPayload(output, concerns);
  if (Object.prototype.hasOwnProperty.call(output, 'commit_allowed')) {
    concerns.push(concern('G5_AUDIT_COMMIT_ALLOWED_LEGACY_FIELD', 'commit_allowed is not a normative Stage 14 gate.', { field: 'commit_allowed', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

export function validateCommitPermission(output, concerns) {
  const permission = output.commit_permission;
  if (!isPlainObject(permission)) {
    concerns.push(concern('G5_AUDIT_COMMIT_PERMISSION_MISMATCH', 'g5_scene_audit.commit_permission is required.', { field: 'commit_permission', severity: 'hard_block' }));
    return;
  }
  const expected = output.pass === true
    ? {
        can_commit_g5_scene_graph: true,
        can_continue_to_npc_placement: true,
        can_continue_to_item_placement: true,
        can_continue_to_visible_context: false
      }
    : {
        can_commit_g5_scene_graph: false,
        can_continue_to_npc_placement: false,
        can_continue_to_item_placement: false,
        can_continue_to_visible_context: false
      };
  for (const [key, value] of Object.entries(expected)) {
    if (permission[key] !== value) {
      concerns.push(concern('G5_AUDIT_COMMIT_PERMISSION_MISMATCH', `commit_permission.${key} must be ${value}.`, { field: `commit_permission.${key}`, severity: 'hard_block' }));
    }
  }
}

export function validateConcerns(output, concerns) {
  for (const [index, item] of normalizeArray(output.concerns).entries()) {
    if (!STAGE14_CONCERN_CODE_ENUM.has(item?.code)) {
      concerns.push(concern('G5_AUDIT_CONCERN_CODE_UNKNOWN', `Unknown Stage 14 concern code: ${item?.code}.`, { field: `concerns.${index}.code`, severity: 'hard_block' }));
    }
    const severity = item?.severity ?? 'hard_block';
    if (!STAGE14_SEVERITY_ENUM.has(severity)) {
      concerns.push(concern('G5_AUDIT_CONCERN_SEVERITY_UNKNOWN', `Unknown Stage 14 concern severity: ${severity}.`, { field: `concerns.${index}.severity`, severity: 'hard_block' }));
    }
  }
}

export function validateRepairRoute(output, concerns) {
  if (!isPlainObject(output.repair_route)) return;
  const route = output.repair_route.return_to_stage ?? output.repair_route.route ?? output.repair_route.target_stage;
  if (!STAGE14_REPAIR_ROUTE_ENUM.has(String(route))) {
    concerns.push(concern('G5_AUDIT_REPAIR_ROUTE_UNKNOWN', `Unknown Stage 14 repair route: ${route}.`, { field: 'repair_route.return_to_stage', severity: 'hard_block' }));
  }
}

export function validateNoForbiddenAuditPayload(output, concerns) {
  const forbidden = [
    ['g5_scene_graph_draft', 'Audit must not contain modified g5_scene_graph_draft.'],
    ['modified_draft', 'Audit must not contain modified draft.'],
    ['corrected_draft', 'Audit must not contain corrected draft.'],
    ['new_anchors', 'Audit must not create new anchors.'],
    ['added_anchors', 'Audit must not create new anchors.'],
    ['new_edges', 'Audit must not create new edges.'],
    ['added_edges', 'Audit must not create new edges.'],
    ['npc', 'Audit must not contain NPCs.'],
    ['npcs', 'Audit must not contain NPCs.'],
    ['npc_instances', 'Audit must not contain NPCs.'],
    ['item', 'Audit must not contain items.'],
    ['items', 'Audit must not contain items.'],
    ['item_instances', 'Audit must not contain items.'],
    ['visible_scene', 'Audit must not contain visible_scene.'],
    ['intro_prose', 'Audit must not contain intro_prose.'],
    ['hidden_event', 'Audit must not contain hidden_event.'],
    ['hidden_events', 'Audit must not contain hidden_event.'],
    ['narrator_prose', 'Audit must not contain narrator_prose.']
  ];
  for (const [key, message] of forbidden) {
    if (hasOwnRecursive(output, key)) {
      concerns.push(concern('G5_AUDIT_FORBIDDEN_OUTPUT_FIELD', message, { field: key, severity: 'hard_block' }));
    }
  }
}
