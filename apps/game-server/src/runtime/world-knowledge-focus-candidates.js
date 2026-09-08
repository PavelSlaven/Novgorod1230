export function candidateWorldKnowledgeFocusRefs(bundle, input, locale,
  domains, limit = 256) {
  const domainSet = new Set(domains);
  const claimsByRef = new Map(bundle.claims.map(claim =>
    [claim.claim_ref, claim]));
  const terms = [...new Set(String(input).toLocaleLowerCase(locale)
    .match(/\p{L}{3,}/gu) ?? [])];
  if (terms.length === 0) return [];
  return bundle.concepts.map((concept) => {
    const localization = concept.localizations?.[locale]
      ?? concept.localizations?.[bundle.manifest.default_locale];
    const claims = (bundle.exact_indexes.concept_to_claim_refs[concept.concept_ref]
      ?? []).map(ref => claimsByRef.get(ref)).filter(Boolean);
    const text = [concept.concept_ref, ...(localization?.labels ?? []),
      localization?.short_definition, ...(localization?.search_aliases ?? []),
      ...claims.flatMap(claim => {
        const value = claim.localizations?.[locale]
          ?? claim.localizations?.[bundle.manifest.default_locale];
        return [value?.runtime_text, ...(value?.search_aliases ?? [])];
      })].filter(Boolean).join(' ').toLocaleLowerCase(locale);
    const claimDomains = new Set(claims.map(claim => claim.domain));
    return { ref: concept.concept_ref,
      allowed: domainSet.has(concept.domain)
        || [...claimDomains].some(domain => domainSet.has(domain)),
      score: terms.reduce((score, term) => {
        if (text.includes(term)) return score + term.length + 3;
        const prefix = term.slice(0, Math.min(4, term.length));
        if (prefix.length >= 4 && text.includes(prefix)) return score + 2;
        const russianStem = /\p{Script=Cyrillic}/u.test(term) && term.length >= 4
          ? term.slice(0, -1) : '';
        return score + (russianStem.length >= 3 && text.includes(russianStem)
          ? 1 : 0);
      }, 0) };
  }).filter(({ allowed, score }) => allowed && score > 0)
    .sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))
    .slice(0, limit).map(({ ref }) => ref);
}
