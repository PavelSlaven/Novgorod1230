# Independent verification — burial observance

**Scope:** BOP-01…03 from
`research/population-burial-observance.md`. This is read-only verification:
no production, coverage closure, rite, scene, person, grave, container or
resource is created.

## Independent source check

I independently opened the full Novgorod State University page
[*«Археологи НовГУ нашли в Старой Руссе несколько детских захоронений домонгольского периода»*](https://www.novsu.ru/university/press/news/242499/)
(20 March 2026) through browser-harness. It is an institutional news report
quoting archaeologist Elena Toropova, not a finished excavation monograph.
Its terms **«предположительно»**, **«вероятно»**, **«предварительно»** and
**«скорее всего»** must remain material limits.

The page describes four burials at Il'inskii II, most child burials, at a
probable peripheral pre-Mongol necropolis preliminarily dated to the beginning
of the twelfth century. It also says later ploughing and a drainage trench
damaged contexts. These observations support only individual containers,
not a uniform regional rite or an exact 1230 archaeological layer.

| Candidate | Verdict | Source-faithful formulation and limits |
| --- | --- | --- |
| BOP-01 | **APPROVE_WITH_LIMITS** | Toropova says the first almost unpreserved wooden coffin was judged plank-built from numerous nails; the second was tall and nailed together; the fourth retained plank coffin walls and base. Admissible: **«В предварительно датируемом ранним XII веком комплексе Ильинский II дощатые гробы описаны как сколоченные гвоздями. / In the preliminarily early-twelfth-century Il'inskii II complex, plank coffins are described as nailed together.»** Direct/high for the reported examples; 1100–1300 Novgorod-Land use only inferred/medium compatibility. No every-coffin, nail count, wood, size, maker, resource, current coffin or rite. |
| BOP-02 | **APPROVE_WITH_LIMITS** | The damaged second burial is described: its lid bent and collapsed inward, but a transverse plank was visible. Admissible: **«У крышки одного повреждённого дощатого гроба Ильинского II была видна поперечная планка. / One damaged Il'inskii II plank-coffin lid had a visible transverse plank.»** This is direct/high observation of one example, with 1100–1300 compatibility inferred/medium. It does not establish a standard lid, join, dimensions, strength, tool, material stock or present container. |
| BOP-03 | **APPROVE_WITH_LIMITS** | The source says: «Третий покойный был похоронен в долблёной колоде» and, from the log's size, regards this burial as also probably child. Admissible: **«Третий покойный Ильинского II был похоронен в долблёной колоде; по размеру колоды погребение предположительно детское. / The third Il'inskii II deceased was buried in a hollowed log; its size makes the burial probably child.»** Direct/high for container observation; regional 1100–1300 compatibility inferred/medium only. No adult use, norm, body, grave, right, timber/log, tool, or current scene follows. |

## Non-transferable boundary

The page does not establish Christian observance, clergy, prayer, orientation,
grave goods, calendar, cemetery topology, law, kin duty, or a mandatory
container. Its early-XII chronology and necropolis identification are
preliminary. Normalization, if later chosen, must name a dated individual
archaeological example and preserve the inferred/medium transfer; it must not
promote a child-biased, disturbed preliminary find into a universal ritual.

## Exact production normalization check — compiled 513 BOP-01…03

**MATCHES_APPROVAL.** I read the normalized source, three claims and RU/EN
runtime texts in `production-v1/social-institutions.json` against the
independently opened NovSU report.

| Claim refs | Exact-review result |
| --- | --- |
| `claim:burial-plank-coffin-nails` | Approved: the literal remains plural preliminary Il'inskii II examples nailed together. RU/EN preserve early-XII preliminary dating, disturbed/mostly-child contexts, individual-observation limit, 1100–1300 inferred/medium transfer and no uniform construction/rite/current stock. |
| `claim:burial-coffin-lid-transverse-plank` | Approved: exactly one damaged plank-coffin lid with visible transverse plank; it does not become a standard lid, join, dimensions, strength, tool, material stock or current container. |
| `claim:burial-hollowed-log-container` | Approved: retains the third deceased in a hollowed log and the source's probably-child-by-size qualifier. RU/EN reject adult generalization, belief/rite/clergy/prayer/topology/rights and current scene materialization. |

`source:novsu-ilinskii-burials-2026` correctly names the source as a
preliminary NovSU communication with Toropova's observations, not a completed
monograph. All records use `material_culture`, literal `supported_fact`,
`domain_internal_only`, 1100–1300 / Novgorod-Land inferred-medium compatibility
and no coverage promotion.
