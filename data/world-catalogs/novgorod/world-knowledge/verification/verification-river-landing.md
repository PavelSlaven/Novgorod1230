# Independent verification — river-landing candidates

**Scope:** independent verification of RL-01–RL-04 in
`research/population-river-landing.md`. This is not production authoring and
does not create a present quay, landing, route, vessel, cargo, market,
controller, access right or completed transfer.

## Independently opened source

M. N. Tikhomirov, [*Древнерусские города*, 2nd revised edition (Moscow,
1956), printed pp. 45–46](http://rusarch.ru/tihomirov1.htm), full public
scholarly-library HTML. The relevant passage was independently read in the
electronic text between its printed-page markers `-45-` and `-46-`.

Tikhomirov places the Novgorod Podol on the Trade Side, adjoining the Volkhov
and close to the market. He states: «В районе Подола находились новгородские
„вымолы“, или пристани». He then explains that this is not merely a sandbank
or shoal; says that lists of the *Ustav Yaroslava o mostekh*, which he dates to
the end of the XII or beginning of the XIII century, name five Trade-Side
*vymoly*; and describes the road-surface and allocation wording. This is a
scholarly reading of the medieval *Ustav*, not an independently opened
manuscript or a physical survey of a 1230 landing. The date and documentary
interpretation below are therefore limited to Tikhomirov's explicit reading.

## Candidate verdicts

| ID | Verdict | Independently checked basis | Approved wording (RU / EN) and limits |
| --- | --- | --- | --- |
| RL-01 | **APPROVE_WITH_LIMITS** | Tikhomirov directly writes «вымолы, или пристани» and expressly rejects a reading as only a sand spit or shoal. He places the specific evidence in the Trade-Side Podol by the Volkhov, close to the market. | **Вымол в описанном новгородском подольском контексте обозначался как речная пристань.** / **In the described Novgorod Podol context, a *vymol* was designated as a river landing.** Use only as an historically compatible category for 1100–1300 / Novgorod land, with medium inferred applicability to c.1230. It is not a universal lexical definition and creates no named landing, bank form, material, depth, berth, vessel, safety, access, cargo or unloading event. |
| RL-02 | **APPROVE_WITH_LIMITS** | Tikhomirov says the lists name five Trade-Side *vymoly*: Nemetskii, Ivan', Alferdov, Budjatin and Matfeev. His date for the underlying *Ustav* is end XII/beginning XIII; the passage also notes that the earliest surviving copy is XIV century. | **В толковании Тихомирова списки Устава называют на Торговой стороне пять вымолов: Немецкий, Ивань, Алфердов, Будятин и Матфеев.** / **In Tikhomirov’s reading, the Ustav lists five Trade-Side vymoly: Nemetskii, Ivan', Alferdov, Budjatin, and Matfeev.** This is a bounded named-list context, not authority to materialize five landings or their exact locations. The names do not prove current ownership, foreign-court affiliation, accessibility, topology or any present facility. |
| RL-03 | **APPROVE_WITH_LIMITS** | Exact passage: «К вымолам вели мостовые от Великого ряда, находившегося на торговой площади». The text says *mostovye*; it does not specify stone, timber, width, slope, condition or a traffic rule. | **Мостовые вели от Великого ряда на торговой площади к вымолам.** / **Road surfaces led from the Great Row on the market square to the vymoly.** Use as a limited historical market-to-landing connection in the author’s late-XII/early-XIII documentary envelope; c.1230 is inferred/medium. It neither creates a route nor guarantees passability, loading sequence, paving material, authority, fare, commodity, cart, porter, boat or present transfer. |
| RL-04 | **APPROVE_WITH_LIMITS** | Exact passage: «Территория вымолов была также замощена, причём было предусмотрено, кто должен был мостить определённые им участки». This is an explicit allocation of surface-work responsibility in Tikhomirov’s account; it is not evidence of later repair, a general municipal code or any party-scene condition. | **Для определённых участков территории вымолов было предусмотрено, кто должен был их мостить.** / **For specified sections of vymoly territory, it was provided who was to surface them.** Apply only to the documented historical arrangement, or as inferred/medium regional compatibility. Do not promote it to a general maintenance regime, tax, owner, construction standard, repaired surface, present obligation or access permission. |

## Boundary for authoring

All four verdicts rely on one opened scholarly exposition of the *Ustav*; they
are not independent archaeological confirmation. RL-01 and RL-03 are the
substantive category/interface facts. RL-02 is a narrow named-list context;
RL-04 is an allocation-of-surfacing relation, not a generic maintenance fact.
Any production use must preserve the source’s documentary mediation, temporal
qualifiers, and the exclusions above.

## Exact normalization check — `production-v1/civic-space.json`

**Verdict: APPROVE_WITH_LIMITS passed.** The new
`wk:architecture_settlement:river-landing` concept is a category only; its
RU/EN definitions explicitly exclude a particular landing and route. The four
claims use `supported_fact`, cite
`source:tikhomirov-cities-1956` through
`evidence:river-landing-ustav-reading` (pp. 45–46), and consistently retain
`region_novgorod_land`, 1100–1300 range, `medium` / `inferred`, and
`domain_internal_only` qualifiers.

The runtime text matches the approved limits: category rather than universal
lexicon or present facility (RL-01); Tikhomirov-mediated five-name list and
the XIV-century earliest surviving copy (RL-02); *mostovye* as unspecified
road surfaces rather than a materialized route (RL-03); and allocated
surfacing work rather than a municipal maintenance regime (RL-04). No
canonical-map, present-scene, access-right, vessel, cargo, loading, ownership
or construction-standard fact was added.
