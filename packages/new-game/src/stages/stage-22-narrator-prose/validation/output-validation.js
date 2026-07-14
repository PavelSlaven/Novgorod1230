import { STAGE22_ALLOWED_ACTION_KINDS, STAGE22_ALLOWED_BASES, STAGE22_ALLOWED_BLOCK_REASONS, STAGE22_ALLOWED_RISK_HINTS, STAGE22_ALLOWED_STATUSES, STAGE22_OUTPUT_SCHEMA, FORBIDDEN_OUTPUT_KEYS, SELF_CHECK_FIELDS, TECHNICAL_TEXT_PATTERNS } from '../policy/constants.js';
import { buildStage22ReferenceIndex } from '../references/reference-index.js';
import { array, dedupe, findForbiddenKeys, isObject, issue, paragraphCount, text } from '../shared/utils.js';

export function validateNarratorStartingProseOutput(output, input, precheck, referenceIndex = buildStage22ReferenceIndex(input)) {
  const concerns = [];
  if (!isObject(output)) return [issue('NARRATOR_PROSE_INVALID_JSON', 'Narrator output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE22_OUTPUT_SCHEMA) concerns.push(issue('NARRATOR_PROSE_SCHEMA_MISMATCH', `Expected ${STAGE22_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('NARRATOR_PROSE_REQUEST_ID_MISMATCH', 'Narrator output request_id must match input.', 'request_id'));
  if (!STAGE22_ALLOWED_STATUSES.includes(output.prose_status)) concerns.push(issue('NARRATOR_PROSE_STATUS_INVALID', 'prose_status is outside the allowed enum.', 'prose_status'));
  if (output.prose_status === 'drafted' && !text(output.prose)) concerns.push(issue('NARRATOR_PROSE_EMPTY', 'Drafted prose must be non-empty.', 'prose'));
  if (output.prose_status === 'blocked') {
    if (String(output.prose ?? '') !== '') concerns.push(issue('NARRATOR_BLOCKED_PROSE_NOT_EMPTY', 'Blocked output must have empty prose.', 'prose'));
    if (!STAGE22_ALLOWED_BLOCK_REASONS.includes(output.block_reason)) concerns.push(issue('NARRATOR_BLOCK_REASON_INVALID', 'Blocked output requires a valid block_reason.', 'block_reason'));
  }
  if (output.prose_status === 'requires_repair' && !text(output.prose)) concerns.push(issue('NARRATOR_REPAIR_PROSE_EMPTY', 'requires_repair output must preserve the draft prose.', 'prose'));
  if (!Array.isArray(output.action_options)) concerns.push(issue('NARRATOR_ACTION_OPTIONS_INVALID', 'action_options must be an array.', 'action_options'));
  if (!Array.isArray(output.used_visible_context_refs)) concerns.push(issue('NARRATOR_USED_REFS_INVALID', 'used_visible_context_refs must be an array.', 'used_visible_context_refs'));
  if (!isObject(output.self_constraints_check)) concerns.push(issue('NARRATOR_SELF_CHECK_MISSING', 'self_constraints_check is required.', 'self_constraints_check'));

  const maxActions = input?.narrator_policy?.max_action_options ?? 6;
  if (array(output.action_options).length > maxActions) concerns.push(issue('NARRATOR_ACTION_LIMIT_EXCEEDED', `At most ${maxActions} action options are allowed.`, 'action_options'));
  const seenOptions = new Set();
  array(output.action_options).forEach((option, index) => validateActionOption(option, index, concerns, referenceIndex, seenOptions));

  array(output.used_visible_context_refs).forEach((ref, index) => {
    const value = typeof ref === 'string' ? ref : ref?.ref_id ?? ref?.source_ref;
    if (!text(value) || !referenceIndex.allVisibleRefs.has(value)) concerns.push(issue('NARRATOR_USED_REF_UNKNOWN', 'used_visible_context_ref must exist in visible_context_package.', `used_visible_context_refs[${index}]`));
  });

  const mandatoryRefs = extractMandatoryRefs(input?.visible_context_package?.visible_scene_dossier?.must_include);
  const usedRefs = new Set(array(output.used_visible_context_refs).map((item) => typeof item === 'string' ? item : item?.ref_id ?? item?.source_ref).filter(text));
  for (const ref of mandatoryRefs) if (!usedRefs.has(ref)) concerns.push(issue('NARRATOR_MUST_INCLUDE_REF_MISSING', 'A mandatory visible-context reference was not declared as used.', 'used_visible_context_refs', ref));

  for (const field of SELF_CHECK_FIELDS) {
    if (typeof output.self_constraints_check?.[field] !== 'boolean') concerns.push(issue('NARRATOR_SELF_CHECK_FIELD_MISSING', `self_constraints_check.${field} must be boolean.`, `self_constraints_check.${field}`));
    if (output.prose_status === 'drafted' && output.self_constraints_check?.[field] !== true) concerns.push(issue('NARRATOR_SELF_CHECK_FAILED', `Drafted prose requires self_constraints_check.${field}=true.`, `self_constraints_check.${field}`));
  }

  const paragraphs = paragraphCount(output.prose);
  if (output.prose_status === 'drafted' && paragraphs > (input?.narrator_policy?.max_opening_paragraphs ?? 4)) concerns.push(issue('NARRATOR_PARAGRAPH_LIMIT_EXCEEDED', 'Prose exceeds max_opening_paragraphs.', 'prose'));
  if (text(output.prose)) for (const pattern of TECHNICAL_TEXT_PATTERNS) if (pattern.test(output.prose)) concerns.push(issue('NARRATOR_TECHNICAL_TEXT_PRESENT', 'Prose contains technical pipeline/debug language.', 'prose'));
  for (const path of findForbiddenKeys(output, FORBIDDEN_OUTPUT_KEYS)) concerns.push(issue('NARRATOR_OUTPUT_FORBIDDEN_FIELD', 'Narrator output contains a forbidden field.', path));
  if (precheck?.pass !== true) concerns.push(issue('NARRATOR_PRECHECK_NOT_PASSED', 'narrator_start_code_precheck must pass before accepting prose.', 'precheck.pass'));
  return dedupe(concerns);
}

export function validateAvailableActions(actions, referenceIndex) {
  const concerns = [];
  array(actions).forEach((action, index) => {
    if (!isObject(action)) { concerns.push(issue('NARRATOR_AVAILABLE_ACTION_INVALID', 'Available action must be an object.', `available_actions_context[${index}]`)); return; }
    if (!text(action.action_id)) concerns.push(issue('NARRATOR_AVAILABLE_ACTION_ID_MISSING', 'Available action requires action_id.', `available_actions_context[${index}].action_id`));
    validateTargetRef(action.target_ref, `available_actions_context[${index}].target_ref`, concerns, referenceIndex, true);
  });
  return concerns;
}

function validateActionOption(option, index, concerns, referenceIndex, seenOptions) {
  const path = `action_options[${index}]`;
  if (!isObject(option)) { concerns.push(issue('NARRATOR_ACTION_OPTION_INVALID', 'Action option must be an object.', path)); return; }
  if (!text(option.option_id)) concerns.push(issue('NARRATOR_ACTION_OPTION_ID_MISSING', 'option_id is required.', `${path}.option_id`));
  else if (seenOptions.has(option.option_id)) concerns.push(issue('NARRATOR_ACTION_OPTION_ID_DUPLICATE', 'option_id must be unique.', `${path}.option_id`));
  else seenOptions.add(option.option_id);
  if (!text(option.label)) concerns.push(issue('NARRATOR_ACTION_LABEL_MISSING', 'Action label is required.', `${path}.label`));
  if (!STAGE22_ALLOWED_ACTION_KINDS.includes(option.action_kind)) concerns.push(issue('NARRATOR_ACTION_KIND_INVALID', 'action_kind is outside the allowed enum.', `${path}.action_kind`));
  if (!STAGE22_ALLOWED_BASES.includes(option.basis)) concerns.push(issue('NARRATOR_ACTION_BASIS_INVALID', 'basis is outside the allowed enum.', `${path}.basis`));
  if (!STAGE22_ALLOWED_RISK_HINTS.includes(option.risk_hint)) concerns.push(issue('NARRATOR_ACTION_RISK_HINT_INVALID', 'risk_hint is outside the allowed enum.', `${path}.risk_hint`));
  if (option.must_not_reveal_hidden_truth !== true) concerns.push(issue('NARRATOR_ACTION_HIDDEN_TRUTH_GUARD_MISSING', 'must_not_reveal_hidden_truth must be true.', `${path}.must_not_reveal_hidden_truth`));
  const target = validateTargetRef(option.target_ref, `${path}.target_ref`, concerns, referenceIndex, false);
  if (target?.id && !availableActionPermits(option, target, referenceIndex.actions)) concerns.push(issue('NARRATOR_ACTION_NOT_AVAILABLE', 'Action option target/kind is not grounded in available_actions_context.', path));
}

function validateTargetRef(targetRef, path, concerns, referenceIndex, allowMissing) {
  if (targetRef == null && allowMissing) return null;
  if (!isObject(targetRef)) { concerns.push(issue('NARRATOR_ACTION_TARGET_INVALID', 'target_ref must be an object.', path)); return null; }
  const keys = ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id'];
  const populated = keys.filter((key) => targetRef[key] != null && targetRef[key] !== '');
  if (populated.length > 1) concerns.push(issue('NARRATOR_ACTION_TARGET_AMBIGUOUS', 'target_ref may contain at most one populated target id.', path));
  if (populated.length === 0) return null;
  const key = populated[0];
  const id = targetRef[key];
  const set = key === 'anchor_id' ? referenceIndex.anchors : key === 'npc_instance_id' ? referenceIndex.npcs : key === 'item_instance_id' ? referenceIndex.items : referenceIndex.containers;
  if (!text(id) || !set.has(id)) concerns.push(issue('NARRATOR_ACTION_TARGET_NOT_VISIBLE', 'Action target must exist in visible_context_package.', `${path}.${key}`));
  return { key, id };
}

function availableActionPermits(option, target, actions) {
  for (const action of actions.values()) {
    const sourceTarget = isObject(action.target_ref) ? action.target_ref[target.key] : null;
    if (sourceTarget !== target.id) continue;
    if (text(action.action_kind) && action.action_kind !== option.action_kind) continue;
    return true;
  }
  return false;
}

function extractMandatoryRefs(mustInclude) {
  const refs = [];
  for (const entry of array(mustInclude)) {
    if (!isObject(entry)) continue;
    const ref = entry.source_ref ?? entry.ref_id ?? entry.visible_context_ref;
    if (text(ref)) refs.push(ref);
  }
  return refs;
}
