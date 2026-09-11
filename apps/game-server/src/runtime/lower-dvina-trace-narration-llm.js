import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';
import { assembleNarrationAuditOutput, narrationAuditInstruction } from
  './lower-dvina-trace-narration-audit.js';

const PROSE_RULES = 'Write connected, restrained literary Russian in second person. '
  + 'Put the current beat first. Convey every required_current_beat source once '
  + 'and preserve every proposition inside it: action, result, uncertainty, speaker '
  + 'and causal order. Required changes are ordered: narrate an earlier performed action '
  + 'before a later one, and never subordinate the earlier action to the later action. '
  + 'Every unresolved-result proposition inside a required change must remain explicitly unknown; performed handling '
  + 'stays performed even when its observation result is unknown. A pending goal '
  + 'does not undo a committed operation. Preserve confirmed speech verbatim. '
  + 'Render an unexecuted continuation as an open next choice, never as performed. '
  + 'Use optional support selectively to compose the beat; do not recap unchanged '
  + 'scene, inventory, body or NPC facts. Turn duration is code-owned UI metadata '
  + 'and is not supplied to prose; never invent elapsed minutes or report time spent. '
  + 'Combine related scene facts into a spatially coherent image instead of one '
  + 'sentence per input field. Sparse evidence '
  + 'calls for concise prose, not invented connective facts or a service report.';

const GROUNDING_RULES = 'Use only supplied player-safe facts and preserve certainty; '
  + 'plausibility is not evidence. Ground every sensation, action, temporal relation '
  + 'and causal link. Empty optional arrays are omissions, not absence or silence. '
  + 'A label supplies identity, not traits; a scene label supplies location, not '
  + 'ambience. Keep each NPC cue with its entity. Item placement proves only '
  + 'placement; actor movement requires confirmed_outcome.movement_committed=true. '
  + 'Missing or false outcome fields are silent constraints. action_intent supplies '
  + 'intention only, never execution, hearing, response, success or world fact. '
  + 'A committed transient attempt is independent evidence of performed physical '
  + 'contact; its unestablished observation does not negate that motion. Add no '
  + 'hidden fact, diagnosis, unsupported sensory detail, reaction or causal bridge.';

const WRITER_SHAPE = 'Return only {"prose":"<complete Russian prose>"}. The server assembles version, schema, output_id, action_options=[], used_references=[] and neutral self_check={}; do not generate those fields.';

export function createLowerDvinaTraceNarrationService({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'Configured LLM role runner is required.', { status: 503 });
  return createNarrationService({
    writer: { generate: (request) => runNarrationRole(roleRunner, 'gameplay_narrator',
      `${WRITER_SHAPE} ${PROSE_RULES} ${GROUNDING_RULES}`, request) },
    formatRepairer: { repair: (request) => runNarrationRole(roleRunner, 'gameplay_narrator_format_repair',
      `${WRITER_SHAPE} Repair the invalid JSON shape against validation_errors, retaining supported meaning. ${PROSE_RULES} ${GROUNDING_RULES}`, request) },
    auditor: { audit: (request) => runNarrationRole(roleRunner, 'gameplay_narrator_auditor',
      narrationAuditInstruction(request), request) },
    semanticRepairer: { repair: (request) => runNarrationRole(roleRunner, 'gameplay_narrator_semantic_repair',
      `Return only {"replacements":[{"prose":"<complete repaired Russian prose>"}]} with exactly one replacement. Rebuild the whole passage using concerns, not isolated sentence patches; concerns are not an exhaustive whitelist of defects. The replacement must differ from the rejected prose. Reapply every rule to the whole replacement, remove each unsupported claim and restore every omitted required meaning without repetition. For elapsed_as_service_report, remove the elapsed-time service wording; turn duration belongs only to the UI. With sparse support, shorten rather than embellish. If no supported meaning remains, return empty prose. The server assembles immutable segment_id. ${PROSE_RULES} ${GROUNDING_RULES}`, request) }
  });
}

function narrationWire(request) {
  const { request: original, ...outer } = request;
  const { visible_context, style_policy = {}, context, action_intent_context,
    ...rest } = original ? { ...original, ...outer } : outer;
  const { visible_changes, uncertainties, do_not_imply, allowed_tensions, ...support } = visible_context;
  const { outcome, ...otherContext } = context ?? {};
  return {
    ...rest,
    required_current_beat: {
      changes: visible_changes.map((text, index) => ({ ref: `visible_change_${index + 1}`, text })),
      uncertainties: uncertainties.map((text, index) => ({
        ref: `uncertainty_${index + 1}`, text, status: 'unperformed_result_unknown'
      }))
    },
    optional_support: visible_changes.length || uncertainties.length
      ? Object.fromEntries(['visible_scene', 'sensory_details'].filter(key => Object.hasOwn(support, key))
        .map(key => [key, support[key]]))
      : support,
    constraints: { do_not_imply, allowed_tensions, style_policy },
    ...(outcome === undefined ? {} : { confirmed_outcome: outcome }),
    ...(action_intent_context === undefined ? {} : { action_intent: action_intent_context }),
    ...(Object.keys(otherContext).length ? { context: otherContext } : {})
  };
}

async function runNarrationRole(roleRunner, roleId, instruction, request) {
  const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
    request_identity: request.request_id ?? request.request?.request_id,
    messages: [{ role: 'system', content: instruction },
      { role: 'user', content: JSON.stringify(narrationWire(request)) }],
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
    prose: output.prose, action_options: [], used_references: [],
    self_check: {}
  };
  if (roleId === 'gameplay_narrator_auditor') {
    return assembleNarrationAuditOutput(output, request);
  }
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
