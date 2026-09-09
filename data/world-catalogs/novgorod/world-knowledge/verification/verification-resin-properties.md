# Independent verification — resin properties

**Scope:** RP-01–03 only.  No production authoring follows from this verdict.

## Source-access check

- The official AIC PDF for Odegaard *et al.* (2014) was independently opened
  and read in full through Google’s PDF viewer on 2026-09-04.  Printed p. 21,
  §1 “Introduction,” says Pinus resin was heated and applied hot as a basket
  coating “to make them water tight.”  The same page reports 70 of 100
  examined pitch-coated baskets highly unstable from severe oxidation, with
  blanched, cracked, crizzled, brittle, crumbly surfaces; the abstract says
  severe oxidation resulted in those characteristics.  The source is a
  specific Southwest Native basket collection and practice, not Rus'.
- The cited USDA FPL-50 direct download was independently opened but returned
  “Service unavailable.”  The exact rate-versus-equilibrium wording is also
  attributed to Rowell & Banks by a later NIH/PMC scholarly result, but the
  1985 full text was not independently readable in this pass.  It cannot
  support a broader resin/sealing claim.

## Verdict

| Candidate | Verdict | Admissible formulation | Limits |
| --- | --- | --- | --- |
| RP-01 | **APPROVE_WITH_LIMITS** | **RU:** В описанной традиции нагретое пековое покрытие на плетёной корзине делало именно эту систему водонепроницаемой. **EN:** In the described tradition, a heated pitch coating made that woven-basket system water-tight. | This is a documented coating-on-woven-basket observation only, not a generic property of pine resin, rosin, wood, boards, seams, boats, or containers. It needs identified pitch, woven substrate, and applied coating; it gives no adhesion, durability, recipe, or Rus'/Novgorod availability. |
| RP-02 | **APPROVE_WITH_LIMITS** | **RU:** В описанной коллекции при сильном окислении пековое покрытие становилось растрескавшимся, хрупким и осыпающимся. **EN:** In the described collection, under severe oxidation the pitch coating became cracked, brittle, and crumbly. | The observation is conditioned by the collection’s severely oxidized coatings. It is not a time-to-failure, climate threshold, probability, or claim that fresh pitch—or every historic coating—becomes brittle. It supplies no degradation state for a world object. |
| RP-03 | **REVISE / NOT_IMPORTABLE AS WRITTEN** | A potentially useful narrow statement is: “In wood-treatment assessment, water repellency and dimensional stability are distinct rate/equilibrium measures.” | The cited source is wood/treatment-specific, not pine pitch or rosin.  The added phrase “absolute sealing” is not supported by the quoted distinction.  At verification time the cited 1985 USDA full text was unavailable; do not author RP-03 until a readable primary/full source is reopened and the claim is restricted to its stated material domain. |

## Anti-overreach rule

RP-01 cannot bridge archaeological pine-resin presence to a sealed Novgorod
boat seam.  RP-02 is a conditional conservation-material failure observation,
not a universal ageing mechanic.  No resin source, coating application, or
present watertightness is materialized by either fact.

## Post-normalization check (488)

Checked `production-v1/material-response.json` after normalization.

| Production record | Verdict |
| --- | --- |
| `claim:pine-pitch-woven-basket-coating` | **MATCHES_APPROVAL.** `wk:material_culture:pine-pitch-coating` is intentionally a narrow new subject with no broader/related references. Its `responds_to` literal names the documented heated-pitch/woven-basket water-tight system, not generic sealing. Universal scope is bounded by attested/high/direct, `domain_internal_only`, exact evidence note, and RU/EN text excluding wood, boards, seams, boats, containers, adhesion, durability, recipe, material presence, and Novgorod practice. |
| `claim:pine-pitch-severe-oxidation` | **MATCHES_APPROVAL.** The same narrow subject and `responds_to` literal retain the described severely oxidized coating state. Attested/high/direct and internal-only correctly express a source-specific observation. RU/EN excludes fresh resin, every old coating, timing, climate threshold, probability, and a particular-object state. |
| `evidence:pine-pitch-basket-coating` | **MATCHES_APPROVAL.** The Odegaard source, pp. 21–22/abstract anchor, and note explicitly preserve the Southwest basket system and collection boundary, not generic resin sealing or Novgorod availability. |

No production change was made in this check.
