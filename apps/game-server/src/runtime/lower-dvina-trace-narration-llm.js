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
      'Return only {"prose":"<visible-only prose in Russian>","action_options":[],"used_references":[],"self_check":{}}. The server assembles version, schema, and output_id. Write connected, restrained literary Russian through the character\'s perception, not a report of game state. Turn the supplied facts into one concrete scene; select the few details relevant now instead of cataloguing every field. Never expose field names, IDs, numeric body values, route-system terms, current-location language, object-absence reports, or other implementation vocabulary. Faithfully paraphrase mechanical source wording when needed for natural prose, without adding detail, causation, or certainty. Make the confirmed result of the current action clear. Use context.attempt only when needed to identify what the character tried or said; it is never evidence of success, object use, or a new world fact. Keep an attempted action separate from its confirmed result. If no result is confirmed, express the supplied uncertainty naturally. context.outcome contains only confirmed positive scene facts: movement wording is allowed only when movement_committed is true. Missing or false outcome fields are silent constraints, never material for prose. When visible_context.visible_changes is nonempty, convey every material new change, integrating them into the scene rather than listing them. Use only relevant player-safe known_context, visible people, objects, sensory details, and routes; do not dump machine-like health or timestamp entries. Preserve uncertainties and do_not_imply. Do not infer a causal bridge or exact success mechanism from intent plus result. Every factual claim must remain inside visible_context; an actionable object may be named as existing only when it is already in the approved visible projection. Absence from visible_npc or visible_objects does not prove emptiness, silence, or absence from the wider world. A visible physical feature does not by itself authorize its sound, smell, temperature, bodily effect, history, or recent use. Use no modern slang, pseudo-medieval archaisms, theatrical padding, or encyclopedic explanation.',
      request) },
    formatRepairer: { repair: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_format_repair',
      'Return only one repaired semantic JSON object: {"prose":"<visible-only prose in Russian>","action_options":[],"used_references":[],"self_check":{}}. The server assembles version, schema, and output_id. Repair JSON shape while keeping connected, restrained literary Russian rather than game-state terminology. request.context.attempt may ground only that the player attempted an action or spoke; it never proves success or a world-state change. request.context.outcome permits movement wording only when movement_committed is true; absent fields are silent constraints. Convey every material visible_change naturally, preserve relevant player-safe context and uncertainties, omit machine-like values and unrelated context, and ground every factual claim exclusively in request.visible_context.',
      request) },
    auditor: { audit: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_auditor', narrationAuditInstruction(request), request) },
    semanticRepairer: { repair: (request) => runNarrationRole(roleRunner,
      'gameplay_narrator_semantic_repair',
      'Return only {"replacements":[{"prose":"<replacement in Russian>"}]} in the same order as supplied flagged segments. The server assembles version, schema, and immutable segment_id values. Repair only supplied flagged segments using their concerns, read-only nearby_context, player-safe visible_context, and optional action_intent_context. Remove unsupported claims. For technical_presentation, preserve the supported meaning but rewrite it as connected, restrained literary Russian without field language, IDs, numeric-stat dumps, system reports, modern slang, or pseudo-archaic decoration. A faithful natural paraphrase of visible_context is allowed; it must not add detail, causation, exact object use, or success. action_intent_context may ground only that the player attempted an action or spoke, never its success. If neither source supports a statement, omit it. Return one replacement for each flagged segment and no others. Do not use hidden state, change neighboring segments, infer facts, add a fallback, or call any other role.',
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
  return `Return only the semantic audit: PASS {"pass":true,"concerns":[],"evidence":["visible facts only"]}; FAIL {"pass":false,"concerns":[{"segment_choice":"<supplied segment choice>","kind":"<one allowed concern kind>","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}. Choose only from these request-local segment choices: ${JSON.stringify(choices)}. For unsupported claims choose the narrowest stable kind: unsupported_attempt, unsupported_success, unsupported_object_use, unsupported_result, unsupported_sensory, unsupported_event, unsupported_world_state, unsupported_npc_state, or unsupported_fact. Use technical_presentation when supported facts are rendered as a game-state report, field or route terminology, IDs, numeric-stat dumps, object-absence diagnostics, modern slang, pseudo-medieval archaism, or theatrical filler instead of natural restrained Russian prose. The server assembles version, schema, and immutable segment_id values. Audit the full narration against the same player-safe visible_context, including visible_context.known_context, optional action_intent_context, context.outcome, style_policy, and segments. A faithful natural paraphrase of visible_context is supported; do not require verbatim copying, but reject any added sensory detail, causation, certainty, or world fact. Empty visible_npc or visible_objects arrays do not prove that nobody or nothing is present, nor do they support silence or emptiness. A visible physical feature does not support an unstated sound, smell, temperature, bodily sensation, history, or recent use. context.outcome contains only confirmed positive scene facts and permits movement wording only when movement_committed is true. Missing or false outcome fields are silent constraints. action_intent_context may ground only that the player attempted an action or spoke; tools or objects named there remain intent-only and it never proves success, object use, a result, or a world/NPC state change. Intent plus a matching visible result may support separate attempt and result statements, never an unstated causal bridge or exact mechanism. Every material visible_change must be conveyed, but the narrator need not catalogue unrelated context. Plausibility is not evidence. If any segment has an unsupported claim or technical_presentation, pass must be false. Do not use hidden state, infer world facts, rewrite prose, add a fallback, or call another role.`;
}

function narrationSegmentId(request, choice) {
  const match = /^segment_(\d+)$/u.exec(choice ?? '');
  return match ? request.segments?.[Number(match[1]) - 1]?.segment_id : undefined;
}
