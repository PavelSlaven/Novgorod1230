import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';

const PROSE_RULES = 'Convey every required_current_beat change and uncertainty once, in causal order; overlapping meanings may share one statement. Failed/incomplete attempts are mandatory results, not optional context. A committed transient attempt in required changes means its physical handling/contact happened for the supplied applied duration; only its observation/discovery outcome or new fact remains unestablished. Render that performed motion concretely in the scene and leave only the result open, without reciting attempt/status metadata. Every unresolved-result proposition inside a required change must remain explicitly unknown in prose, even when required_current_beat.uncertainties is empty; do not omit it or convert it into failure or success. Do not turn an applied attempt into an unstarted action or require a continue/change choice when no unexecuted continuation is supplied. goal_result pending does not mean an applied operation was unexecuted. Preserve confirmed speech verbatim with its supplied speaker; render it naturally as speech in the scene, not a typed speech-event report. Describe discovery through the supported perception rather than repeating discovery-status wording. Style rules apply only to the narrative voice. Convey an explicitly unexecuted continuation as unstarted and its result unknown, leaving an open next choice to continue or change course; do not recite planning metadata or explain the continuation mechanism; an unresolved question states only what remains unknown, never proves an attempt. With a required beat, optional_support contains only visible_scene and supplied sensory_details. Select only details relevant to the current physical beat to compose the scene; they are optional support, not new changes or an obligation to repeat every fact. Dumping unrelated or all unchanged details fails static_context_dump. Do not add memories, inventory, NPC or body facts absent from required changes. With no required beat, descriptive support is the scene result: select material for a coherent perception, never recite a checklist. Infer no hearing, answer, lack of answer, silence, reaction, continued action or success from speech/intention alone. Source wording about an attempt or a step is evidence wording, not player-facing prose: render natural dialogue, concrete action and the open result without copying service wording. A speech-step duration measures that step, not continuous speaking; do not stretch the utterance over the whole interval. Each required change groups the result and elapsed/activity facts of one applied step; this grouping explicitly supports that step’s exact duration, not overlap with other steps. A grammatically integrated explicit duration is valid and must not fail merely for being explicit. Subject plus exact duration plus supported physical action is integrated duration, including in a short sparse sequence; do not flag elapsed_as_service_report solely for that construction or its brevity. With other current facts, exact elapsed time belongs in that same beat, never a standalone service line or a mechanically attached time report with an invented temporal/aspectual relation. When elapsed time is the only change, a short scene-bearing literary transition is valid, never a bare datum or an invented claim that the actor waits, stands, watches, remains, or that the scene persists unchanged. Write connected, restrained literary Russian through the character’s perception in second person (вы). Sparse grounded material calls for concise prose, not invented connective tissue. A connective alone does not make supported clauses a literary scene. A chain of clauses without scene/action composition, linked mainly by bare or metadata time announcements, is a report/checklist even when all facts are grounded; shortness or explicit duration alone is not this defect. Integrate duration into the supported physical beat and compose its causal transition to the next beat; changing a time connective or joining sentences alone does not repair composition. Do not invent ambience, reactions or concurrent action to make prose flow. Avoid field/ID/stat ledgers, system diagnostics, modern slang, pseudo-archaic decoration and theatrical padding. When perception itself succeeded and the scene is its result, convey the scene without repeating how or why the player looked.';

