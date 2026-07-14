import { FORBIDDEN_INPUT_KEYS, STAGE22_PRECHECK_SCHEMA } from '../policy/constants.js';
import { validateStage22Input } from '../input/input-boundary.js';
import { buildStage22ReferenceIndex } from '../references/reference-index.js';
import { validateAvailableActions } from '../validation/output-validation.js';
import { dedupe, findForbiddenKeys, isObject } from '../shared/utils.js';

export function buildNarratorStartCodePrecheck(input, referenceIndex = buildStage22ReferenceIndex(input)) {
  const inputConcerns = validateStage22Input(input);
  const actionConcerns = validateAvailableActions(input?.visible_context_package?.available_actions_context, referenceIndex);
  const concerns = dedupe([...inputConcerns, ...actionConcerns]);
  const checks = {
    input_schema_valid: inputConcerns.every((item) => !['NARRATOR_INPUT_INVALID', 'NARRATOR_INPUT_SCHEMA_MISMATCH'].includes(item.code)),
    request_id_match: !concerns.some((item) => item.code.includes('REQUEST_ID')),
    visible_context_package_present: isObject(input?.visible_context_package),
    visible_context_package_schema_valid: input?.visible_context_package?.schema === 'visible_context_package' && input?.visible_context_package?.version === 1,
    visible_context_package_digest_valid: !concerns.some((item) => item.code.includes('DIGEST')),
    visible_context_approval_valid: !concerns.some((item) => item.code.startsWith('NARRATOR_APPROVAL')),
    visible_context_audit_passed: input?.visible_context_approval?.pass === true,
    can_send_to_narrator: input?.visible_context_approval?.commit_permission?.can_send_to_narrator === true,
    can_generate_player_facing_prose: input?.visible_context_approval?.commit_permission?.can_generate_player_facing_prose === true,
    frame_present: isObject(input?.visible_context_package?.frame),
    clock_present: isObject(input?.visible_context_package?.frame?.clock),
    weather_present: isObject(input?.visible_context_package?.frame?.weather_state),
    position_present: isObject(input?.visible_context_package?.position),
    narrator_scope_present: isObject(input?.visible_context_package?.narrator_scope),
    visible_scene_dossier_present: isObject(input?.visible_context_package?.visible_scene_dossier),
    must_include_present: Array.isArray(input?.visible_context_package?.visible_scene_dossier?.must_include),
    must_not_include_present: Array.isArray(input?.visible_context_package?.visible_scene_dossier?.must_not_include),
    available_actions_context_valid: Array.isArray(input?.visible_context_package?.available_actions_context),
    action_target_refs_valid: actionConcerns.length === 0,
    narrator_policy_valid: !concerns.some((item) => item.code.startsWith('NARRATOR_POLICY')),
    no_hidden_inputs_present: findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS).length === 0
  };
  return {
    version: 1,
    schema: STAGE22_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: input?.visible_context_package_digest ?? null,
    pass: concerns.length === 0 && Object.values(checks).every(Boolean),
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 22 exact input validated', 'visible context digest and Stage 21 approval match', 'narrator policy and action references validated']
      : concerns.map((item) => `${item.code}:${item.field}`)
  };
}
