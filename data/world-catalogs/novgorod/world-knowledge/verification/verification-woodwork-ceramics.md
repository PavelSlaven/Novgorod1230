# Verification: woodworking, ceramic/glass response and fastenings

Independent re-open: 2026-09-03. This audit checks the candidate source,
atomic wording, scope, and existing-pack overlap. It does not approve a
present object, stock, actor skill, recipe, authority, or exact mechanic.

## Source access

- **W:** Novgorod Museum collection description reopened at [woodworking in
  medieval Novgorod](https://novgorodmuseum.ru/o-muzee-zapovednike/novosti/derevoobrabotka-v-srednevekovom-novgorode).
  It describes an archaeological collection and exhibition spanning the X–XV
  centuries, not a dated 1230 assemblage.
- **C:** Canadian Conservation Institute reopened at [Caring for ceramic and
  glass objects](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/ceramics-glass-preventive-conservation.html).
  Its composition, forming, firing, glass, physical-forces and water sections
  support qualitative material relations only.
- **F:** the cited [USFS Wood Handbook chapter 8 PDF](https://research.fs.usda.gov/download/treesearch/62253.pdf)
  was requested through browser-harness but returned `The request is blocked`.
  No independent source text was available in this pass; every F verdict is
  therefore `NEEDS_EVIDENCE`, not an inference from general knowledge.

| ID | Verdict | Production-safe factual wording / exact limit | Duplicate or scope check |
| --- | --- | --- | --- |
| W01 | APPROVE_WITH_LIMITS | Museum's X–XV-century Novgorod archaeological collection includes axes among woodworking tools. No 1230 household, universal operation, or tool presence follows. | More specific than existing broad woodworking compatibility; not a duplicate claim. |
| W02 | APPROVE_WITH_LIMITS | Same collection includes adzes. Same X–XV and no-present-tool limit. | No exact duplicate found. |
| W03 | APPROVE_WITH_LIMITS | Same collection includes saws. Same X–XV and no-present-tool limit. | No exact duplicate found. |
| W04 | APPROVE_WITH_LIMITS | Same collection includes drills. Same X–XV and no-present-tool limit. | No exact duplicate found. |
| W05 | APPROVE_WITH_LIMITS | Same collection includes chisels. Same X–XV and no-present-tool limit. | No exact duplicate found. |
| W06 | APPROVE_WITH_LIMITS | Museum states that medieval Novgorod sledges were made from wood. It is not proof of a sledge in any scene, ownership, capacity, or route use. | No exact sledge claim found. |
| W07 | APPROVE_WITH_LIMITS | Museum states that carts were made from wood. Existing `claim:settlement-cart-transport` already covers carts on urban streets; this candidate must not duplicate that transport claim or infer a cart's present construction. | Adjacent existing claim, not replacement. |
| W08 | APPROVE_WITH_LIMITS | Museum states that boats were made from wood. Existing `claim:population-boat-context` already limits a boat to a documented fishing context; this candidate cannot establish any boat's current presence or construction details. | Adjacent existing claim, not replacement. |
| C01 | APPROVE | Ceramics are brittle and physical forces can break, chip, crack, or scratch them. Exact load, flaw state, geometry, and outcome remain code-owned. | Universal material relation; no historical availability. |
| C02 | APPROVE | Glass is vulnerable to physical force and can break, chip, or scratch. Exact force, thickness, flaw state, and outcome remain code-owned. | Universal material relation; no historical availability. |
| C03 | APPROVE_WITH_LIMITS | Porous ceramics can absorb water and dissolved/embedded residues; absorption and damage depend on fabric, finish, cracks, contaminants, and conditions. | Do not infer wetness, contents, contamination, or damage of an object. |
| C04 | APPROVE | Clay body composition and firing affect ceramic physical properties including porosity. It gives neither a recipe nor a value for a particular vessel. | Universal, domain-internal scientific context. |
| C05 | APPROVE | Separately formed handles, spouts, and similar attachments may have weak fired joints and can separate under stress. It does not establish an attachment or failure in a given item. | Universal, qualitative only. |
| C06 | APPROVE_WITH_LIMITS | For formed glass, cooling rate affects final amorphous properties and is controlled by the glassmaker. This is not an historical glassmaking recipe, temperature, or availability claim. | Domain-internal only. |
| C07 | APPROVE_WITH_LIMITS | In iron-oxide-bearing earthenware, firing oxygen affects red, grey, and buff colours. Do not generalize this to every ceramic, glaze, composition, kiln, or historical colour. | Domain-internal only. |
| F01 | NEEDS_EVIDENCE | No production wording: cited source inaccessible to independent browser verification. | Obtain accessible official chapter text/page anchor. |
| F02 | NEEDS_EVIDENCE | No production wording: cited source inaccessible to independent browser verification. | Obtain accessible official chapter text/page anchor. |
| F03 | NEEDS_EVIDENCE | No production wording: cited source inaccessible to independent browser verification. | Obtain accessible official chapter text/page anchor. |
| F04 | NEEDS_EVIDENCE | No production wording: cited source inaccessible to independent browser verification. | Obtain accessible official chapter text/page anchor. |
| F05 | NEEDS_EVIDENCE | No production wording: cited source inaccessible to independent browser verification. | Obtain accessible official chapter text/page anchor. |

## Result

- APPROVE: 4.
- APPROVE_WITH_LIMITS: 11.
- NEEDS_EVIDENCE: 5.
- REJECT/DISPUTED: 0.

W candidates require 1000–1500 museum-collection qualifiers rather than a
1230 exact-date claim. C candidates are universal qualitative material facts.
F candidates are not production-eligible until an independently readable
source is supplied.
