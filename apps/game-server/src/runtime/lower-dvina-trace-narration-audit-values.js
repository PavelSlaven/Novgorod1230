export const FAILURE_KINDS = {
  current_beat_buried: 'literary_quality',
  elapsed_as_service_report: 'technical_presentation',
  static_context_dump: 'literary_quality',
  weak_literary_composition: 'literary_quality',
  unsupported_response_or_continuation: 'unsupported_'
};
const UNSUPPORTED_KINDS = new Set(['unsupported_attempt',
  'unsupported_success', 'unsupported_object_use', 'unsupported_result',
  'unsupported_sensory', 'unsupported_event', 'unsupported_world_state',
  'unsupported_npc_state', 'unsupported_fact']);

export function normalizeNarrationAuditChoices(output, request) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const normalizeFinding = (finding) => !finding || typeof finding !== 'object'
    ? finding : { ...finding,
      segment_choice: normalizeChoice(finding.segment_choice, request) };
  const unsupported = Array.isArray(output.unsupported)
    ? output.unsupported.map(normalizeFinding) : output.unsupported;
  const literaryFailures = Array.isArray(output.literary_failures)
    ? output.literary_failures.map(normalizeFinding) : output.literary_failures;
  const misplacedContinuation = Array.isArray(unsupported)
    ? unsupported.filter((finding) =>
      finding?.kind === 'unsupported_response_or_continuation') : [];
  return { ...output,
    source_reviews: Array.isArray(output.source_reviews)
      ? output.source_reviews.map((review) => !review
        || typeof review !== 'object' ? review : { ...review,
          segment_choices: Array.isArray(review.segment_choices)
            ? review.segment_choices.map((choice) =>
              normalizeChoice(choice, request)) : review.segment_choices })
      : output.source_reviews,
    unsupported: Array.isArray(unsupported) ? unsupported.filter((finding) =>
      finding?.kind !== 'unsupported_response_or_continuation') : unsupported,
    literary_failures: Array.isArray(literaryFailures)
      ? [...literaryFailures, ...misplacedContinuation.map((finding) => ({
        check: 'unsupported_response_or_continuation',
        segment_choice: finding.segment_choice, reason: finding.reason }))]
      : literaryFailures };
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
      || normalized === normalizeText(request.output?.prose)) return ids[0];
  return value;
}
function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : null;
}
export function validNarrationAuditModelOutput(output, request) {
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
      || output.source_reviews.some((review, index) => !review
        || typeof review !== 'object' || Array.isArray(review)
        || !sameKeys(review, ['ref', 'segment_choices'])
        || review.ref !== sources[index].key
        || !validChoices(review.segment_choices, choices))) return false;
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
    && (output.unsupported.length > 0 || output.literary_failures.length > 0
      || output.source_reviews.some(({ segment_choices }) =>
        segment_choices.length === 0) || output.evidence.length > 0);
}
function validFinding(value, keys, choices) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && sameKeys(value, keys) && choices.includes(value.segment_choice)
    && typeof value.reason === 'string' && value.reason.trim().length > 0;
}
function validChoices(values, choices) {
  return Array.isArray(values) && new Set(values).size === values.length
    && values.every((choice) => choices.includes(choice));
}
function sameKeys(value, keys) {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}
function narrationSegmentId(request, choice) {
  return typeof choice === 'string'
    && request.segments?.some(({ segment_id }) => segment_id === choice)
    ? choice : undefined;
}
export function narrationSources(request) {
  return [['visible_changes', 'visible_change'], ['uncertainties', 'uncertainty']]
    .flatMap(([field, prefix]) => request.visible_context[field]
      .map((text, source_index) => ({ field, source_index,
        key: `${prefix}_${source_index + 1}`, text })));
}
export function narrationCoverage(coverage, request) {
  const sources = narrationSources(request);
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)
      || Object.keys(coverage).length !== sources.length) return undefined;
  const result = { visible_changes: [], uncertainties: [] };
  for (const { key, field, source_index } of sources) {
    if (!Object.hasOwn(coverage, key)) return undefined;
    const choices = coverage[key];
    if (!Array.isArray(choices) || new Set(choices).size !== choices.length
        || choices.some((choice) => !narrationSegmentId(request, choice))) {
      return undefined;
    }
    result[field].push({ source_index,
      segment_ids: choices.map((choice) => narrationSegmentId(request, choice)) });
  }
  return result;
}
