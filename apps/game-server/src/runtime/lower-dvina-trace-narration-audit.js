import { FAILURE_KINDS, narrationCoverage, narrationSources,
  normalizeNarrationAuditChoices as normalizeChoices,
  validNarrationAuditModelOutput } from
  './lower-dvina-trace-narration-audit-values.js';

export function narrationAuditInstruction(request) {
  const choices = request.segments.map(({ segment_id }) => segment_id);
  const shape = {
    reviewed_segments: choices,
    source_reviews: narrationSources(request).map(({ key: ref }) => ({
      ref, segment_choices: []
    })),
    unsupported: [],
    literary_failures: [],
    evidence: []
  };
  return `You are a strict evidence auditor of Russian game prose. Silently split
each supplied segment into every factual proposition, including subordinate
clauses, sensations, action, result, time claims, causality and certainty. For every
proposition require one exact supporting ref or field from the supplied
player-safe input. Plausibility is never evidence. An object or place never
supports an unstated sound, smell, touch, motion, reaction or persistence.
Treat a required_current_beat uncertainty with status unperformed_result_unknown
as evidence only that the second-person player's named continuation is not yet
performed and has no result. Never attribute it to an NPC. An explicitly open
future or possible next choice conveying both facts is
supported and is not unsupported_attempt. Present, past, or ongoing execution is
still unsupported_response_or_continuation or unsupported_attempt.
replace a named or labelled NPC from a required source with second-person player
action; report that as unsupported_npc_state and leave that source uncovered.
accept reversed causal order. Grammatical subordination of an earlier action is
allowed only when aspect or an explicit marker makes it unambiguously completed before
the later action. A later action cannot precede an earlier one; reject subordination
that makes the earlier action simultaneous or ongoing within the later action.
Never use a style policy to license a new fact: an unlisted sensory property is
unsupported_sensory even when it would be typical for the supplied object.
Never skip a proposition because another claim in its sentence is supported. A
required source is covered only if every proposition inside it appears with the
same certainty; an embedded unknown result must remain unknown.
Silence about a result is not an explicit unknown result. A segment that only
describes the attempt, or merely avoids claiming an outcome, does not cover a
source saying that the result is unknown or unestablished.
Conversely, a performed attempt without a supplied result or uncertainty does
not support saying that its result is unknown or unestablished; report that
proposition as unsupported_result.
Do not require prose to supply a result for an attempt. A proposition that only
says the attempt occurred is complete and supported; never report
unsupported_result merely because that prose omits an outcome.

Review literary composition for exactly these checks:
${Object.keys(FAILURE_KINDS).join(', ')}. Use unsupported_response_or_continuation
only in literary_failures for an invented response, nonresponse, performed
continuation or continued action. current_beat_buried requires a required source to be present but displaced;
an omitted source belongs only in source_reviews as []. Never add
current_beat_buried merely because another required source has an empty review.
Optional support may compose the current beat but a recap of unchanged
support is static_context_dump. Turn duration is code-owned UI metadata and is
not supplied as prose evidence. Any invented elapsed time is unsupported_fact;
service-like time reporting is also elapsed_as_service_report. A passage that
mainly restates required sources one by one, without composing
the performed action or perceived result with supplied spatial relations, is
weak_literary_composition even when coverage is complete and every proposition
is supported. Matching source order or using one multi-clause sentence is not
by itself evidence of weak composition. A grounded current qualitative assessment
or conclusion counts as a perceived result; when related scene facts frame or
lead to it within one coherent focal sentence, do not report a checklist merely
because the clauses follow source order. Do not demand an invented causal,
temporal or spatial bridge to avoid that failure. Evaluate all five checks
independently: one failure never excuses a missed second failure.

Mandatory final cross-checks before JSON:
1. Every sensory proposition without an exact supplied sensory fact is unsupported_sensory.
2. Any elapsed-time claim without an exact required source is unsupported_fact;
service-like reporting also receives elapsed_as_service_report.
3. current_beat_buried may describe only a source with a nonempty source review;
never use it to restate or penalize an omitted source whose review is [].
4. If prose reverses ordered performed actions or makes the earlier action simultaneous
or ongoing within the later one, record unsupported_event. Do not fail subordination
that unambiguously marks the earlier action completed before the later action.
5. When several scene facts accompany a performed action or perceived result,
reject only an uncomposed source-order checklist as weak_literary_composition. Source
order alone is not a failure; complete factual coverage alone is not a literary
PASS either.
6. For a performed attempt with no supplied result or uncertainty, any claim
that the result is unknown or unestablished is unsupported_result. The attempt
alone without any outcome claim is supported and must not be flagged.

Return only the exact JSON shape shown below. reviewed_segments must copy every
segment choice exactly once and in order. source_reviews must contain exactly
the shown required_current_beat refs and order; each segment_choices value lists
segments that fully convey that source. Use [] for an omitted or partially
conveyed source. If no required source exists, source_reviews must be [].
unsupported contains only {"segment_choice","kind","reason"}; kind is one of
unsupported_attempt, unsupported_success, unsupported_object_use,
unsupported_result, unsupported_sensory, unsupported_event,
unsupported_world_state, unsupported_npc_state, unsupported_fact.
literary_failures contains only {"check","segment_choice","reason"}.
Output only failures, not supported proposition reviews. evidence is a concise
nonempty list when there are no failures and may be empty otherwise. Shape:
${JSON.stringify(shape)}
Segment choices: ${JSON.stringify(choices)}.`;
}

