import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';

function requireRoleRunner(roleRunner) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING',
    'Configured LLM role runner is required.', { status: 503 });
}

export function createLowerDvinaTraceNarrationService({ roleRunner } = {}) {
  requireRoleRunner(roleRunner);
  return createNarrationService({
    writer: { generate: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator',
      'Return only {"prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. The server assembles version, schema, and output_id. Use context.player_input only to understand attempted action or speech. It is never evidence of success or a new world fact. Ground every factual or result claim, action_options, used_references, and self_check exclusively in visible_context. An actionable object may be named only when it is already in the approved visible projection; narration never creates, discovers, or promotes an entity.',
      request) },
    formatRepairer: { repair: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_format_repair',
      'Return only one repaired semantic JSON object: {"prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. The server assembles version, schema, and output_id. Repair JSON shape only; prose, action_options, used_references, and self_check must remain grounded exclusively in request.visible_context.',
      request) },
    auditor: { audit: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_auditor', narrationAuditInstruction(request), request) },
    semanticRepairer: { repair: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_semantic_repair',
      'Return only {"replacements":[{"prose":"<replacement>"}]} in the same order as supplied flagged segments. The server assembles version, schema, and immutable segment_id values. Repair only supplied flagged segments using their concerns, read-only nearby_context, and player-safe visible_context. Return one replacement for each flagged segment and no others. Do not use hidden state, change neighboring segments, infer facts, add a fallback, or call any other role.',
      request) }
  });
}

async function runNarrationRole(roleRunner, roleId, instruction, request) {
  const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
    request_identity: request.request_id ?? request.request?.request_id,
    messages: [{ role: 'system', content: instruction },
      { role: 'user', content: JSON.stringify(request) }],
    overrides: { temperature: 0 } });
  if (!response?.output || typeof response.output !== 'object') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING',
    `Narration role ${roleId} returned no JSON object.`, { status: 503 });
  return assembleNarrationRoleOutput(roleId, response.output, request);
}

export function assembleNarrationRoleOutput(roleId, output, request) {
  if (['gameplay_narrator', 'gameplay_narrator_format_repair']
    .includes(roleId)) return {
    version: 1, schema: 'narration_output',
    output_id: request.request_id ?? request.request?.request_id,
    prose: output.prose, action_options: structuredClone(output.action_options),
    used_references: structuredClone(output.used_references),
    self_check: structuredClone(output.self_check)
  };
  if (roleId === 'gameplay_narrator_auditor') return {
    version: 1, schema: 'narration_audit', pass: output.pass,
    concerns: Array.isArray(output.concerns)
      ? output.concerns.map((concern) => ({
          segment_id: narrationSegmentId(request, concern.segment_choice),
          kind: concern.kind, reason: concern.reason
        })) : output.concerns,
    evidence: structuredClone(output.evidence)
  };
  if (roleId === 'gameplay_narrator_semantic_repair') return {
    version: 1, schema: 'narration_semantic_repair',
    replacements: Array.isArray(output.replacements)
      ? output.replacements.map((replacement, index) => ({
          segment_id: request.segments?.[index]?.segment_id,
          prose: replacement.prose
        })) : output.replacements
  };
  return output;
}

function narrationAuditInstruction(request) {
  const choices = (request.segments ?? []).map((segment, index) => ({
    segment_choice: `segment_${index + 1}`, prose: segment.prose
  }));
  return `Return only the semantic audit: PASS {"pass":true,"concerns":[],"evidence":["visible facts only"]}; FAIL {"pass":false,"concerns":[{"segment_choice":"<supplied segment choice>","kind":"unsupported_fact","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}. Choose only from these request-local segment choices: ${JSON.stringify(choices)}. The server assembles version, schema, and immutable segment_id values. Audit only the supplied full narration output against the same player-safe visible_context, style_policy, and segments. Do not use hidden state, infer world facts, rewrite prose, add a fallback, or call any other role.`;
}

function narrationSegmentId(request, choice) {
  const match = /^segment_(\d+)$/u.exec(choice ?? '');
  return match ? request.segments?.[Number(match[1]) - 1]?.segment_id : undefined;
}
