const SAFE_WRITE_PLAN_FAILURES = new Set([
  'write_plan_invariant:visible_package_persistence_gap:presentation_write_owner_invalid',
  'write_plan_invariant:generated_schema_mismatch:write_record_shape_or_mode_invalid',
  'write_plan_invariant:state_version_conflict:write_identity_conflict',
  'write_plan_invariant:generated_schema_mismatch:child_parent_missing',
  'write_plan_invariant:lock_order_violation:physical_lock_key_missing',
  'write_plan_invariant:generated_schema_mismatch:change_set_binding_invalid',
  'write_plan_invariant:target_preparation_failed:first_entry_location_binding_invalid',
  'write_plan_invariant:target_preparation_failed:first_entry_claim_binding_invalid',
  'write_plan_invariant:target_preparation_failed:first_entry_reuse_contains_inserts',
  'write_plan_invariant:target_preparation_failed:first_entry_created_chain_binding_invalid',
  'write_plan_invariant:state_version_conflict:expected_state_version_set_invalid',
  'write_plan_invariant:generated_schema_mismatch:blocked_audit_write_set_invalid'
]);
const SAFE_NARRATION_PHASES = new Set([
  'output_validation', 'audit_validation', 'semantic_repair_validation',
  'reassembled_output_validation', 'final_audit_validation',
  'final_audit_failed'
]);
const SAFE_NARRATION_CONCERN_KINDS = new Set([
  'unsupported_fact', 'unsupported_attempt', 'unsupported_success',
  'unsupported_object_use', 'unsupported_result', 'unsupported_sensory',
  'unsupported_event', 'unsupported_world_state', 'unsupported_npc_state',
  'contradiction', 'hidden_knowledge'
]);
const SAFE_NPC_VALIDATION_CODES = new Set([
  'npc_step_request_invalid', 'npc_step_envelope_invalid',
  'npc_step_interpretation_invalid', 'npc_step_resolution_invalid',
  'npc_step_goal_result_invalid', 'npc_step_activity_invalid',
  'npc_step_operations_invalid', 'npc_step_check_invalid',
  'npc_step_reason_invalid',
  'npc_combat_envelope_invalid', 'npc_combat_decision_invalid',
  'npc_combat_operation_shape_invalid', 'npc_combat_intent_choice_invalid',
  'npc_combat_ref_choice_invalid', 'npc_combat_force_choice_invalid',
  'npc_combat_risk_choice_invalid', 'npc_combat_statement_invalid',
  'npc_combat_reason_invalid', 'invalid_enum'
]);
const SAFE_TURN_STEP_VALIDATION_CODES = new Set([
  'additional_property', 'candidate', 'const', 'continuation',
  'domain_owner_unavailable', 'echo_mismatch', 'enum', 'invalid_request',
  'json_data', 'lineage', 'maximum', 'min_items', 'operation_shape',
  'ordering', 'prepared_followup_binding', 'range', 'required', 'resolution',
  'sequence', 'type', 'unique', 'unknown_ref'
]);
const SAFE_TURN_STEP_VALIDATION_SCOPES = new Set([
  'operation', 'interpretation', 'activity', 'check', 'continuation',
  'clarification', 'plan'
]);
const SAFE_NPC_VALIDATION_SCOPES = new Set(['plan', 'interpretation',
  'resolution', 'goal_result', 'activity', 'operations', 'check', 'reason',
  'speech_dominant_act']);

