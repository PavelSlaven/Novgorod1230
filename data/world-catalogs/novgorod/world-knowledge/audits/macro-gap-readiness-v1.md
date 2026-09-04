# Macro-gap static readiness — PR92

Snapshot: working tree after the 950-claim integration. This is a static
corpus/cartography audit only; it neither runs nor accepts live gameplay.

## Verdict

**NEEDS_MORE_STATIC_COVERAGE.** Cartography closure and the five macro claims
pass their bounded static checks, but the declared map retains unresolved P1
knowledge families. This is an interim audit, not a merge-blocker decision or
a claim of exhaustive knowledge, scene truth, gameplay saturation, or runtime
activation.

## Observed closure

- `authoring.json` resolves to 950 claims; cartography has 131 supported
  families and retains 49 `missing`/`partial` families.
- The five macro additions are present in the descriptor, each maps to a
  concrete family, and each has an independent `APPROVE` verification:
  Gramota 334 private monetary letter; universal parasite/host relation;
  Gramota 199 instructional text; Gramota 222 letter to a posadnik; and
  Gramota 724 Yugra-tribute document context.
- Their date/place bounds are honest: 334 is 1220–1240; 199 is 1240–1260;
  222 is 1200–1220; 724 is 1160–1180; parasite relation is universal. The
  historical comparators expressly do not establish a 1230 school, office,
  expedition, authority, local presence, or scene outcome.
- External blind-spot handling is represented by the two factual families
  `literacy_names_and_everyday_records`,
  `political_and_external_document_context`, and the universal
  `parasites_and_health` family. The map states that external classifications
  identify needs, never evidence a Novgorod fact.
- All 82 gameplay-coverage cases reference extant claims; the stored report
  passes with no failed gates.

## Checks

- `node --test tools/world-catalog-workflow/test/world-knowledge-category-cartography.test.js`
- `node --test tools/world-catalog-workflow/test/world-knowledge-pack.test.js`

Both passed (14 tests). They cover source/family/location/consumer mapping,
missing-family references, deterministic compilation, and per-claim production
approval binding.

## Remaining coverage

The 49 retained `missing`/`partial` families are not all P2. P1 static work
remains for, among others: spoken language/register; weapons and armour;
marriage, kinship and social status; reproduction and human lifecycle;
medicine/injury/function; political authority; offences/sanctions; education;
recreation; hospitality; and coherent food/animal-husbandry practice.

Bounded P2 limits also remain: taxon-specific applicability, cross-material
storage microclimate, aquatic anchoring/harvesting mechanics, arbitrary
enclosure geometry, and period/place-specific practice. Exact body state,
inventory, access, numeric mechanics, time, and committed outcomes remain
code-owned. Further factual coverage needs source-backed, independently
verified claims; no live campaign is in scope.