const GROUNDING_RULES = 'Use only supplied player-safe facts and preserve each proposition’s certainty, including subordinate clauses; plausible detail is not evidence. Ground every adjective, sensation, history, temporal/aspectual relation and causal link independently; overlap, duration and persistence between facts require explicit supporting basis. Result and elapsed/activity facts grouped in the same required change explicitly bind that duration to that applied step; this does not authorize overlap, persistence or duration of another step. Exact elapsed time must modify that same applied action/result, never the duration or persistence of static sky, weather, sound or other optional sensory support. Sensory support anchors action or transition; it never fills elapsed time. Distinguish action duration from delay before action: after an interval followed by an ongoing/beginning action cannot represent an action performed for that interval. Do not move an applied duration into a preceding wait or postpone the performed action. A scene label supplies location, not ambience, silence or subjective tempo. A feature never licenses unstated sound, smell, bodily contact, temperature, discomfort, recent use, direction, destination, route or shelter. A body state supports only its stated condition, location, severity and symptoms, never an added diagnosis or possible symptom asserted as fact; express meaning without internal identifiers. Empty optional arrays are omissions, not absence, emptiness or silence. A partial observation proves neither exclusivity nor persistence. State only supplied uncertainty; a quoted query proves no objects, ownership, history or action. Entity labels identify references, not traits. Keep each NPC’s visible_status and observable_cues tied to that entity_ref; no swapped/grouped traits, invented actions, motives, moods or reactions. Select relevant supplied outward cues without inventorying them. An item placement change proves only placement, not actor movement, manipulation, transformation, object use or purpose. Actor movement requires confirmed_outcome.movement_committed=true. Missing/false outcome fields are silent constraints, never prose material. A required committed transient-attempt change is an independent source of performed physical handling/contact; it is not merely an action_intent or a quoted discovery query. Unestablished observation result does not negate performed motion. action_intent supplies intention only: tools and objects named there are not facts; neither progressive nor attempt wording makes a remainder performed. Constraints apply throughout; add no causal bridge, hidden fact, fallback or other role.';

