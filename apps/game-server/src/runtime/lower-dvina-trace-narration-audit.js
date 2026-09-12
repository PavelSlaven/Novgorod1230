const FAILURE_KINDS = {
  current_beat_buried: 'literary_quality',
  elapsed_as_service_report: 'technical_presentation',
  static_context_dump: 'literary_quality',
  weak_literary_composition: 'literary_quality',
  unsupported_response_or_continuation: 'unsupported_'
};

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
supports an unstated sound, smell, touch, motion, reaction or persistence. Never
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

Review literary composition for exactly these checks:
${Object.keys(FAILURE_KINDS).join(', ')}. Use unsupported_response_or_continuation
only for an invented response, nonresponse, performed continuation or continued
action. current_beat_buried requires a required source to be present but displaced;
an omitted source belongs only in source_reviews as []. Never add
current_beat_buried merely because another required source has an empty review.
Optional support may compose the current beat but a recap of unchanged
support is static_context_dump. Turn duration is code-owned UI metadata and is
not supplied as prose evidence. Any invented elapsed time is unsupported_fact;
service-like time reporting is also elapsed_as_service_report. A passage that
mainly restates required sources one by one in source order, without composing
the performed action or perceived result with supplied spatial relations, is
weak_literary_composition even when coverage is complete and every proposition
is supported. Do not demand an invented causal, temporal or spatial bridge to
avoid that failure. Evaluate all five checks independently: one failure never
excuses a missed second failure.

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
reject a source-order checklist as weak_literary_composition. Complete factual
coverage alone is not a literary PASS.

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

const UNSUPPORTED_KINDS = new Set([
  'unsupported_attempt', 'unsupported_success', 'unsupported_object_use',
  'unsupported_result', 'unsupported_sensory', 'unsupported_event',
  'unsupported_world_state', 'unsupported_npc_state', 'unsupported_fact'
]);

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

function normalizeChoices(output, request) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const normalizeFinding = (finding) => !finding || typeof finding !== 'object'
    ? finding : { ...finding,
      segment_choice: normalizeChoice(finding.segment_choice, request) };
  return {
    ...output,
    source_reviews: Array.isArray(output.source_reviews)
      ? output.source_reviews.map((review) => !review
        || typeof review !== 'object' ? review : { ...review,
          segment_choices: Array.isArray(review.segment_choices)
            ? review.segment_choices.map((choice) =>
              normalizeChoice(choice, request)) : review.segment_choices })
      : output.source_reviews,
    unsupported: Array.isArray(output.unsupported)
      ? output.unsupported.map(normalizeFinding) : output.unsupported,
    literary_failures: Array.isArray(output.literary_failures)
      ? output.literary_failures.map(normalizeFinding)
      : output.literary_failures
  };
}

function normalizeChoice(value, request) {
  if (typeof value !== 'string') return value;
  const normalized = normalizeText(value);
  const segments = request.segments ?? [];
  const exact = segments.find(({ segment_id: id }) => id === value);
  if (exact) return exact.segment_id;
  const prose = segments.find((segment) =>
    normalizeText(segment.prose) === normalized);
  if (prose) return prose.segment_id;
  const ids = segments.map(({ segment_id: id }) => id);
  if (normalized === normalizeText(ids.join(', '))
      || normalized === normalizeText(request.output?.prose)) {
    return ids[0];
  }
  return value;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : null;
}

function validNarrationAuditModelOutput(output, request) {
  if (!output || typeof output !== 'object' || Array.isArray(output)
      || !sameKeys(output, ['reviewed_segments', 'source_reviews', 'unsupported',
        'literary_failures', 'evidence'])) return false;
  const choices = request.segments.map(({ segment_id }) => segment_id);
  if (!Array.isArray(output.reviewed_segments)
      || output.reviewed_segments.length !== choices.length
      || output.reviewed_segments.some((choice, index) =>
        choice !== choices[index])) return false;
  const sources = narrationSources(request);
  if (!Array.isArray(output.source_reviews)
      || output.source_reviews.length !== sources.length
      || output.source_reviews.some((review, index) =>
        !review || typeof review !== 'object' || Array.isArray(review)
        || !sameKeys(review, ['ref', 'segment_choices'])
        || review.ref !== sources[index].key
        || !validChoices(review.segment_choices, choices))) {
    return false;
  }
  if (!Array.isArray(output.unsupported)
      || output.unsupported.some((finding) =>
        !validFinding(finding, ['segment_choice', 'kind', 'reason'], choices)
        || !UNSUPPORTED_KINDS.has(finding.kind))) return false;
  if (!Array.isArray(output.literary_failures)
      || output.literary_failures.some((finding) =>
        !validFinding(finding, ['check', 'segment_choice', 'reason'], choices)
        || !Object.hasOwn(FAILURE_KINDS, finding.check))) return false;
  return Array.isArray(output.evidence)
    && output.evidence.every((entry) =>
      typeof entry === 'string' && entry.trim().length > 0)
    && (output.unsupported.length > 0
      || output.literary_failures.length > 0
      || output.source_reviews.some(({ segment_choices: values }) =>
        values.length === 0)
      || output.evidence.length > 0);
}

function validFinding(value, keys, choices) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && sameKeys(value, keys)
    && choices.includes(value.segment_choice)
    && typeof value.reason === 'string' && value.reason.trim().length > 0;
}

function validChoices(values, choices) {
  return Array.isArray(values) && new Set(values).size === values.length
    && values.every((choice) => choices.includes(choice));
}

function sameKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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
