import { FAILURE_KINDS, narrationCoverage, narrationSources,
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
player-safe input. A supplied player-safe source supports exactly its atomic factual
propositions, including stated relation, motion, cause, qualifier and certainty.
Faithful prose may use ordinary grammatical inflection or natural paraphrase only
when it adds no atomic proposition. Labels, IDs, categories, names and plausible
implications add no sensory trait, causality, time, result, execution or certainty.
Plausibility is never evidence. An object or place never supports an unstated sound,
smell, touch, motion, reaction or persistence.
current_light_phase is only the committed calendar phase of daylight. It does not
establish local brightness, darkness, dimness, shadows or visibility. Reject any
such unsupported local-light proposition as unsupported_world_state or
unsupported_sensory, even when its phrasing sounds plausible for that phase.
Treat a required_current_beat uncertainty with status unperformed_result_unknown
as evidence only that the second-person player's named continuation is not yet
performed and has no result. Never attribute it to an NPC. An explicitly open
future or possible next choice conveying both facts is
supported and is not unsupported_attempt. Present, past, or ongoing execution is
still unsupported_response_or_continuation or unsupported_attempt.
Never replace a named or labelled NPC from a required source with second-person player
action; report that as unsupported_npc_state and leave that source uncovered.
Never accept reversed causal order. Grammatical subordination of an earlier action is
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
Optional support is a candidate set, never a coverage target. After a current
beat, a recital of unchanged, independent optional scene facts as panorama or
context is static_context_dump even when fluent, reordered, spatially grouped,
or placed after the beat. A required_current_beat source never becomes optional
support merely because another input field repeats it; static_context_dump
applies only to a proposition supported solely by optional_support. Each retained support detail must locate, contrast,
constrain, or constitute the action or result being narrated. A perception beat
may govern supplied details that are themselves its perceived result; this does
not license unrelated snapshot recap. A recap of unchanged support is static_context_dump.
Turn duration is code-owned UI metadata and is
not supplied as prose evidence. Any invented elapsed time is unsupported_fact;
service-like time reporting is also elapsed_as_service_report. Judge
weak_literary_composition for an inspection or perception across the whole
passage. PASS when every supplied scene-observation cluster is either
grammatically governed by the completed action in the same sentence or has its
own finite verb that grammatically makes the player the perceiver or actor.
Multiple such player verbs may govern their respective observations in one
sentence; do not require separate sentences or beats for each observation.
The pattern player-verb(A), player-verb(B and C) passes: evaluate the direct
dependents of every player verb, and do not require one verb to govern them all.
A finite static predicate whose subject is the observed thing does not count.
A repeated supplied place, its supplied subplace, and explicit supplied
coreference count as one shared anchor. The terminal-action failure means a
completed action sentence followed by static scene sentences that lack their
own player perception/action verb. Never apply it to a later sentence that has
such a player verb. Report it only with check weak_literary_composition;
terminal_action_failure is a description, never a check value. A later static state or locative predicate is not a
perception beat merely because it is anchored or follows the action. It needs
its own finite player perception or action verb, or must be syntactically
subordinate to the completed inspection in the same sentence; a dependent
gerundial phrase or relative clause counts as such subordination. Source order,
factual coverage, punctuation, conjunction and a shared anchor never create
governance. The pattern "Вы осмотрели X, заметив A, B и C" passes because the
dependent player gerund governs the observations despite the terminal finite
inspection verb; apply the same rule to an unambiguous relative clause. Treat
the terminal-action-plus-static-clusters form as
weak_literary_composition. Omit weak_literary_composition when this PASS rule
holds; separately governed clusters at different supplied anchors are not an
independent inventory. Exclude supplied held results, body consequences, and
uncertainties only from this governance test; they may be standalone grounded
sentences. Still review uncertainty wording: an ordinary player-facing open
question passes, while an abstract policy or disclaimer about what observations
prove or establish is weak_literary_composition. Complete factual coverage alone is not a literary PASS. Matching source order or using one multi-clause sentence
alone is not a failure. A grounded current qualitative assessment or conclusion
may be the perceived result when related scene facts frame or lead to it within
one coherent focal sentence. Do not demand an invented causal,
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
5. First exclude supplied held results, body consequences/states, and
uncertainties only from the scene-governance requirement. They do not need a
player perception verb. Still review uncertainty phrasing: an ordinary open
question passes; an abstract diagnostic or policy statement about what
observations prove or establish receives weak_literary_composition. Then
review every scene-observation segment. A
terminal independent completed action never governs a later static cluster;
each cluster needs same-sentence subordination or its own finite player
perception/action verb. Report every cluster that lacks governance, including
the first one after the terminal action. Source order, factual coverage,
punctuation, conjunction and a shared anchor do not create governance.
Separately governed clusters at different anchors pass.
If a scene segment has its own finite player perception/action verb, it does
not need grammatical connection to the preceding or following segment. Mark it
governed and do not apply the terminal-action failure to it.
6. For a performed attempt with no supplied result or uncertainty, any claim
that the result is unknown or unestablished is unsupported_result. The attempt
alone without any outcome claim is supported and must not be flagged.
7. Never report static_context_dump for a proposition that is also in
required_current_beat. Repetition in optional_support cannot change its status.

Return only the exact JSON shape shown below. reviewed_segments must copy every
literal segment ID (for example "s1"), never prose, exactly once and in order.
source_reviews must contain exactly
the shown required_current_beat refs and order; each segment_choices value lists
segments that fully convey that source. Use [] for an omitted or partially
conveyed source. If no required source exists, source_reviews must be [].
unsupported contains only {"segment_choice","kind","reason"}; kind is one of
unsupported_attempt, unsupported_success, unsupported_object_use,
unsupported_result, unsupported_sensory, unsupported_event,
unsupported_world_state, unsupported_npc_state, unsupported_fact.
literary_failures contains only {"check","segment_choice","reason"}.
Every segment_choice field is one literal segment ID, never a comma-separated
list or range; use separate findings when more than one segment fails.
Output only failures, not supported proposition reviews. evidence is a concise
nonempty list when there are no failures and may be empty otherwise. Shape:
${JSON.stringify(shape)}
Segment choices: ${JSON.stringify(choices)}.`;
}

export function assembleNarrationAuditOutput(output, request) {
  const modelOutput = structuredClone(output);
  if (!validNarrationAuditModelOutput(modelOutput, request)) {
    return {
      version: 1, schema: 'narration_audit', pass: undefined,
      artistic_verdict: undefined, technical_verdict: undefined,
      coverage: undefined, concerns: undefined,
      evidence: structuredClone(modelOutput?.evidence)
    };
  }
  const concerns = [];
  const hasMissingSource = modelOutput.source_reviews.some(
    ({ segment_choices }) => segment_choices.length === 0);
  for (const source of modelOutput.source_reviews) {
    if (source.segment_choices.length === 0) {
      concerns.push({
        segment_id: null,
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
  const pass = concerns.every(({ kind }) => kind === 'literary_quality');
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