const WRITER_SHAPE = 'Return only {"prose":"<complete Russian prose>","action_options":[],"used_references":[]}. The server assembles version, schema, output_id and neutral self_check={}; do not generate self-check flags.';

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
      `Return only {"replacements":[{"prose":"<complete repaired Russian prose>"}]} with exactly one replacement. Rebuild the whole passage using concerns, not isolated sentence patches; concerns are not an exhaustive whitelist of defects. Reapply every rule to the whole replacement, remove each unsupported claim and restore every omitted required meaning without repetition. With sparse support, shorten rather than embellish. If no supported meaning remains, return empty prose. The server assembles immutable segment_id. ${PROSE_RULES} ${GROUNDING_RULES}`, request) }
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
    prose: output.prose, action_options: structuredClone(output.action_options),
    used_references: structuredClone(output.used_references),
    self_check: {}
  };
  if (roleId === 'gameplay_narrator_auditor') return {
    version: 1, schema: 'narration_audit',
    pass: output.pass === false || narrationChecksAgree(output, request) ? output.pass : undefined,
    artistic_verdict: output.artistic_verdict,
    technical_verdict: output.technical_verdict,
    coverage: narrationChecksAgree(output, request)
      ? narrationCoverage(output.coverage, request) : undefined,
    concerns: Array.isArray(output.concerns)
      ? output.concerns.map((concern) => ({
          segment_id: narrationSegmentId(request, concern?.segment_choice),
          kind: concern?.kind, reason: concern?.reason
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

const FAILURE_KINDS = {
  current_beat_buried: 'literary_quality',
  elapsed_as_service_report: 'technical_presentation',
  static_context_dump: 'literary_quality',
  weak_literary_composition: 'literary_quality',
  unsupported_response_or_continuation: 'unsupported_'
};

function narrationAuditInstruction(request) {
  const choices = request.segments.map(({ segment_id }) => segment_id);
  const shape = {
    reviewed_segments: choices,
    failure_checks: Object.fromEntries(Object.keys(FAILURE_KINDS).map((key) => [key, []])),
    coverage: Object.fromEntries(narrationSources(request).map(({ key }) => [key, []])),
    artistic_verdict: null, technical_verdict: null, pass: false,
    concerns: [], evidence: []
  };
  return `${PROSE_RULES} ${GROUNDING_RULES} evidence must be a concise substantive array of nonempty findings without repetition, never angle-bracket placeholders; retain every distinct concern. Review every supplied segment before deciding PASS; reviewed_segments must contain each canonical segment choice exactly once. First seek failures in the whole passage: current_beat_buried (required result displaced), elapsed_as_service_report (isolated service datum or mechanically attached time report, or a chain without scene/action composition linked mainly by bare/metadata time announcements, including duration transferred to static support or an action-duration recast as delay before an ongoing/beginning action; never fail subject plus exact duration plus supported physical action, or another grammatically integrated duration supported by the same required change, merely for explicitness or a short sparse sequence), static_context_dump (unselected context recap), weak_literary_composition (supported clauses fail as one scene, including a chronology without scene/action composition held together mainly by bare/metadata time announcements; short supported physical clauses with integrated duration do not fail for brevity; a pending remainder becomes metadata/explanation instead of a concrete open next choice; a connective alone is insufficient), unsupported_response_or_continuation (invented response, nonresponse or performed/continued action). failure_checks requires exactly these five keys, each an array of distinct offending segment choices; [] means none found. A literary failure requires artistic_verdict=fail and a literary_quality concern for every listed segment; elapsed failure requires technical_verdict=fail and technical_presentation concerns; unsupported response/continuation requires pass=false and an unsupported_* concern for each listed segment. Any failure forbids PASS. Do not invent a positive verdict to complete the shape. Other grounding violations also require FAIL with a precise concern. Concerns use {"segment_choice":"<supplied choice>","kind":"<allowed kind>","reason":"<specific finding>"}; use unsupported_attempt, unsupported_success, unsupported_object_use, unsupported_result, unsupported_sensory, unsupported_event, unsupported_world_state, unsupported_npc_state or unsupported_fact for ungrounded claims. A supported fact expressed as a system report is technical_presentation, not unsupported_event. PASS requires both verdicts pass, empty failure arrays, complete coverage, no concerns and substantive evidence of composition and grounding. Coverage keys are the refs in required_current_beat; return exactly these keys, with arrays of canonical segment choices only, never prose. No sources means {}. An omitted meaning keeps its key as [] and FAILs as missing_visible_change, with a concern on the first supplied segment_id naming the source. PASS values must be nonempty; no repeated choice within a key, but sources may share segments. Coverage requires every proposition within the source, including an unresolved-result clause embedded in a change; mentioning the physical motion alone is incomplete and requires missing_visible_change. Do not claim coverage merely because a source appears in the input. Return only this JSON shape (values are illustrative, not a verdict): ${JSON.stringify(shape)}. Replace null verdicts with pass/fail after review; this incomplete example must not be copied as an audit. Segment choices are exactly the supplied segment_id values; copy them unchanged, with no aliases or positional renaming: ${JSON.stringify(choices)}.`;
}

function narrationChecksAgree(output, request) {
  const canonical = request.segments.map(({ segment_id }) => segment_id);
  const validChoices = (values) => Array.isArray(values)
    && new Set(values).size === values.length
    && values.every((choice) => typeof choice === 'string' && canonical.includes(choice));
  if (Object.keys(output).length !== 8
      || !validChoices(output.reviewed_segments) || output.reviewed_segments.length !== canonical.length
      || !output.failure_checks || typeof output.failure_checks !== 'object'
      || Array.isArray(output.failure_checks)
      || Object.keys(output.failure_checks).length !== Object.keys(FAILURE_KINDS).length
      || !Array.isArray(output.concerns)) return false;
  for (const [key, kind] of Object.entries(FAILURE_KINDS)) {
    const failures = output.failure_checks[key];
    if (!Object.hasOwn(output.failure_checks, key) || !validChoices(failures)) return false;
    if (!failures.length) continue;
    if (output.pass !== false
        || (kind === 'literary_quality' && output.artistic_verdict !== 'fail')
        || (kind === 'technical_presentation' && output.technical_verdict !== 'fail')
        || failures.some((choice) => !output.concerns.some((concern) =>
          concern?.segment_choice === choice && typeof concern.kind === 'string'
          && (kind === 'unsupported_' ? concern.kind.startsWith(kind) : concern.kind === kind)))) return false;
  }
  return true;
}

function narrationSegmentId(request, choice) {
  return typeof choice === 'string' && request.segments?.some(({ segment_id }) => segment_id === choice)
    ? choice : undefined;
}

function narrationSources(request) {
  return [['visible_changes', 'visible_change'], ['uncertainties', 'uncertainty']]
    .flatMap(([field, prefix]) => request.visible_context[field].map((text, source_index) => ({
      field, source_index, key: `${prefix}_${source_index + 1}`, text
    })));
}

function narrationCoverage(coverage, request) {
  const sources = narrationSources(request);
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)
      || Object.keys(coverage).length !== sources.length) return undefined;
  const result = { visible_changes: [], uncertainties: [] };
  for (const { key, field, source_index } of sources) {
    if (!Object.hasOwn(coverage, key)) return undefined;
    const choices = coverage[key];
    if (!Array.isArray(choices) || new Set(choices).size !== choices.length
        || choices.some((choice) => !narrationSegmentId(request, choice))) return undefined;
    result[field].push({ source_index,
      segment_ids: choices.map((choice) => narrationSegmentId(request, choice)) });
  }
  return result;
}