export function safeWritePlanFailure(value = {}) {
  const details = value?.details ?? value;
  const diagnostics = details?.diagnostics ?? value;
  const code = text(value?.code);
  const detailCode = text(value?.detail_code ?? details?.code);
  const stage = text(value?.stage ?? diagnostics?.stage);
  const reason = text(value?.reason ?? diagnostics?.reason)
    .replace(/\s+/gu, ' ').slice(0, 500);
  if (!/^TRACE_[A-Z0-9_]+_WRITE_PLAN_REJECTED$/u.test(code)
      || !SAFE_WRITE_PLAN_FAILURES.has(`${stage}:${detailCode}:${reason}`)) return null;
  return Object.freeze({ code, detail_code: detailCode, stage, reason });
}
export function safeTurnFailure(value = {}) {
  return safeWritePlanFailure(value) ?? safeNarrationFailure(value)
    ?? safeNpcFailure(value) ?? safeTurnStepFailure(value);
}
function safeTurnStepFailure(value = {}) {
  if (text(value?.code) !== 'TURN_STEP_PLAN_INVALID') return null;
  const source = Array.isArray(value?.validation_codes)
    ? value.validation_codes : value?.details?.errors?.map(({ code }) => code);
  const codes = Array.isArray(source)
    ? [...new Set(source.map(text)
      .filter((code) => SAFE_TURN_STEP_VALIDATION_CODES.has(code)))] : [];
  const errors = Array.isArray(value?.details?.errors) ? value.details.errors : [];
  const sourceScopes = Array.isArray(value?.validation_scopes)
    ? value.validation_scopes
    : [...new Set(errors.map(({ path }) => turnStepValidationScope(path)).filter(Boolean))];
  const scopes = [...new Set(sourceScopes.map(text)
    .filter((scope) => SAFE_TURN_STEP_VALIDATION_SCOPES.has(scope)))];
  return codes.length === 0 ? null : Object.freeze({
    code: 'TURN_STEP_PLAN_INVALID', validation_codes: Object.freeze(codes),
    ...(scopes.length === 0 ? {} : { validation_scopes: Object.freeze(scopes) })
  });
}
function turnStepValidationScope(path) {
  const value = text(path);
  if (/^\$\.operations(?:\[\d+\])?(?:\.|$)/u.test(value)) return 'operation';
  for (const scope of ['interpretation', 'activity', 'check', 'continuation',
    'clarification']) if (value === `$.${scope}` || value.startsWith(`$.${scope}.`)) return scope;
  return /^\$\.[a-z_]+$/u.test(value) ? 'plan' : null;
}
function safeNpcFailure(value = {}) {
  if (text(value?.code) !== 'TURN_NPC_PLAN_INVALID') return null;
  const source = Array.isArray(value?.validation_codes)
    ? value.validation_codes
    : value?.details?.validation_errors?.map(({ code }) => code);
  const codes = Array.isArray(source)
    ? [...new Set(source.map(text)
      .filter((code) => SAFE_NPC_VALIDATION_CODES.has(code)))] : [];
  const errors = Array.isArray(value?.details?.validation_errors)
    ? value.details.validation_errors : [];
  const sourceScopes = Array.isArray(value?.validation_scopes)
    ? value.validation_scopes
    : [...new Set(errors.map(({ path }) => npcValidationScope(path)).filter(Boolean))];
  const scopes = [...new Set(sourceScopes.map(text)
    .filter((scope) => SAFE_NPC_VALIDATION_SCOPES.has(scope)))];
  return codes.length === 0 ? null : Object.freeze({
    code: 'TURN_NPC_PLAN_INVALID', validation_codes: Object.freeze(codes),
    ...(scopes.length === 0 ? {} : { validation_scopes: Object.freeze(scopes) })
  });
}
function npcValidationScope(path) {
  const value = text(path);
  if (value === '$.speech.dominant_act') return 'speech_dominant_act';
  if (value === '$') return 'plan';
  return /^\$\.(interpretation|resolution|goal_result|activity|operations|check|reason)(?:\.|$)/u
    .exec(value)?.[1] ?? null;
}
function safeNarrationFailure(value = {}) {
  if (text(value?.code) !== 'TRACE_PHASE_2_NARRATION_REJECTED') return null;
  const details = value?.details ?? value;
  const phase = text(details.phase);
  if (!SAFE_NARRATION_PHASES.has(phase)) return null;
  const concernCount = Number(details.concern_count);
  const concernKinds = Array.isArray(details.concern_kinds)
    ? [...new Set(details.concern_kinds.map(text)
      .filter((kind) => SAFE_NARRATION_CONCERN_KINDS.has(kind)))] : [];
  return Object.freeze({
    code: 'TRACE_PHASE_2_NARRATION_REJECTED', phase, concern_kinds: Object.freeze(concernKinds),
    concern_count: Number.isInteger(concernCount) && concernCount >= 0
      ? concernCount : 0
  });
}
function text(value) { return String(value ?? '').trim(); }
