/** Map Core slice + per-hint lexical hits to §63 sufficiency markers. */
export function groundingSufficiencyOf(slice) {
  const facts = slice?.facts ?? [];
  const hard = slice?.hard_constraints ?? [];
  const coverage = Array.isArray(slice?.coverage) ? slice.coverage : [];
  const hits = Array.isArray(slice?.search_hint_hits) ? slice.search_hint_hits : [];
  const hasContent = facts.length > 0 || hard.length > 0;
  if (!hasContent) {
    if (coverage.length > 0
        && coverage.every((entry) => entry.status === 'out_of_scope')) {
      return 'OUT_OF_SCOPE';
    }
    return 'UNRESOLVED_KNOWLEDGE';
  }
  const allHintsHit = hits.length === 0 || hits.every(Boolean);
  const allCovered = coverage.length > 0
    && coverage.every((entry) => entry.status === 'covered');
  const anyPartialCoverage = coverage.some((entry) => entry.status === 'partial');
  if (allHintsHit && allCovered) return 'SUFFICIENT_KNOWLEDGE';
  if (!allHintsHit || anyPartialCoverage || !allCovered) return 'PARTIAL_KNOWLEDGE';
  return 'PARTIAL_KNOWLEDGE';
}
