# Independent verification — rural settlement context

**Scope:** verification of `RSC-01` and `RSC-02` from
`research/population-rural-settlement-context.md`. This is not production
authoring, a spatial binding, or an approval of a present village.

## Source independently opened

N. A. Makarov (ed.), [*Археология севернорусской деревни X–XIII веков*,
vol. 3](https://www.archaeolog.ru/media/series/arch-northrus-village/Arch_northrus_village-3.pdf),
IA RAS / Nauka, 2009. The official full PDF was independently opened in the
IA RAS browser source. The foreword's printed pp. 5–6 (PDF preliminary pp.
6–7) was visually inspected. It describes the multi-institutional study of
the northern-Rus rural-settlement corpus, its archaeological materials and the
work's scope. Its stated geography includes the Minino/Kubenskoye focus and a
broader northern-Rus comparison; it is **not** a site report for Novgorod Land
or for the year 1230.

## Verdicts

| ID | Verdict | Production-safe RU / EN wording | Checked anchor and rationale | Applicability and non-negotiable limits |
|---|---|---|---|---|
| RSC-01 | **APPROVE_WITH_LIMITS** | **RU:** Севернорусское сельское поселение X–XIII вв. исторически совместимо с контекстом сельского хозяйства и жизненного обеспечения общины. **EN:** An X–XIII-century northern-Rus rural settlement is historically compatible with a context of rural household economy and community life support. | Foreword, printed pp. 5–6: the third volume synthesises archaeological work on the northern-Rus rural-settlement corpus and frames its study around economy, life support, social organisation and cultural traditions. This supports a **compatibility envelope**, not a census of functions at each excavated site. | `northern Rus`, X–XIII only; **inferred/medium** for the relation. It may be extended to Novgorod Land c.1230 only as separately labelled broad northern-Rus compatibility, never as local direct attestation. It creates no settlement, household, building, person, activity, stock, landholding, access or spatial authority. It must not imply that agriculture was the sole or mandatory rural activity. |
| RSC-02 | **APPROVE_WITH_LIMITS** | **RU:** В севернорусском сельском археологическом контексте X–XIII вв. земледелие и состав сельскохозяйственных культур являются исторически совместимыми хозяйственными измерениями. **EN:** In the X–XIII-century northern-Rus rural archaeological context, agriculture and the composition of agricultural crops are historically compatible economic dimensions. | Foreword, printed p. 5, explicitly identifies the formation of agriculture and the composition of agricultural crops among the economic aspects reconstructed for rural territories. The proposition is safely a contextual compatibility claim; it is not a finding that every settlement had a field or a particular crop. | `northern Rus`, X–XIII only; **inferred/medium** for the relation. Do not represent it as a dated Novgorod-1230 field, cultivation event, seed, tool, labourer, calendar, yield, stored food, fiscal duty or present availability. Existing crop-specific and harvest claims remain the only possible support for those narrower relations. |

## Exclusions

- `pogost` remains **NEEDS_EVIDENCE**. The opened source discusses excavated
  rural settlements; it does not establish ecclesiastical, fiscal,
  administrative or service functions of a pogost.
- Neither row closes the seasonal-work-cycle gap: the foreword supplies no
  activity-to-season relation.
- Neither row is authority for a current village/field, ownership, access,
  agricultural schedule or NPC routine.

## Exact production-normalization check (compiled 495)

**MATCHES verification.** `settlement-craft.json` now contains
`claim:rural-household-economy-context` and
`claim:rural-agriculture-crop-context` with the shared
`wk:architecture_settlement:rural-settlement-context` subject. Both retain
`supported_fact`, 1100–1300, `region_novgorod_land`,
`attested/medium/inferred`, and `domain_internal_only`. Their RU/EN runtime
text explicitly describes the Northern-Rus source as a comparative envelope
inferred for Novgorod Land, and excludes a current settlement, field, stock,
worker, calendar, harvest, ownership and access. Evidence
`evidence:northern-village-economic-context` records the same independent
limit. No correction is required.