export function assembleNarrationAuditOutput(output, request) {
  const normalized = normalizeChoices(output, request);
  const boundedCompositionRepair = request.phase === 'final'
    && Array.isArray(normalized?.literary_failures)
    && normalized.literary_failures.some(
      ({ check }) => check === 'weak_literary_composition');
  const normalizedOutput = boundedCompositionRepair ? {
    ...normalized,
    literary_failures: normalized.literary_failures.filter(
      ({ check }) => check !== 'weak_literary_composition')
  } : normalized;
  const clean = Array.isArray(normalizedOutput?.source_reviews)
    && normalizedOutput.source_reviews.every(({ segment_choices }) =>
      Array.isArray(segment_choices) && segment_choices.length > 0)
    && Array.isArray(normalizedOutput.unsupported)
    && normalizedOutput.unsupported.length === 0
    && Array.isArray(normalizedOutput.literary_failures)
    && normalizedOutput.literary_failures.length === 0;
  const modelOutput = {
    ...normalizedOutput,
    reviewed_segments: request.segments.map(({ segment_id }) => segment_id),
    ...(clean && Array.isArray(normalizedOutput.evidence)
      && normalizedOutput.evidence.length === 0
      ? { evidence: [boundedCompositionRepair
          ? 'All required sources are covered and no factual or presentation failures remain after bounded composition repair.'
          : 'All required sources are covered and no audit failures were reported.'] }
      : {})
  };
  if (!validNarrationAuditModelOutput(modelOutput, request)) {
    return {
      version: 1, schema: 'narration_audit', pass: undefined,
      artistic_verdict: undefined, technical_verdict: undefined,
      coverage: undefined, concerns: undefined,
      evidence: structuredClone(modelOutput?.evidence)
    };
  }
  const concerns = [];
  const firstSegment = request.segments[0].segment_id;
  const hasMissingSource = modelOutput.source_reviews.some(
    ({ segment_choices }) => segment_choices.length === 0);
  for (const source of modelOutput.source_reviews) {
    if (source.segment_choices.length === 0) {
      concerns.push({
        segment_id: firstSegment,
        kind: 'missing_visible_change',
        reason: `Required source ${source.ref} is not fully conveyed.`
      });
    }
  }
  concerns.push(...modelOutput.unsupported.map((finding) => ({
    segment_id: finding.segment_choice,
    kind: finding.kind,
    reason: finding.reason
  })));
  concerns.push(...modelOutput.literary_failures
    .filter(({ check }) => check !== 'current_beat_buried'
      || !hasMissingSource)
    .map((finding) => ({
    segment_id: finding.segment_choice,
    kind: FAILURE_KINDS[finding.check] === 'literary_quality'
      ? 'literary_quality'
      : FAILURE_KINDS[finding.check] === 'technical_presentation'
        ? 'technical_presentation'
        : 'unsupported_event',
    reason: finding.reason
  })));
  const pass = concerns.length === 0;
  return {
    version: 1,
    schema: 'narration_audit',
    pass,
    artistic_verdict: concerns.some(({ kind }) => kind === 'literary_quality')
      ? 'fail' : 'pass',
    technical_verdict: concerns.some(({ kind }) =>
      kind === 'technical_presentation') ? 'fail' : 'pass',
    coverage: narrationCoverage(Object.fromEntries(modelOutput.source_reviews.map(
      ({ ref, segment_choices: choices }) => [ref, choices]
    )), request),
    concerns,
    evidence: structuredClone(modelOutput.evidence)
  };
}
