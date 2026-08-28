import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks, validateVisibleContext } from '@rus/visibility-knowledge-memory';
import {
  NARRATION_FLOW_RESULT_SCHEMA
} from './contracts.js';
import { validateNarrationPorts } from './ports.js';
import {
  assertNarrationValid,
  validateNarrationFlowResult,
  validateNarrationOutput,
  validateNarrationRequest
} from './validators.js';

export async function runNarrationFlow(request, ports, options = {}) {
  assertNarrationValid('narration_request', validateNarrationRequest(request));
  validateNarrationPorts(ports);
  rejectHidden(request.visible_context, 'visible_context');
  rejectHidden(request.context ?? {}, 'context');
  assertNarrationValid('visible_context', validateVisibleContext(request.visible_context));

  const maxRepairs = Math.min(1, Number(options.maxRepairs ?? request.max_repairs ?? 1));
  const generationHistory = [];
  const repairHistory = [];

  let draft = await ports.writer.generate(clone(request));
  generationHistory.push(record('writer', draft));

  let errors = outputErrors(draft, request.request_id);
  if (errors.length && maxRepairs > 0) {
    draft = await ports.formatRepairer.repair({
      version: 1,
      schema: 'narration_format_repair_request',
      request: clone(request),
      invalid_output: clone(draft),
      validation_errors: errors,
      attempt: 1
    });
    repairHistory.push(record('format_repair', draft));
    generationHistory.push(record('format_repairer', draft));
    errors = outputErrors(draft, request.request_id);
  }
  if (errors.length) {
    return finish(buildResult({ request, status: 'blocked', generationHistory, repairHistory,
      diagnostics: { phase: 'output_validation', errors } }));
  }
  return finish(buildResult({ request, status: 'approved', draft, generationHistory, repairHistory }));
}

export function createNarrationService(ports, defaults = {}) {
  validateNarrationPorts(ports);
  return Object.freeze({
    run(request, options = {}) {
      return runNarrationFlow({ ...clone(defaults.request ?? {}), ...clone(request) }, ports, { ...defaults.options, ...options });
    }
  });
}

function buildResult({ request, status, draft = null, generationHistory, repairHistory, diagnostics = {} }) {
  return {
    version: 1,
    schema: NARRATION_FLOW_RESULT_SCHEMA,
    request_id: request.request_id,
    surface: request.surface,
    status,
    pass: status === 'approved',
    approved_output: status === 'approved' ? clone(draft) : null,
    final_audit: status === 'approved' ? deterministicAudit() : null,
    repair_request: null,
    generation_history: clone(generationHistory),
    audit_history: [],
    repair_history: clone(repairHistory),
    diagnostics: { ...clone(diagnostics), repairs_used: repairHistory.filter((entry) => entry.role !== 'route').length }
  };
}
function deterministicAudit() {
  return {
    version: 1,
    schema: 'narration_audit',
    pass: true,
    concerns: [],
    evidence: ['Deterministic schema and visible-only validation passed.']
  };
}

function finish(result) {
  assertNarrationValid('narration_flow_result', validateNarrationFlowResult(result));
  return deepFreeze(result);
}
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
