# Independent verification: harvest and husbandry candidates

**Scope:** HH-01…05 from `research/population-harvest-husbandry.md` only.
This verifies bounded historical compatibility; it approves no production
record, tool, animal, crop, worker, stock, right, or scene outcome.

## Source identity and exact anchors

Independently opened the [Institute of Archaeology RAS record](https://archaeolog.ru/el-bib/el-cat/el-series/mia/kolchin-1953)
and its linked [official PDF](https://archaeolog.ru/media/series/mia/MIA_32.pdf),
then compared the relevant pages with local text from that PDF. The record
identifies B. A. Kolchin, *Черная металлургия и металлообработка в древней
Руси (Домонгольский период)*, Moscow: Academy of Sciences USSR, 1953, 259 pp.,
*Материалы и исследования по археологии СССР* no. 32.

- pp. 88–89 enumerate sickles, scythes and sheep-shearing scissors among
  iron-and-steel agricultural/productive implements of ancient Rus.
- pp. 90–91 expressly place sickles and scythes among tools for harvesting
  bread crops and grasses; the sickle discussion says a wooden handle was put
  on the tang and notes preserved wooden handles.
- pp. 97–98 describe the examined scythe from Sista, kurgan 9, in the
  Novgorod burial group (XI–XII centuries): its inset steel blade/strip and
  iron sides/base are explicit metallographic observations.

## Candidate verdicts

| Candidate | Verdict | Approved scope and mandatory limits |
| --- | --- | --- |
| HH-01 | APPROVE_WITH_LIMITS | A sickle is directly described as a harvest tool for bread crops and grasses. Its Novgorod-Land 1100–1300 use is historical compatibility, therefore `attested` / medium / `inferred`; it is not a present, accessible or compulsory sickle, harvest action, calendar, crop, labourer, or yield. |
| HH-02 | APPROVE_WITH_REUSE | The same direct source statement covers a scythe. Existing `claim:household-scythe-cutting` already covers scythe-to-grass-cutting, so do not create a duplicate generic scythe fact. If crop harvest is materially needed, augment that canonical relation with this precise source evidence or add only its missing grain-harvest relation. Neither path establishes a field, haymaking schedule, fodder, tool availability, or current work. |
| HH-03 | APPROVE_WITH_LIMITS | Kolchin directly reports wooden sickle handles, including surviving examples. Normalize only as a qualified historical construction possibility (`may_have_component` or equivalent bounded wording), with inferred/medium Novgorod-Land compatibility. It is not a universal build, handle dimensions/material stock, ownership, or a usable tool in scene. |
| HH-04 | APPROVE_WITH_LIMITS | Sheep-shearing scissors are directly named in the Old Rus iron-and-steel agricultural/productive-tool assemblage. This supports a material-process category, with broad 1100–1300 Novgorod compatibility inferred/medium—not local sheep, flock size, season, wool/fodder supply, an NPC skill, or a shearing event. |
| HH-05 | APPROVE_WITH_LIMITS | The Sista specimen provides direct, high-confidence find-level evidence for one XI–XII-century Novgorod-burial scythe: a welded/inset steel blade/strip with iron sides/base. Historical use around 1230 is inferred/medium. Keep the singular `examined specimen` qualifier; it is not a universal scythe specification, numeric material recipe, forge, or present tool. |

## Date, region, and normalization boundary

The source's direct statements concern pre-Mongol Rus or one earlier
XI–XII-century Novgorod burial specimen. None is a direct observation of the
year 1230. Any 1100–1300 Novgorod-Land claim must preserve that as
inferred/medium compatibility, while evidence wording retains its direct
source/find scope.

`source:ha-firesteel` is already the same MIA 32 monograph. Its source
metadata should name the whole work and `МИА 32 (1953)`; its p. 165 firesteel
anchor remains evidence-level metadata. This is a source-faithful reuse, not a
second source record.

No candidate establishes winter fodder, crop-specific threshing/winnowing,
grain-storage construction, household husbandry, or an ordinary animal/crop
inventory. Those gaps remain gaps.

## Exact normalization — current authoring

**PASS_WITH_LIMITS.** `agriculture-fauna.json` correctly normalizes HH-01,
HH-03, HH-04 and HH-05 as four separate `supported_fact` claims:
`claim:harvest-sickle-crops-grasses`,
`claim:harvest-sickle-wooden-handle`,
`claim:harvest-sheep-shearing-scissors`, and
`claim:harvest-scythe-iron-steel-specimen`. Each is
`domain_internal_only`, limited to 1100–1300 Novgorod Land, and marked
`attested` / medium / `inferred`; its evidence anchor retains the direct
source scope. The RU and EN runtime texts preserve the approved negative
limits: historical compatibility is not a present tool, worker, animal,
material stock, universal construction, recipe, or scene fact.

HH-02 correctly reuses the existing grass-cutting scythe claim rather than
duplicating it. `source:ha-firesteel` now identifies the whole Kolchin
monograph and `МИА 32 (1953)`; the page-specific anchors remain attached to
the relevant evidence records. This verifies normalization only, not broader
world readiness.
