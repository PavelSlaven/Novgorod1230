# Independent verification — terrain sources

**Source independently opened:** N. G. Dmitruk & M. P. Druzhnova, [*Soil areas of the Novgorod region in the context of their agricultural use*](https://iopscience.iop.org/article/10.1088/1755-1315/613/1/012025/pdf), IOP Conference Series: Earth and Environmental Science 613 (2020) 012025. The OA eight-page PDF was opened through browser-harness. It is a modern regional soil-geography source, not medieval archaeology or extraction evidence.

| Candidate | Verdict | Production-safe disposition | Rationale and limits |
|---|---|---|---|
| TR-01 | **APPROVE_WITH_LIMITS** | Combine with TR-02 and TR-05 as one contextual `supported_fact`: Quaternary parent rocks and sediments form the broad geological/soil background of the modern Novgorod region. | Abstract and §1 establish this as modern regional soil geography. It may be a broad, inferred/medium 1100–1300 geological background only, never a present material source. |
| TR-02 | **APPROVE_WITH_LIMITS** | Do not author separately; retain inside the combined TR-01 premise: the source lists glacial, fluvioglacial and lacustrine-glacial parent materials. | §1. This is a regional assemblage, not a claim that each locality has each deposit or that medieval actors extracted it. |
| TR-03 | **APPROVE_WITH_LIMITS** | A separate contextual premise may state that the cited modern regional parent-material assemblage includes loams and sand/gravel/pebble and clay-bearing classes. | §1. Use no availability, quantity, purity, pit, quarry, collection, ownership or permission wording. It is useful only as envelope information when a scene already has a grounded source. |
| TR-04 | **NEEDS_EVIDENCE** | Do not author from this study. | The modern Ilmen–Volkhov floodplain/alluvial description does not establish the location, surface, accessibility or exact material distribution in 1230. A dated sedimentary/archaeological study is needed. |
| TR-05 | **APPROVE_WITH_LIMITS** | Fold into combined TR-01, not a separate claim: the source classifies the modern region in an accumulative glacial/fluvioglacial relief province. | §1–2 supports a coarse geological setting only. No slope, route, visibility, construction stability or movement effect may be inferred. |
| TR-06 | **REJECT** | Do not author. | A modern administrative/soil district and its named lowland parent rocks cannot be silently equated with medieval Novgorod city or a specific historical extraction area. The source does not bridge that boundary. |

## Production boundary

Only TR-01/02/05 as one coarse contextual geological-background claim and TR-03 as a parent-material assemblage are production-eligible, both `inferred/medium` and domain-internal. None are `historically_attested`; none establish medieval extraction, a deposit at a scene, stock, access, landform, route or permission to dig.

## Production record re-check

Read-only check of `production-v1/terrain.json`:

| Claim ref | Verdict | Reason |
|---|---|---|
| `claim:terrain-background` | **APPROVE_WITH_LIMITS** | Correctly combines TR-01/02/05 under contextual `supported_fact`, with 1100–1300 inferred/medium, `unknown` typicality and domain-internal access. RU/EN explicitly retain a coarse geological background and exclude scene terrain, route and deposit claims. |
| `claim:terrain-parent-material-assemblage` | **APPROVE_WITH_LIMITS** | Correctly represents only TR-03 as a regional parent-material assemblage and explicitly excludes co-occurrence, usable source, purity, quantity and medieval extraction in RU/EN. |

TR-04 and TR-06 are absent, as required. This approval covers these exact two records only.
