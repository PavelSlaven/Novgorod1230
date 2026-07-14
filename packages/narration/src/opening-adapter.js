import { deepFreeze } from '@rus/kernel';
import { NARRATION_AUDIT_SCHEMA, NARRATION_FLOW_RESULT_SCHEMA, NARRATION_OUTPUT_SCHEMA } from './contracts.js';
import { assertNarrationValid, validateNarrationFlowResult } from './validators.js';

export function adaptApprovedOpeningNarration({ stage22Result, stage23Result } = {}) {
  if (!plain(stage22Result) || stage22Result.schema !== 'stage22_narrator_prose_result' || stage22Result.pass !== true) {
    throw adapterError('OPENING_STAGE22_APPROVAL_REQUIRED', 'Successful Stage 22 result is required.');
  }
  if (!plain(stage23Result) || stage23Result.schema !== 'stage23_narrator_prose_audit_result' || stage23Result.pass !== true) {
    throw adapterError('OPENING_STAGE23_APPROVAL_REQUIRED', 'Successful Stage 23 result is required.');
  }
  if (stage22Result.request_id !== stage23Result.request_id) {
    throw adapterError('OPENING_NARRATION_REQUEST_MISMATCH', 'Stage 22 and Stage 23 request IDs differ.');
  }
  const prose = stage22Result.narrator_starting_prose;
  const audit = stage23Result.narrator_prose_audit;
  if (!plain(prose) || !text(prose.prose)) throw adapterError('OPENING_NARRATION_OUTPUT_INVALID', 'Stage 22 prose is invalid.');
  if (!plain(audit) || audit.pass !== true) throw adapterError('OPENING_NARRATION_AUDIT_INVALID', 'Stage 23 audit is invalid.');
  for (const key of ['can_show_to_player', 'can_write_player_visible_message']) {
    if (stage23Result.commit_permission?.[key] !== true) throw adapterError('OPENING_NARRATION_PERMISSION_DENIED', `${key} permission is required.`);
  }

  const result = {
    version: 1,
    schema: NARRATION_FLOW_RESULT_SCHEMA,
    request_id: stage22Result.request_id,
    surface: 'first_game',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: NARRATION_OUTPUT_SCHEMA,
      output_id: `opening:${stage22Result.request_id}`,
      prose: prose.prose,
      action_options: clone(prose.action_options ?? []),
      used_references: clone(prose.used_visible_context_refs ?? []),
      self_check: clone(prose.self_constraints_check ?? {})
    },
    final_audit: {
      version: 1,
      schema: NARRATION_AUDIT_SCHEMA,
      pass: true,
      concerns: [],
      evidence: clone(audit.evidence ?? ['Approved by Stage 23.'])
    },
    repair_request: null,
    generation_history: clone(stage22Result.generation_history ?? []),
    audit_history: clone(stage23Result.audit_history ?? []),
    repair_history: [],
    diagnostics: {
      source: 'new_game_stages_22_23',
      visible_context_package_digest: stage22Result.visible_context_package_digest,
      narrator_starting_prose_digest: stage23Result.narrator_starting_prose_digest
    }
  };
  assertNarrationValid('opening_narration_flow_result', validateNarrationFlowResult(result));
  return deepFreeze(result);
}

function adapterError(code, message) { const error = new Error(message); error.code = code; return error; }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
