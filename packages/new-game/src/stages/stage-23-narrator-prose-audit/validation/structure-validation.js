import { STAGE22_ALLOWED_ACTION_KINDS, STAGE22_ALLOWED_BASES, STAGE22_ALLOWED_RISK_HINTS } from '@rus/contracts';
import { TECHNICAL_TEXT_PATTERNS } from '../policy/constants.js';
import { buildStage22ReferenceIndex } from '../../../narrator/reference-index.js';
import { array, dedupe, extractRefs, isObject, issue, text } from '../shared/utils.js';

export function validateNarratorProseStructure(prose, pkg) {
  const concerns = [];
  if (!isObject(prose)) return [issue('STAGE23_PROSE_STRUCTURE_INVALID', 'narrator_starting_prose must be an object.', 'narrator_starting_prose')];
  if (!Array.isArray(prose.action_options)) concerns.push(issue('STAGE23_ACTION_OPTIONS_INVALID', 'action_options must be an array.', 'narrator_starting_prose.action_options'));
  if (array(prose.action_options).length > 6) concerns.push(issue('STAGE23_ACTION_OPTIONS_LIMIT', 'action_options may contain at most 6 entries.', 'narrator_starting_prose.action_options'));
  if (!Array.isArray(prose.used_visible_context_refs)) concerns.push(issue('STAGE23_USED_REFS_INVALID', 'used_visible_context_refs must be an array.', 'narrator_starting_prose.used_visible_context_refs'));
  if (!isObject(prose.self_constraints_check)) concerns.push(issue('STAGE23_SELF_CHECK_MISSING', 'self_constraints_check is required.', 'narrator_starting_prose.self_constraints_check'));
  const index = buildStage22ReferenceIndex({ visible_context_package: pkg });
  const seen = new Set();
  array(prose.action_options).forEach((option, optionIndex) => {
    const path = `narrator_starting_prose.action_options[${optionIndex}]`;
    if (!isObject(option)) { concerns.push(issue('STAGE23_ACTION_OPTION_INVALID', 'Action option must be an object.', path)); return; }
    if (!text(option.option_id) || seen.has(option.option_id)) concerns.push(issue('STAGE23_ACTION_OPTION_ID_INVALID', 'option_id must be non-empty and unique.', `${path}.option_id`));
    else seen.add(option.option_id);
    if (!text(option.label)) concerns.push(issue('STAGE23_ACTION_LABEL_MISSING', 'Action option label is required.', `${path}.label`));
    if (!STAGE22_ALLOWED_ACTION_KINDS.includes(option.action_kind)) concerns.push(issue('STAGE23_ACTION_KIND_INVALID', 'action_kind is outside the allowed enum.', `${path}.action_kind`));
    if (!STAGE22_ALLOWED_BASES.includes(option.basis)) concerns.push(issue('STAGE23_ACTION_BASIS_INVALID', 'basis is outside the allowed enum.', `${path}.basis`));
    if (!STAGE22_ALLOWED_RISK_HINTS.includes(option.risk_hint)) concerns.push(issue('STAGE23_ACTION_RISK_INVALID', 'risk_hint is outside the allowed enum.', `${path}.risk_hint`));
    if (option.must_not_reveal_hidden_truth !== true) concerns.push(issue('STAGE23_ACTION_HIDDEN_GUARD_MISSING', 'must_not_reveal_hidden_truth must be true.', `${path}.must_not_reveal_hidden_truth`));
    validateTargetRef(option.target_ref, `${path}.target_ref`, index, concerns);
  });
  array(prose.used_visible_context_refs).forEach((ref, indexNo) => {
    const value = typeof ref === 'string' ? ref : ref?.ref_id ?? ref?.source_ref;
    if (!text(value) || !index.allVisibleRefs.has(value)) concerns.push(issue('STAGE23_USED_REF_UNKNOWN', 'used_visible_context_ref must exist in visible context.', `narrator_starting_prose.used_visible_context_refs[${indexNo}]`));
  });
  if (text(prose.prose)) for (const pattern of TECHNICAL_TEXT_PATTERNS) if (pattern.test(prose.prose)) concerns.push(issue('STAGE23_TECHNICAL_TEXT_PRESENT', 'Prose contains technical pipeline/debug language.', 'narrator_starting_prose.prose'));
  const forbiddenRefs = extractRefs(pkg?.visible_scene_dossier?.must_not_include);
  const usedRefs = new Set(array(prose.used_visible_context_refs).map((entry) => typeof entry === 'string' ? entry : entry?.ref_id ?? entry?.source_ref).filter(text));
  for (const ref of forbiddenRefs) if (usedRefs.has(ref)) concerns.push(issue('STAGE23_MUST_NOT_INCLUDE_REF_USED', 'A must_not_include reference appears in used_visible_context_refs.', 'narrator_starting_prose.used_visible_context_refs'));
  return dedupe(concerns);
}

function validateTargetRef(targetRef, path, index, concerns) {
  if (!isObject(targetRef)) { concerns.push(issue('STAGE23_ACTION_TARGET_INVALID', 'target_ref must be an object.', path)); return; }
  const fields = ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id'];
  const populated = fields.filter((key) => text(targetRef[key]));
  if (populated.length > 1) concerns.push(issue('STAGE23_ACTION_TARGET_AMBIGUOUS', 'target_ref may populate at most one id.', path));
  if (populated.length === 0) return;
  const key = populated[0];
  const value = targetRef[key];
  const set = key === 'anchor_id' ? index.anchors : key === 'npc_instance_id' ? index.npcs : key === 'item_instance_id' ? index.items : index.containers;
  if (!set.has(value)) concerns.push(issue('STAGE23_ACTION_TARGET_NOT_VISIBLE', 'Action target is absent from visible context.', `${path}.${key}`));
}
