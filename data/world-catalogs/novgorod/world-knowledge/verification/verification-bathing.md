# Independent verification — bathing passage in the *Primary Chronicle*

**Source read:** [*Повесть временных лет*, translation D. S. Likhachev](https://ilibrary.ru/text/4339/p.1/index.html), the Andrew episode near the opening geographical narrative. The passage says that Andrew “as they say” visited the place where Novgorod now stands, saw people bathing, and describes wooden bathhouses, strong heating, undressing, washing with water, and young twigs. It calls the practice washing, not torment.

The apostolic journey is a chronicle **legend**, not an event claim. The source may therefore support a cautious medieval cultural-compatibility relation, but never Andrew’s presence, a date for a particular bathhouse, a medical effect, or an obligatory procedure.

**Independent archaeological corroboration read:** A. M. Stepanov, “Усадьбы Т и У в Людином конце средневекового Новгорода (по материалам Троицкого раскопа),” *Исторические исследования* 3 (2015), [printer-friendly full text](http://www.historystudies.msu.ru/ojs2/index.php/ISIS/rt/printerFriendly/50/133). In the **First chronological period** section, the author describes a small structure on estate U: heavy lower log courses, upper poles about 8 cm in diameter, sterile sand fill, one large and several small stones; A. S. Khoroshev had associated comparable structures with Novgorod bathhouses. The period is second half X–first half XI, so it corroborates the material category and archaeological interpretation, not a 1230 bathhouse.

| Candidate | Verdict | Production-safe wording | Limits |
|---|---|---|---|
| bathing-house → wood | **APPROVE_WITH_LIMITS** | The chronicle’s legendary bathing description represents bathhouses as wooden. | Broad 1100–1300 Rus cultural compatibility, inferred/medium only; no existing bathhouse, dimensions, timber stock, or local installation. |
| bathing-house → heating | **APPROVE_WITH_LIMITS** | The chronicle’s bathing description represents heating before washing; the archaeological structure includes stones but no identified stove. | PWL direct narrative plus Stepanov’s early-Novgorod structural corroboration. No fuel, stove type, temperature, duration, fire safety, or therapeutic result. |
| washing → water | **APPROVE_WITH_LIMITS** | Water is part of the washing sequence in the chronicle’s bathing description. | Cultural-text compatibility only. Not a water source, quantity, purity claim, or mandatory cold-water step. |
| soft young twigs → bathing practice | **NEEDS_EVIDENCE** | — | The twigs are only in the legendary narrative currently checked. The Stepanov/Khoroshev archaeological discussion corroborates bathhouse-like structures, not this implement/practice. Do not promote without a separate scholarly source. |
| Andrew visited Novgorod | **REJECT** | — | The narrator frames the visit as “as they say”; it is not an historical-event fact. |
| kvas → chemical process | **REJECT** | — | “Квас кожевенный” in the legend is not a validated material/compositional or chemical-process premise. |

**Common access and applicability for eligible rows:** `domain_internal_only`; historical cultural compatibility for Rus, 1100–1300, `inferred/medium`. The facts do not create a canonical civic/ordinary location or entity.

## Production record re-check

Read-only check of `production-v1/bathing.json`:

| Claim ref | Verdict | Reason |
|---|---|---|
| `claim:bathing-wooden-bathhouse-wood` | **APPROVE_WITH_LIMITS** | Correctly uses `attested_use`, both the legend and the early archaeological material-category evidence, 1100–1300 inferred/medium applicability, and excludes a current bathhouse or timber stock in RU/EN. |
| `claim:bathing-house-heating-before-washing` | **APPROVE_WITH_LIMITS** | Correctly relies only on the PVL bathing description for heating and preserves all exclusions: no stove, fuel, temperature, duration, safety or medical result. |
| `claim:bathing-washing-water` | **APPROVE_WITH_LIMITS** | Correctly models existing `wk:material_culture:water`, not a separate water identity; its `attested_use` is narrowly tied to bathing-washing and RU/EN exclude source, quantity, purity and a mandatory cold stage. |

This approval is confined to these three claim records. It is **not** an approval of a sanitation domain, twig use, a bathhouse entity, the legendary journey, or any bathing recipe.
