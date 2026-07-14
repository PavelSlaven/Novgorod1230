import { FORBIDDEN_AUDIT_KEYS, PLAYER_AUDIT_ALLOWED_CONCERN_CODES, PLAYER_AUDIT_ALLOWED_REPAIR_ROUTES, PLAYER_AUDIT_ALLOWED_SEVERITIES, PLAYER_AUDIT_REQUIRED_CHECKS, STAGE12_OUTPUT_SCHEMA } from './constants.js';
import { validateStage12PlayerCharacterAuditInput } from './input.js';
import { concern, isPlainObject, lastPathKey, nonEmptyArray, walk } from './shared.js';

export function validateStage12PlayerCharacterAuditOutput(output = {}, input = {}) {
  const concerns = [];
  concerns.push(...validateStage12PlayerCharacterAuditInput(input));

  if (!isPlainObject(output)) {
    return concerns.concat(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'player_character_audit must be a JSON object.', { field: 'root', severity: 'hard_block' }));
  }
  if (output.schema !== STAGE12_OUTPUT_SCHEMA) concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', `Audit schema must be ${STAGE12_OUTPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  if (output.version !== 1) concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Audit version must be 1.', { field: 'version', severity: 'hard_block' }));
  if (typeof output.pass !== 'boolean') concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Audit pass must be boolean.', { field: 'pass', severity: 'hard_block' }));
  if (!isPlainObject(output.checks)) concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', 'Audit checks must be an object.', { field: 'checks', severity: 'hard_block' }));
  for (const check of PLAYER_AUDIT_REQUIRED_CHECKS) {
    if (output.checks?.[check] === undefined) concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', `Audit checks.${check} is required.`, { field: `checks.${check}`, severity: 'hard_block' }));
  }

  if (output.pass === true && !nonEmptyArray(output.evidence)) {
    concerns.push(concern('PLAYER_AUDIT_EVIDENCE_MISSING', 'Passing audit must include non-empty evidence.', { field: 'evidence', severity: 'hard_block' }));
  }
  if (output.pass === false && !nonEmptyArray(output.concerns)) {
    concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Failed audit must include concerns.', { field: 'concerns', severity: 'hard_block' }));
  }
  if (output.pass === false && !isPlainObject(output.repair_route)) {
    concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', 'Failed audit must include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
  }

  concerns.push(...validateCommitPermission(output));
  concerns.push(...validateAuditConcernEnums(output));
  concerns.push(...validateRepairRoute(output));
  concerns.push(...validateAuditDoesNotMutateCharacter(output));

  if (input.code_precheck?.pass === false && output.pass === true) {
    concerns.push(concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'Audit cannot pass when code_precheck.pass=false.', { field: 'pass', severity: 'hard_block' }));
  }

  return concerns;
}

export function validateCommitPermission(output) {
  const concerns = [];
  const permission = output.commit_permission;
  if (!isPlainObject(permission)) {
    concerns.push(concern('PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH', 'commit_permission is required.', { field: 'commit_permission', severity: 'hard_block' }));
    return concerns;
  }
  const expected = output.pass === true;
  for (const field of ['can_shape_game_profile', 'can_continue_to_g5_materialization', 'can_write_player_character_after_commit_gate']) {
    if (permission[field] !== expected) {
      concerns.push(concern('PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH', `${field} must be ${expected} when pass=${output.pass}.`, { field: `commit_permission.${field}`, severity: 'hard_block' }));
    }
  }
  return concerns;
}

export function validateAuditConcernEnums(output) {
  const concerns = [];
  for (const item of output.concerns ?? []) {
    if (!PLAYER_AUDIT_ALLOWED_CONCERN_CODES.has(String(item?.code ?? ''))) {
      concerns.push(concern('PLAYER_AUDIT_CONCERN_ENUM_INVALID', `Concern code is not allowed: ${String(item?.code ?? 'missing')}.`, { field: 'concerns.code', severity: 'hard_block' }));
    }
    if (item?.severity !== undefined && !PLAYER_AUDIT_ALLOWED_SEVERITIES.has(String(item.severity))) {
      concerns.push(concern('PLAYER_AUDIT_SEVERITY_ENUM_INVALID', `Severity is not allowed: ${String(item.severity)}.`, { field: 'concerns.severity', severity: 'hard_block' }));
    }
  }
  return concerns;
}

export function validateRepairRoute(output) {
  const concerns = [];
  if (output.pass === true) {
    if (output.repair_route !== null && output.repair_route !== undefined) {
      concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', 'Passing audit must not include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
    }
    return concerns;
  }
  const route = output.repair_route ?? {};
  const target = String(route.return_to_stage ?? route.repair_target_stage ?? '');
  if (!PLAYER_AUDIT_ALLOWED_REPAIR_ROUTES.has(target)) {
    concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', `repair_route.return_to_stage is not allowed: ${target || 'missing'}.`, { field: 'repair_route.return_to_stage', severity: 'hard_block' }));
  }
  return concerns;
}

export function validateAuditDoesNotMutateCharacter(output) {
  const concerns = [];
  const leaks = [];
  walk(output, (value, path) => {
    const key = lastPathKey(path);
    if (FORBIDDEN_AUDIT_KEYS.has(key)) leaks.push({ key, path });
  });
  for (const leak of leaks) {
    let code = 'PLAYER_AUDIT_MODIFIED_CHARACTER';
    if (/inventory/u.test(leak.key)) code = 'PLAYER_AUDIT_NEW_INVENTORY';
    if (/biography/u.test(leak.key)) code = 'PLAYER_AUDIT_NEW_BIOGRAPHY';
    if (/visible_scene/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_VISIBLE_SCENE';
    if (/intro_prose/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_INTRO_PROSE';
    if (/g5|minilocation/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_G5';
    if (/npc/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_NPC';
    concerns.push(concern(code, `Audit must not contain downstream or modified character field ${leak.key}.`, { field: leak.path, severity: 'hard_block' }));
  }
  return concerns;
}
