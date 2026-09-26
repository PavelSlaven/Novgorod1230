/** Map Core slice + per-hint lexical hits to §63 sufficiency markers. */

/** Fallback only when sufficiency profile is absent. Production loader reads
 * `wk-sufficiency:giga-cosine:v1` and passes `min_hint_relevance` (LW-054). */
export const DEFAULT_MIN_HINT_RELEVANCE = 0.28;

export function groundingSufficiencyOf(slice, {
  fromDefaultQuery = false,
  minHintRelevance = DEFAULT_MIN_HINT_RELEVANCE
} = {}) {
  const facts = slice?.facts ?? [];
  const hard = slice?.hard_constraints ?? [];
  const disputes = slice?.disputes ?? [];
  const coverage = Array.isArray(slice?.coverage) ? slice.coverage : [];
  const hits = Array.isArray(slice?.search_hint_hits) ? slice.search_hint_hits : [];
  const relevance = Array.isArray(slice?.search_hint_relevance)
    ? slice.search_hint_relevance : null;
  // Disputes are admitted content: they block NO_KNOWLEDGE and count for PARTIAL.
  const hasContent = facts.length > 0 || hard.length > 0 || disputes.length > 0;
  if (!hasContent) {
    if (coverage.length > 0
        && coverage.every((entry) => entry.status === 'out_of_scope')) {
      return 'OUT_OF_SCOPE';
    }
    return 'UNRESOLVED_KNOWLEDGE';
  }
  // Default-query slices never claim SUFFICIENT: lexical hit ≠ topical relevance
  // (LW-047; #153 step 8 adds a relevance floor).
  if (fromDefaultQuery) return 'PARTIAL_KNOWLEDGE';
  const allHintsHit = hits.length === 0 || hits.every(Boolean);
  const allCovered = coverage.length > 0
    && coverage.every((entry) => entry.status === 'covered');
  const anyPartialCoverage = coverage.some((entry) => entry.status === 'partial');
  const threshold = Number.isFinite(minHintRelevance) ? minHintRelevance : 0;
  // When Core omitted relevance (legacy fixtures), keep lexical-only behaviour.
  const allRelevant = relevance == null || relevance.length === 0
    || hits.every((hit, index) => !hit
      || (Number(relevance[index]) || 0) >= threshold);
  if (allHintsHit && allCovered && allRelevant) return 'SUFFICIENT_KNOWLEDGE';
  if (!allHintsHit || anyPartialCoverage || !allCovered || !allRelevant) {
    return 'PARTIAL_KNOWLEDGE';
  }
  return 'PARTIAL_KNOWLEDGE';
}
