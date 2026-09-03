import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks, validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { NARRATION_FLOW_RESULT_SCHEMA } from './contracts.js';
import { validateNarrationPorts } from './ports.js';
import { assertNarrationValid, validateNarrationAudit, validateNarrationFlowResult, validateNarrationOutput, validateNarrationRequest, validateNarrationSemanticRepair } from './validators.js';

export async function runNarrationFlow(request, ports, options = {}) {
  assertNarrationValid('narration_request', validateNarrationRequest(request));
  validateNarrationPorts(ports);
  rejectHidden(request.visible_context, 'visible_context');
  rejectHidden(request.context ?? {}, 'context');
  assertNarrationValid('visible_context', validateVisibleContext(request.visible_context));
  const maxFormatRepairs = Math.min(1, Number(options.maxRepairs ?? request.max_repairs ?? 1));
  const generationHistory = [], repairHistory = [], auditHistory = [];
  const writerRequest = clone(request);
  if (writerRequest.context != null) delete writerRequest.context.attempt;
  let draft = await ports.writer.generate(writerRequest);
  generationHistory.push(record('writer', draft));
  let errors = outputErrors(draft, request.request_id);
  if (errors.length && maxFormatRepairs > 0) {
    draft = await ports.formatRepairer.repair({ version: 1, schema: 'narration_format_repair_request', request: clone(writerRequest), invalid_output: clone(draft), validation_errors: errors, attempt: 1 });
    repairHistory.push(record('format_repair', draft));
    generationHistory.push(record('format_repairer', draft));
    errors = outputErrors(draft, request.request_id);
  }
  if (errors.length) return blocked(request, generationHistory, repairHistory, auditHistory, 'output_validation', errors);

  const segments = segmentProse(draft.prose);
  const audit = await audited(ports.auditor, request, draft, segments, 'initial');
  auditHistory.push(record('auditor', audit));
  const auditErrors = validateNarrationAudit(audit, segmentIds(segments)).errors;
  if (auditErrors.length) return blocked(request, generationHistory, repairHistory, auditHistory, 'audit_validation', auditErrors);
  if (audit.pass) return approved(request, draft, audit, generationHistory, repairHistory, auditHistory);

  const repairSegment = {
    segment_id: 's1', prose: draft.prose, nearby_context: []
  };
  const repairConcerns = audit.concerns.map((concern) => ({
    ...clone(concern), segment_id: repairSegment.segment_id
  }));
  const confirmedOutcome = confirmedOutcomeContext(request);
  const repair = await ports.semanticRepairer.repair({
    version: 1,
    schema: 'narration_semantic_repair_request',
    request_id: request.request_id,
    visible_context: clone(request.visible_context),
    ...(confirmedOutcome ? { confirmed_outcome: confirmedOutcome } : {}),
    style_policy: clone(request.style_policy ?? {}),
    concerns: repairConcerns,
    segments: [repairSegment]
  });
  generationHistory.push(record('semantic_repairer', repair));
  repairHistory.push(record('semantic_repair', repair));
  const repairErrors = validateNarrationSemanticRepair(
    repair, [repairSegment.segment_id]).errors;
  if (repairErrors.length) return blocked(request, generationHistory, repairHistory, auditHistory, 'semantic_repair_validation', repairErrors);
  const repaired = { ...draft, prose: repair.replacements[0].prose };
  errors = outputErrors(repaired, request.request_id);
  if (errors.length) return blocked(request, generationHistory, repairHistory, auditHistory, 'reassembled_output_validation', errors);

  const finalSegments = segmentProse(repaired.prose);
  const finalAudit = await audited(ports.auditor, request, repaired, finalSegments, 'final');
  auditHistory.push(record('auditor', finalAudit));
  const finalErrors = validateNarrationAudit(finalAudit, segmentIds(finalSegments)).errors;
  if (finalErrors.length) return blocked(request, generationHistory, repairHistory, auditHistory, 'final_audit_validation', finalErrors);
  if (!finalAudit.pass) return blocked(request, generationHistory, repairHistory, auditHistory, 'final_audit_failed', finalAudit.concerns);
  return approved(request, repaired, finalAudit, generationHistory, repairHistory, auditHistory);
}

