# Independent verification — wetland non-woody vegetation

**Scope:** WLS-01 only from `research/population-wetland-stems.md`. This is a
source review, not production authoring and not evidence of a live plant stand,
gathered stems, access, harvest or usable material in a scene.

## Source independently read

E. A. Spiridonova and A. S. Aleshinskaya, [“Results of Palynological
Investigations of the Archaeological Sites in the Lake Ilmen and Lake Kubenskoye
Study Areas”](https://dokumen.pub/the-archaeology-of-medieval-novgorod-in-context-studies-of-centre-periphery-relations-9781842172780-2011050182.html),
in M. A. Brisbane, N. A. Makarov and E. N. Nosov (eds.), *The Archaeology of
Medieval Novgorod in Context*, 2012, pp. 10–42. I independently opened the
full chapter and read printed p. 21, in “Change in the vegetation in the
environs of Ryurik Gorodishche around Lake Ilmen.” It states that by the
beginning of the thirteenth century waterlogging, particularly of lower-lying
land, still appeared considerable; the stated indicators are constant sphagnum
mosses and horsetail, and `Spirea (Filipendula)` among the herbaceous plants.
The preceding/continuing discussion identifies this as a palynological
reconstruction of the environs of Ryurik Gorodishche, not an inventory of a
particular contemporary patch.

## Verdict

| Candidate | Verdict | Production-safe wording | Checked rationale and limits |
|---|---|---|---|
| WLS-01 | **APPROVE_WITH_LIMITS** | **RU:** В палинологической реконструкции окрестностей Рюрикова городища для начала XIII века переувлажнение, особенно низин, выводится по постоянному присутствию сфагновых мхов и хвоща, а также `Spirea (Filipendula)` среди травянистых растений. **EN:** In the palynological reconstruction of the Ryurik Gorodishche environs for the beginning of the thirteenth century, waterlogging—especially on lower ground—is inferred from the constant presence of sphagnum mosses and horsetail, with `Spirea (Filipendula)` among herbaceous plants. | Direct for the authors’ palaeoenvironmental inference at Ryurik Gorodishche/Lake Ilmen; **inferred/medium** for the 1100–1300 Novgorod-Land historical envelope. The original candidate must not call all three taxa “herbaceous vegetation”: the source separately calls sphagnum **mosses**, while only the `Spirea (Filipendula)` occurrence is placed among herbaceous plants. Preserve the source’s uncertain/compound taxonomic spelling rather than silently normalizing it to a modern species name. It does not establish *Phragmites*, sedge, a specific 1230 stand, current vegetation, stem size, season, harvestability, edible/safe status, ownership, access, gathering, binding, roofing, trapping or any crafted result. |

## Normalization boundary

If normalized, retain a **regional contextual historical compatibility** claim,
not `historically_attested` presence in a play scene. The pollen-based
indicator relation may constrain an independently established low/wet setting;
it cannot materialize sphagnum, horsetail or a usable flowering plant. Any
universal reed/wetland fact remains a separate biological premise and cannot
turn this source into proof of reed occurrence or use.

## Post-normalization check (482)

**Verdict: MATCHES_APPROVAL.** I checked
`production-v1/environment-p1.json` record
`claim:novgorod-wetland-pollen-context` and its two localizations. It retains
`supported_fact`, the 1100–1300 `region_novgorod_land` envelope,
`inferred`/`medium` qualifiers and `domain_internal_only`. The literal and
RU/EN text distinguish `сфагновые мхи` / “sphagnum mosses” from horsetail and
retain the source spelling `Spirea (Filipendula)` among herbaceous plants. The
runtime exclusions correctly prevent an inference to reeds, sedges, a live
stand, usable stems or scene stock. No production change was made in this
review.
