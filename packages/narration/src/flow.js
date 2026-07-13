import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import {
  NARRATION_FLOW_RESULT_SCHEMA,
  NARRATION_REPAIR_ROUTE_SCHEMA
} from './contracts.js';
import { validateNarrationPorts } from './ports.js';
import {
  assertNarrationValid,
  validateNarrationAudit,
  validateNarrationFlowResult,
  validateNarrationOutput,
  validateNarrationRepairRoute,
  validateNarrationRequest
} from './validators.js';

export async function runNarrationFlow(request, ports, options = {}) {
  assertNarrationValid('narration_request', validateNarrationRequest(request));
  validateNarrationPorts(ports);
  rejectHidden(request.visible_context, 'visible_context');
  rejectHidden(request.context ?? {}, 'context');

  const maxRepairs = Number(options.maxRepairs ?? request.max_repairs ?? 1);
  const generationHistory = [];
  const auditHistory = [];
  const repairHistory = [];
  let repairsUsed = 0;

  let draft = await ports.writer.generate(clone(request));
  generationHistory.push(record('writer', draft));

  let outputValidation = validateNarrationOutput(draft);
  if (!outputValidation.ok && maxRepairs > 0) {
    draft = await ports.formatRepairer.repair({
      version: 1,
      schema: 'narration_format_repair_request',
      request: clone(request),
      invalid_output: clone(draft),
      validation_errors: [...outputValidation.errors],
      attempt: 1
    });
    repairsUsed += 1;
    repairHistory.push(record('format_repair', draft));
    generationHistory.push(record('format_repairer', draft));
    outputValidation = validateNarrationOutput(draft);
  }
  if (!outputValidation.ok) {
    return finish(buildResult({ request, status: 'blocked', generationHistory, auditHistory, repairHistory,
      diagnostics: { phase: 'output_validation', errors: outputValidation.errors } }));
  }
  rejectHidden(draft, 'narration_output');

  let audit = await ports.auditor.audit(buildAuditRequest(request, draft, false));
  auditHistory.push(record('auditor', audit));
  let auditValidation = validateNarrationAudit(audit);
  if (!auditValidation.ok) {
    audit = await ports.seniorAuditor.audit(buildAuditRequest(request, draft, true, auditValidation.errors));
    auditHistory.push(record('senior_auditor_format_recovery', audit));
    auditValidation = validateNarrationAudit(audit);
  }
  if (!auditValidation.ok) {
    return finish(buildResult({ request, status: 'blocked', generationHistory, auditHistory, repairHistory,
      diagnostics: { phase: 'audit_validation', errors: auditValidation.errors } }));
  }
  if (audit.pass === true) {
    return finish(buildResult({ request, status: 'approved', draft, audit, generationHistory, auditHistory, repairHistory }));
  }

  const route = await ports.router.route({
    version: 1,
    schema: NARRATION_REPAIR_ROUTE_SCHEMA,
    request: clone(request),
    draft: clone(draft),
    audit: clone(audit),
    repairs_remaining: Math.max(0, maxRepairs - repairsUsed)
  });
  assertNarrationValid('narration_repair_route', validateNarrationRepairRoute(route));
  repairHistory.push(record('route', route));

  const repairsRemaining = Math.max(0, maxRepairs - repairsUsed);
  if (route.route === 'upstream_repair' || route.route === 'block' || repairsRemaining === 0) {
    return finish(buildResult({
      request,
      status: route.route === 'block' ? 'blocked' : 'repair_required',
      generationHistory,
      auditHistory,
      repairHistory,
      repairRequest: route.route === 'block' ? null : upstreamRepair(request, audit, route),
      diagnostics: { phase: 'routing', route: route.route }
    }));
  }

  const repairRequest = {
    version: 1,
    schema: 'narration_repair_request',
    request: clone(request),
    prior_output: clone(draft),
    prior_audit: clone(audit),
    route: clone(route),
    attempt: 1
  };
  draft = route.route === 'format_repair'
    ? await ports.formatRepairer.repair(repairRequest)
    : await ports.seniorWriter.repair(repairRequest);
  repairsUsed += 1;
  repairHistory.push(record(route.route, draft));
  generationHistory.push(record(route.route === 'format_repair' ? 'format_repairer' : 'senior_writer', draft));
  assertNarrationValid('repaired_narration_output', validateNarrationOutput(draft));
  rejectHidden(draft, 'repaired_narration_output');

  audit = await ports.seniorAuditor.audit(buildAuditRequest(request, draft, true));
  auditHistory.push(record('senior_auditor', audit));
  assertNarrationValid('senior_narration_audit', validateNarrationAudit(audit));
  if (audit.pass !== true) {
    return finish(buildResult({
      request,
      status: 'repair_required',
      generationHistory,
      auditHistory,
      repairHistory,
      repairRequest: upstreamRepair(request, audit, route),
      diagnostics: { phase: 'senior_audit', route: route.route }
    }));
  }
  return finish(buildResult({ request, status: 'approved', draft, audit, generationHistory, auditHistory, repairHistory }));
}

export function createNarrationService(ports, defaults = {}) {
  validateNarrationPorts(ports);
  return Object.freeze({
    run(request, options = {}) {
      return runNarrationFlow({ ...clone(defaults.request ?? {}), ...clone(request) }, ports, { ...defaults.options, ...options });
    }
  });
}

function buildAuditRequest(request, draft, senior, validationErrors = []) {
  return {
    version: 1,
    schema: 'narration_audit_request',
    request: clone(request),
    draft: clone(draft),
    senior,
    validation_errors: [...validationErrors]
  };
}

function buildResult({ request, status, draft = null, audit = null, generationHistory, auditHistory, repairHistory, repairRequest = null, diagnostics = {} }) {
  return {
    version: 1,
    schema: NARRATION_FLOW_RESULT_SCHEMA,
    request_id: request.request_id,
    surface: request.surface,
    status,
    pass: status === 'approved',
    approved_output: status === 'approved' ? clone(draft) : null,
    final_audit: status === 'approved' ? clone(audit) : null,
    repair_request: clone(repairRequest),
    generation_history: clone(generationHistory),
    audit_history: clone(auditHistory),
    repair_history: clone(repairHistory),
    diagnostics: { ...clone(diagnostics), repairs_used: repairHistory.filter((entry) => entry.role !== 'route').length }
  };
}

function upstreamRepair(request, audit, route) {
  return {
    version: 1,
    schema: 'narration_upstream_repair_request',
    request_id: request.request_id,
    return_to: route.return_to ?? 'visible_projection',
    concerns: clone(audit.concerns),
    evidence: clone(audit.evidence),
    reason: route.reason
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
function record(role, value) { return { role, value: clone(value) }; }
function clone(value) { return value == null ? value : structuredClone(value); }