export function createNarrationService(ports, defaults = {}) {
  validateNarrationPorts(ports);
  return Object.freeze({ run(request, options = {}) { return runNarrationFlow({ ...clone(defaults.request ?? {}), ...clone(request) }, ports, { ...defaults.options, ...options }); } });
}

export function segmentProse(prose) {
  const chunks = String(prose).match(/[^.!?…]+(?:[.!?…]+|$)(?:\s*)/g) ?? [String(prose)];
  return chunks.filter(Boolean).map((text, index) => ({ segment_id: `s${index + 1}`, prose: text }));
}

function audited(auditor, request, draft, segments, phase) {
  const actionIntent = actionIntentContext(request);
  const confirmedOutcome = confirmedOutcomeContext(request);
  return auditor.audit({ version: 1, schema: 'narration_semantic_audit_request', phase, output: clone(draft), visible_context: clone(request.visible_context), ...(actionIntent ? { action_intent_context: actionIntent } : {}), ...(confirmedOutcome ? { confirmed_outcome: confirmedOutcome } : {}), style_policy: clone(request.style_policy ?? {}), segments: clone(segments) });
}
function actionIntentContext(request) {
  const source = request.context ?? {};
  if (source.attempt == null) return null;
  return {
    evidence_scope: 'intent_only_non_evidence_of_success',
    attempt: clone(source.attempt)
  };
}
function confirmedOutcomeContext(request) {
  return request.context?.outcome == null
    ? null : clone(request.context.outcome);
}
function segmentIds(segments) { return segments.map((segment) => segment.segment_id); }
function approved(request, draft, audit, generationHistory, repairHistory, auditHistory) {
  return finish(buildResult({ request, status: 'approved', draft, finalAudit: audit, generationHistory, repairHistory, auditHistory }));
}
function blocked(request, generationHistory, repairHistory, auditHistory, phase, errors) {
  return finish(buildResult({ request, status: 'blocked', generationHistory, repairHistory, auditHistory, diagnostics: { phase, errors: clone(errors) } }));
}
function buildResult({ request, status, draft = null, finalAudit = null, generationHistory, repairHistory, auditHistory, diagnostics = {} }) {
  return { version: 1, schema: NARRATION_FLOW_RESULT_SCHEMA, request_id: request.request_id, surface: request.surface, status, pass: status === 'approved', approved_output: status === 'approved' ? clone(draft) : null, final_audit: status === 'approved' ? clone(finalAudit) : null, repair_request: null, generation_history: clone(generationHistory), audit_history: clone(auditHistory), repair_history: clone(repairHistory), diagnostics: { ...clone(diagnostics), repairs_used: repairHistory.filter((entry) => entry.role !== 'route').length } };
}
function finish(result) { assertNarrationValid('narration_flow_result', validateNarrationFlowResult(result)); return deepFreeze(result); }
function rejectHidden(value, label) {
  const leaks = detectHiddenLeaks(value);
  if (!leaks.length) return;
  const error = new Error(`${label} contains hidden data`);
  error.code = 'NARRATION_HIDDEN_LEAK';
  error.details = { leaks };
  throw error;
}
function outputErrors(value, requestId) {
  const errors = [...validateNarrationOutput(value).errors];
  if (value?.output_id != null && value.output_id !== requestId) errors.push('output_id must match request_id');
  if (Array.isArray(value?.action_options) && value.action_options.length) errors.push('action_options must be empty until visible_context defines action candidates');
  if (Array.isArray(value?.used_references) && value.used_references.length) errors.push('used_references must be empty until visible_context defines reference vocabulary');
  const leaks = detectHiddenLeaks(value);
  if (leaks.length) errors.push(...leaks.map((leak) => `hidden leak: ${leak}`));
  return errors;
}
function record(role, value) { return { role, value: clone(value) }; }
function clone(value) { return value == null ? value : structuredClone(value); }
