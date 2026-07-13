import { STAGE23_PRECHECK_SCHEMA } from '../policy/constants.js';
import { validateStage23AuditInput } from '../input/input-boundary.js';
import { validateNarratorProseStructure } from '../validation/structure-validation.js';
import { dedupe, isObject, text } from '../shared/utils.js';

export function buildNarratorProseCodePrecheck(input) {
  const inputConcerns = validateStage23AuditInput(input);
  const structuralConcerns = validateNarratorProseStructure(input?.narrator_starting_prose, input?.visible_context_package);
  const concerns = dedupe([...inputConcerns, ...structuralConcerns]);
  const codes = new Set(concerns.map((item) => item.code));
  const prose = input?.narrator_starting_prose;
  const checks = {
    input_schema_valid: !codes.has('STAGE23_INPUT_INVALID') && !codes.has('STAGE23_INPUT_SCHEMA_MISMATCH'),
    request_id_match: ![...codes].some((code) => code.includes('REQUEST_ID')),
    package_schema_valid: !codes.has('STAGE23_PACKAGE_INVALID'),
    package_digest_valid: !codes.has('STAGE23_PACKAGE_DIGEST_MISMATCH'),
    visible_context_approval_valid: ![...codes].some((code) => code.startsWith('STAGE23_APPROVAL')),
    narrator_prose_present: isObject(prose),
    narrator_prose_schema_valid: !codes.has('STAGE23_PROSE_SCHEMA_INVALID'),
    narrator_prose_digest_valid: !codes.has('STAGE23_PROSE_DIGEST_MISMATCH'),
    prose_not_empty: text(prose?.prose),
    action_options_schema_valid: ![...codes].some((code) => code.startsWith('STAGE23_ACTION_')),
    all_action_target_refs_exist_in_visible_context: !codes.has('STAGE23_ACTION_TARGET_NOT_VISIBLE'),
    all_used_visible_refs_exist: !codes.has('STAGE23_USED_REF_UNKNOWN'),
    self_constraints_check_present: isObject(prose?.self_constraints_check),
    audit_policy_valid: ![...codes].some((code) => code.startsWith('STAGE23_POLICY')),
    no_forbidden_input_fields: ![...codes].some((code) => code.includes('FORBIDDEN_FIELD') || code.includes('EXTRA_FIELD')),
    no_raw_json_detected: !codes.has('STAGE23_TECHNICAL_TEXT_PRESENT'),
    no_schema_debug_audit_terms_detected: !codes.has('STAGE23_TECHNICAL_TEXT_PRESENT'),
    must_not_include_structural_refs_absent: !codes.has('STAGE23_MUST_NOT_INCLUDE_REF_USED')
  };
  return Object.freeze({
    version: 1,
    schema: STAGE23_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: input?.visible_context_package_digest ?? null,
    narrator_starting_prose_digest: input?.narrator_starting_prose_digest ?? null,
    pass: concerns.length === 0 && Object.values(checks).every(Boolean),
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 23 exact input validated', 'visible package and narrator prose digests match', 'narrator prose structural references validated']
      : concerns.map((item) => `${item.code}:${item.field}`)
  });
}
