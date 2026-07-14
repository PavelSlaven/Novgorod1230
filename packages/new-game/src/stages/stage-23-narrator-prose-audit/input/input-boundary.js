import { computeNarratorStartingProseDigest as computeNarratorStartingProseDigestContract, computeVisibleContextPackageDigest, VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA, STAGE22_OUTPUT_SCHEMA } from '@rus/contracts';
import { DEFAULT_STAGE23_AUDIT_POLICY, FORBIDDEN_INPUT_KEYS, INPUT_KEYS, STAGE23_INPUT_SCHEMA, normalizeStage23AuditPolicy } from '../policy/constants.js';
import { array, dedupe, findForbiddenKeys, isObject, issue, safeClone, text } from '../shared/utils.js';
const STAGE22_APPROVAL_SCHEMA = VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA;

export function computeNarratorStartingProseDigest(prose) {
  return computeNarratorStartingProseDigestContract(prose);
}

export function buildStage23AuditInput(values = {}) {
  const source = isObject(values) ? values : {};
  const pkg = safeClone(source.visible_context_package ?? source.stage20_result?.visible_context_package ?? null);
  const prose = safeClone(source.narrator_starting_prose ?? source.stage22_result?.narrator_starting_prose ?? null);
  const packageDigest = source.visible_context_package_digest
    ?? source.stage20_result?.visible_context_package_digest
    ?? (pkg ? computeVisibleContextPackageDigest(pkg) : null);
  const proseDigest = source.narrator_starting_prose_digest
    ?? source.stage22_result?.narrator_starting_prose_digest
    ?? (prose ? computeNarratorStartingProseDigest(prose) : null);
  return Object.freeze({
    version: 1,
    schema: STAGE23_INPUT_SCHEMA,
    request_id: source.request_id ?? prose?.request_id ?? null,
    visible_context_package: pkg,
    visible_context_package_digest: packageDigest,
    visible_context_approval: safeClone(source.visible_context_approval ?? null),
    narrator_starting_prose: prose,
    narrator_starting_prose_digest: proseDigest,
    audit_policy: normalizeStage23AuditPolicy(source.audit_policy)
  });
}

export function validateStage23AuditInput(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('STAGE23_INPUT_INVALID', 'Stage 23 input must be an object.', 'root')];
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) concerns.push(issue('STAGE23_INPUT_EXTRA_FIELD', 'Stage 23 exact input contains an unsupported field.', key));
  for (const path of findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS)) concerns.push(issue('STAGE23_INPUT_FORBIDDEN_FIELD', 'Stage 23 input contains a forbidden field.', path));
  if (input.version !== 1 || input.schema !== STAGE23_INPUT_SCHEMA) concerns.push(issue('STAGE23_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE23_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('STAGE23_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));

  const pkg = input.visible_context_package;
  if (!isObject(pkg) || pkg.version !== 1 || pkg.schema !== 'visible_context_package') concerns.push(issue('STAGE23_PACKAGE_INVALID', 'visible_context_package version 1 is required.', 'visible_context_package'));
  const actualPackageDigest = isObject(pkg) ? computeVisibleContextPackageDigest(pkg) : null;
  if (!text(input.visible_context_package_digest) || input.visible_context_package_digest !== actualPackageDigest) concerns.push(issue('STAGE23_PACKAGE_DIGEST_MISMATCH', 'visible_context_package_digest must match canonical package bytes.', 'visible_context_package_digest'));

  const approval = input.visible_context_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE22_APPROVAL_SCHEMA) concerns.push(issue('STAGE23_APPROVAL_INVALID', `visible_context_approval must use ${STAGE22_APPROVAL_SCHEMA} version 1.`, 'visible_context_approval'));
  if (approval?.request_id !== input.request_id) concerns.push(issue('STAGE23_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id must match Stage 23 input.', 'visible_context_approval.request_id'));
  if (approval?.pass !== true) concerns.push(issue('STAGE23_APPROVAL_NOT_PASSED', 'Visible-context approval must pass.', 'visible_context_approval.pass'));
  if (approval?.visible_context_package_digest !== input.visible_context_package_digest) concerns.push(issue('STAGE23_APPROVAL_DIGEST_MISMATCH', 'Approval digest must match Stage 23 package digest.', 'visible_context_approval.visible_context_package_digest'));
  for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) {
    if (approval?.commit_permission?.[key] !== true) concerns.push(issue('STAGE23_APPROVAL_PERMISSION_DENIED', `visible_context_approval.commit_permission.${key} must be true.`, `visible_context_approval.commit_permission.${key}`));
  }

  const prose = input.narrator_starting_prose;
  if (!isObject(prose) || prose.version !== 1 || prose.schema !== STAGE22_OUTPUT_SCHEMA) concerns.push(issue('STAGE23_PROSE_SCHEMA_INVALID', `narrator_starting_prose must use ${STAGE22_OUTPUT_SCHEMA} version 1.`, 'narrator_starting_prose'));
  if (prose?.request_id !== input.request_id) concerns.push(issue('STAGE23_PROSE_REQUEST_ID_MISMATCH', 'Narrator prose request_id must match Stage 23 input.', 'narrator_starting_prose.request_id'));
  if (prose?.prose_status !== 'drafted') concerns.push(issue('STAGE23_PROSE_STATUS_INVALID', 'Stage 23 requires prose_status=drafted.', 'narrator_starting_prose.prose_status'));
  if (!text(prose?.prose)) concerns.push(issue('STAGE23_PROSE_EMPTY', 'Drafted narrator prose must be non-empty.', 'narrator_starting_prose.prose'));
  const actualProseDigest = isObject(prose) ? computeNarratorStartingProseDigest(prose) : null;
  if (!text(input.narrator_starting_prose_digest) || input.narrator_starting_prose_digest !== actualProseDigest) concerns.push(issue('STAGE23_PROSE_DIGEST_MISMATCH', 'narrator_starting_prose_digest must match canonical prose object.', 'narrator_starting_prose_digest'));

  const policy = input.audit_policy;
  if (!isObject(policy)) concerns.push(issue('STAGE23_POLICY_INVALID', 'audit_policy is required.', 'audit_policy'));
  for (const key of Object.keys(DEFAULT_STAGE23_AUDIT_POLICY)) if (policy?.[key] !== true) concerns.push(issue('STAGE23_POLICY_WEAKENED', `audit_policy.${key} must be true.`, `audit_policy.${key}`));
  return dedupe(concerns);
}
