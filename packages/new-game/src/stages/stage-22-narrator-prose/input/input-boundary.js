import { buildVisibleContextAuditApproval, computeVisibleContextPackageDigest } from '@rus/contracts';
import { STAGE22_APPROVAL_SCHEMA, STAGE22_INPUT_SCHEMA, REQUIRED_TRUE_POLICY_FIELDS, FORBIDDEN_INPUT_KEYS, normalizeStage22NarratorPolicy } from '../policy/constants.js';
import { dedupe, findForbiddenKeys, isObject, issue, requireObject, safeClone, text } from '../shared/utils.js';

export function buildStage21Approval(stage21Result) {
  return buildVisibleContextAuditApproval(stage21Result);
}

export function buildStage22NarratorInput(values = {}) {
  const source = isObject(values) ? values : {};
  const visibleContextPackage = source.visible_context_package ?? source.stage20_result?.visible_context_package ?? null;
  const digest = source.visible_context_package_digest
    ?? source.stage20_result?.visible_context_package_digest
    ?? (isObject(visibleContextPackage) ? computeVisibleContextPackageDigest(visibleContextPackage) : null);
  const approval = source.visible_context_approval
    ?? buildStage21Approval(source.stage21_result ?? source.visible_context_audit_result ?? {});
  return {
    version: 1,
    schema: STAGE22_INPUT_SCHEMA,
    request_id: source.request_id ?? visibleContextPackage?.request_id ?? approval?.request_id ?? null,
    visible_context_package: safeClone(visibleContextPackage),
    visible_context_package_digest: digest,
    visible_context_approval: safeClone(approval),
    narrator_policy: normalizeStage22NarratorPolicy(source.narrator_policy ?? source.policy ?? {})
  };
}

export function validateStage22Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('NARRATOR_INPUT_INVALID', 'Stage 22 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE22_INPUT_SCHEMA) concerns.push(issue('NARRATOR_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE22_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('NARRATOR_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  const forbiddenPaths = findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS);
  for (const path of forbiddenPaths) concerns.push(issue('NARRATOR_INPUT_FORBIDDEN_FIELD', 'Stage 22 input contains a forbidden upstream/internal field.', path));

  const pkg = input.visible_context_package;
  if (!isObject(pkg) || pkg.version !== 1 || pkg.schema !== 'visible_context_package') concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_INVALID', 'visible_context_package must be visible_context_package version 1.', 'visible_context_package'));
  if (isObject(pkg) && pkg.visible_context_status !== 'formed') concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_NOT_FORMED', 'visible_context_status must be formed.', 'visible_context_package.visible_context_status'));
  if (isObject(pkg) && text(pkg.request_id) && pkg.request_id !== input.request_id) concerns.push(issue('NARRATOR_REQUEST_ID_MISMATCH', 'visible_context_package.request_id must match input request_id.', 'visible_context_package.request_id'));
  const digest = isObject(pkg) ? computeVisibleContextPackageDigest(pkg) : null;
  if (!text(input.visible_context_package_digest) || input.visible_context_package_digest !== digest) concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_DIGEST_MISMATCH', 'visible_context_package digest mismatch.', 'visible_context_package_digest'));

  const approval = input.visible_context_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE22_APPROVAL_SCHEMA) concerns.push(issue('NARRATOR_APPROVAL_INVALID', `visible_context_approval must be ${STAGE22_APPROVAL_SCHEMA} version 1.`, 'visible_context_approval'));
  if (isObject(approval)) {
    if (approval.request_id !== input.request_id) concerns.push(issue('NARRATOR_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id must match input request_id.', 'visible_context_approval.request_id'));
    if (approval.pass !== true) concerns.push(issue('NARRATOR_APPROVAL_NOT_PASSED', 'Stage 21 approval must pass.', 'visible_context_approval.pass'));
    if (approval.visible_context_package_digest !== digest) concerns.push(issue('NARRATOR_APPROVAL_DIGEST_MISMATCH', 'Approval digest must match visible context digest.', 'visible_context_approval.visible_context_package_digest'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) {
      if (approval.commit_permission?.[key] !== true) concerns.push(issue('NARRATOR_APPROVAL_PERMISSION_DENIED', `visible_context_approval.commit_permission.${key} must be true.`, `visible_context_approval.commit_permission.${key}`));
    }
  }

  requireObject(concerns, pkg?.frame, 'visible_context_package.frame', 'NARRATOR_FRAME_MISSING');
  requireObject(concerns, pkg?.frame?.clock, 'visible_context_package.frame.clock', 'NARRATOR_CLOCK_MISSING');
  requireObject(concerns, pkg?.frame?.weather_state, 'visible_context_package.frame.weather_state', 'NARRATOR_WEATHER_MISSING');
  requireObject(concerns, pkg?.position, 'visible_context_package.position', 'NARRATOR_POSITION_MISSING');
  requireObject(concerns, pkg?.narrator_scope, 'visible_context_package.narrator_scope', 'NARRATOR_SCOPE_MISSING');
  requireObject(concerns, pkg?.visible_scene_dossier, 'visible_context_package.visible_scene_dossier', 'NARRATOR_DOSSIER_MISSING');
  if (!Array.isArray(pkg?.visible_scene_dossier?.must_include)) concerns.push(issue('NARRATOR_MUST_INCLUDE_MISSING', 'visible_scene_dossier.must_include must be an array.', 'visible_context_package.visible_scene_dossier.must_include'));
  if (!Array.isArray(pkg?.visible_scene_dossier?.must_not_include)) concerns.push(issue('NARRATOR_MUST_NOT_INCLUDE_MISSING', 'visible_scene_dossier.must_not_include must be an array.', 'visible_context_package.visible_scene_dossier.must_not_include'));
  if (!Array.isArray(pkg?.available_actions_context)) concerns.push(issue('NARRATOR_AVAILABLE_ACTIONS_INVALID', 'available_actions_context must be an array.', 'visible_context_package.available_actions_context'));

  const policy = input.narrator_policy;
  if (!isObject(policy)) concerns.push(issue('NARRATOR_POLICY_INVALID', 'narrator_policy is required.', 'narrator_policy'));
  for (const key of REQUIRED_TRUE_POLICY_FIELDS) if (policy?.[key] !== true) concerns.push(issue('NARRATOR_POLICY_WEAKENED', `narrator_policy.${key} must be true.`, `narrator_policy.${key}`));
  if (!Number.isInteger(policy?.max_opening_paragraphs) || policy.max_opening_paragraphs < 1 || policy.max_opening_paragraphs > 4) concerns.push(issue('NARRATOR_POLICY_LIMIT_INVALID', 'max_opening_paragraphs must be an integer from 1 to 4.', 'narrator_policy.max_opening_paragraphs'));
  if (!Number.isInteger(policy?.max_action_options) || policy.max_action_options < 0 || policy.max_action_options > 6) concerns.push(issue('NARRATOR_POLICY_LIMIT_INVALID', 'max_action_options must be an integer from 0 to 6.', 'narrator_policy.max_action_options'));
  return dedupe(concerns);
}
