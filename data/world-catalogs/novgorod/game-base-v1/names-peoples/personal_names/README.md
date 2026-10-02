# personal_names — candidate

Status: candidate. Not approved (this collector does not self-approve).

## Per-people pools (D51 p.2)

The B2 projection has one draft pool per represented people. `region_id` is
the region where these people may be encountered in this world revision;
`people_ref` and the stable pool id identify the name origin. The six
per-people pools therefore use `region_novgorod_land` for 1230–1250. Their IDs are
`novgorod_1230_1250_gotland_guest_names_v1`,
`novgorod_1230_1250_german_guest_names_v1`,
`novgorod_1230_1250_korela_names_v1`,
`novgorod_1230_1250_izhora_names_v1`,
`novgorod_1230_1250_chud_est_names_v1` and
`novgorod_1230_1250_smolyane_names_v1`. No G0 regions are introduced here;
future pools for those homelands need a separate Spatial decision.

Twenty-six entries with established `people_ref` move from the Novgorod pool
to these six per-people pools. Иголанд remains a typed `people_ref_unresolved` gap because
its source only establishes mixed guest group `pp_fg005`; it is not assigned a
Russian or guessed people pool. `pp_korela` has one significant male form,
`Валит`, from the explicit attestation `book:318333 §564` («воевода Валит
Корелянин»). The same source dates him to 1337/38 (§573, Sofia chronicle), i.e.
the XIV century. The entry remains `medieval_general` and the report carries a
temporal evidence gap; it does not establish a 1230–1250 ordinary pool. D61 adds a separate pending calendar-rule candidate pool for Korela; these forms do not turn Valit into an ordinary name.

## B2 import projection (C013b)

`name_pools.csv` and `name_pool_entries.csv` are the deterministic B2 import
projection of the compiled candidate plus the reviewed evidence decisions in
`b2-evidence-derivations.tsv`. `b2-name-pool-source.json` is the local
authoring owner; `../scripts/build-b2-name-pool.mjs` rebuilds the two import
tables and `name-pool-report.json`. Existing candidate rows keep stable
`nov_name_*` ids; evidence-only rows receive stable line-based ids. The output
uses closed `pp_*` ids from `peoples_origins.csv`, leaves an empty
`social_position_archetype_id` to mean "unrestricted", and assigns equal
weight `1`. Import rows use schema-level status `draft`; the data remain
candidate until the owner approves them, and this pass does not activate
runtime import.

`b2-import-contract.json` fixes the exact CSV→world_base mapping. CSV primary
keys use the physical `id` column. The B2 importer must inject a caller-owned
`world_revision_id` that resolves in `world_base.world_revisions`; this data
package deliberately does not invent a future revision id. The entry columns
after the B2 DDL delta map directly; empty category/social-position cells map
to SQL `NULL`. Until that DDL/importer exists, this is target authoring data,
not a claim about current production. B2 must replace current
`UNIQUE(name_pool_id, name_form)` with the authored key
`(name_pool_id, name_form, sex_category, people_ref)`: the same form can
validly occur for different peoples or sex categories.

Evidence derivation is fail-closed:

- Sex is `explicit_source_gender` when the value/quote states male/female or
  a grammatical relation such as husband, wife or daughter closes it.
  Otherwise a baptismal calendar name may use `calendar_name_gender`.
  Non-calendar names without sourced sex remain gaps.
- A person in a Novgorod or Novgorod-land document, chronicle or act maps to
  `pp_novgorod_rus` with `people_derivation=novgorod_land_document`. Another
  people/region maps only when the source says so
  (`source_explicit_people`). Neighbor-land ids are not people selectors;
  stable explicitly sourced guest-group ids may be used for foreign envoys.
- Class belongs to the name form, not to its attested bearer. A source-marked
  princely-dynasty form is `dynastic`; a form attested only for one known
  person is `significant` only when it is non-calendar; monks' and nuns'
  forms remain `monastic`. Every Christian calendar form is `ordinary`, even
  when attested only for a posadnik or archbishop, and carries
  `derivation_class=calendar_name_any_christian`. Other non-calendar forms
  without a named role remain `ordinary`.
- `c1230` is retained as-is. `medieval_general` admits XI–XIV-century evidence
  with an explicit temporal caveat; it does not assert an individual
  1230–1250 attestation. `late_medieval` marks XV-century evidence and keeps
  it out of the XI–XIV bucket.
- Only the personal first-name form enters this pool. Patronymics, demonyms
  and nicknames live in the separate candidate component pools described
  below; they do not enter the first-name selector. `source_form` in
  the decision TSV retains the spelling/case found in evidence when
  `name_form` is normalized (for example `Офимию` → `Офимья`).

There is one row per `(name_form, sex_category, people_ref)`. All contributing
candidate/evidence references are retained in `provenance_ref`. When sources
for the same key have different classes, independent `ordinary` evidence
wins; otherwise the restrictive order is `dynastic`, `significant`,
`monastic`. Calendar-form admission also wins over the bearer's office. This
preserves ordinary `Михаил`, `Стефан` and `Спиридон` while keeping the
source-marked dynastic `Ростислав` out of ordinary selection. Selected sex
and people derivations prefer explicit evidence over calendar/candidate
defaults.

The repo-local snapshot
`../sources/book_evidence_m2c_names_b2.csv` pins exactly the evidence rows
used by the pool. Provenance resolves only into that snapshot; builder and
validator require every `source_form` to occur in its referenced row. The
decision TSV accounts for all 207 reviewed source rows: 149 included rows
contribute 223 derived records before key merging, and 58 are excluded with
a closed row-level reason. D46 adds `d46-name-additions.json` as a narrow
archive-decision owner: 158 origin-bound or local first-name entries are
projected, 19 variants remain attached to their existing targets, and ten
forms remain non-selectable typed gaps (four §5.3 exclusions, two forms that
require lower weight, and four unresolved Turkic origins). The D61 candidate
adds twelve separate Korela calendar-rule forms (four male, eight female) from
Russian records dated to the XII–XIII centuries; each stays `confidence=C`,
`period_cap=1260`, and notes that it is a rule-based transfer, not an attestation
of a Korela bearer. Gotland and German guest female gaps are marked
`not_applicable` for v17 under the pending male-only binding successor kept in
`data/world-catalogs/novgorod/m2c-npc/people-d49/d61-candidate/`; the
approved `people-d49/candidate.json`, its approval, and operational promotion
script remain unchanged. No broader
historical absence is claimed. The operational pool has 337 unique
entries; the 12 D61 rows live only in `name_pool_entries_candidates.csv` and
are excluded from the pinned import file. Exact archive periods, regions, basis, confidence and
source refs stay in the authoring delta; its two repo-local source snapshots
are pinned by SHA-256. The B2 import schema is unchanged. Typed
gaps include every people×sex ordinary pool below 10 rows, unresolved
social-position selection, the `medieval_general` temporal caveat and the
component-pool runtime-import gap. No mention-count weights are used.

## Component pools (C016)

`name_component_pools.csv`, `name_component_entries.csv` and
`name_component_rules.csv` keep patronymics, nicknames and demonyms separate
from the first-name pool. `name-component-source.json` and the narrow reviewed
delta `name-component-army-additions.json` and D46 delta
`d46-name-additions.json` are the authoring owners;
`../scripts/build-name-components.mjs` produces the three CSVs and
`name-component-report.json`. The original repo-local snapshot
`../sources/book_evidence_m2c_name_components.csv` pins all 40 reviewed rows
used by the first pass. The SHA-256-pinned army snapshot
`../sources/book_evidence_name_components_army.csv` contains 1,059 candidate
rows after scanning all 16,927 extract rows: all 769 exact `name_form` rows
from `x-*`, plus the four reviewer-requested
`x-people` domains. `name_component_candidate_decisions.csv` gives exactly one
include/reject decision and closed reason for every snapshot row. The MASTER
archive was also screened: 22,220 canonical entities yielded no personal-name
component forms; its SRC048 is only a bibliographic lead.
The ledger proves coverage of the checked-in 1,059-row candidate snapshot;
the 16,927-row upstream total is preparation-process metadata. A semantic
rescreen of the former 232 `screened_no_supported_component` and 228
`reviewer_requested_people_domain_no_component` rows returned 16 new
components from 10 source rows; the remaining reasons are recorded in the
generated report. The 85-row
`../sources/book_evidence_name_component_direct.csv` pins
compact excerpts for every cited book paragraph so validation also works
outside Servak.
All 55 army rows retained as active entry provenance were reconciled against
the later `evidence/v2` extract. The old `army_0377` row is broken there and
no longer supports `корела`; it remains only as a rejected row in the pinned
historical ledger. v2 period labels also move `емь`, `варяг` and `варяги` to
`medieval_general`.
The builder also matches every included component form against all 1,059
candidate `value` and `quote` fields: secondary attestations are recorded as
`duplicate_of_included_form`. The small explicit ignored-pair list documents
homonyms such as `красный` mead, generic occupations and the quantifier
`весь`, so they cannot silently pass as personal-name evidence.
For every `source_attested_form` entry and rule the validator additionally
requires its declared surface form in checked-in support after only the
declared historical spelling normalizations: ё/е, final ъ/ь and ц/ч. It also
checks the semantic-rescreen row and component arithmetic against the ledger.
D46 adds 13 component rows and links five archive decisions to existing
components, producing 219 component entries without turning components into
first names. Archive support must contain each new component surface form.

Every entry has grammatical `form_kind`, a shared lexeme id and a referent.
`people_ref` is used only where the closed selector exists; otherwise
`selector_status=gap` keeps the form without inventing a people id. Bearer
class and `social_tendency` are evidence context, not eligibility: forms seen
on boyars are not thereby reserved to boyars. The suffix row records that
`-ич/-евич/-ович/-инич` is often attested on elite bearers, but sources do not
prove exclusivity or a complete productive morphology. `Нездыловъ` in
`book:639442 §262` supports a possessive `-ов` form: in «Дрочило Нездыловъ
сынъ кожевника» the component names the father Нездыло, while the following
words give the father's occupation. The order «personal name + сынъ + named
father» is directly attested by «Всеволодъ сынъ Юрьевъ» and «Ярославъ сынъ
Володимеров», so the rule is a `source_attested_form` candidate, not a gap.

Component `selection_class` follows the form, not merely the bearer. The
closed values are `ordinary`, `dynastic` and `significant`; the ordinary
selector returns only `ordinary`. Patronymics from the closed princely-name
set are `dynastic`. A unique historical epithet is `significant`. Full
personal designations are not stored as nickname entries: their patronymic,
occupation nickname and demonym components are separate rows.

Attested nickname forms remain distinct from open rules by occupation, place,
appearance and character. Красный and Щербатый are attested appearance
examples and remain `significant` personal epithets; ordinary appearance
variants come only from the open rule. Open rules use `logical_necessity` and
confidence C; they do
not authorize an anachronistic occupation, place or trait. `Нежек` is retained
as the task-requested candidate with an explicit limit: the source attests the
form but does not classify it as a nickname. Demonyms store singular, plural
or collective forms separately under one lexeme. Collective names such as
`корела`, `чудь`, `емь`, `водь` and `литва` are not silently modernized into
invented plurals. Runtime/DDL
composition with first names is an explicit integration gap, not active data.

Build and check:

```sh
node names-peoples/scripts/build-name-components.mjs
node names-peoples/scripts/validate-name-components.mjs --self-test
```

```sh
node names-peoples/scripts/build-b2-name-pool.mjs
node names-peoples/scripts/validate-b2-name-pool.mjs --self-test
```

## Method

`../scripts/build-personal-names.mjs` reads:
- `pr98:onomastics/candidates/novgorod-1230-1250-v1/candidate.json` (54
  names, `status: candidate_not_approved`, `import_enabled: false`) —
  read-only from the PR#98 runtime worktree.
- `game-base:tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json`
  is also read by the script, but **contributes nothing**: the script
  reads `npcPools.pools_by_id || npcPools.pools`, and neither key exists
  in that file (its top-level keys are `male_name_pool`,
  `female_name_pool`, `monastic_name_pool`, …), so the lookup always
  misses. Every pool value in the CSV (`russian_common_male/female`,
  `monastic_male`, `dynastic_male`, `baltic_west_contextual`, …) comes
  from the candidate's own `pools` map. This is the correct outcome: the
  candidate's own `AUDIT_CORRECTIONS.md` and `approval-request.json`
  name that npc_name_pools file as a `forbidden_promotion_source`. The
  dead read should eventually be removed from the script; it is flagged
  here rather than silently kept.

It writes `personal_names.csv` (54 rows) and `coverage-report.json`
(counts by origin×sex, and the candidate's own declared gap list).

## Counts (from script output)

- 54 names total: 20 male, 34 female — all `origin: novgorod_rus`.
- Confidence: A-grade evidence (`evidence_grade` A1/A2, mostly berestyanye
  gramoty + НПЛ) → confidence A; B-grade → B; anything else → C. All 54
  current rows resolved to confidence A in this pass.
- `excluded` in the source candidate: **9 names**, not 1 — see
  `coverage-report.json`'s `excluded_pending_review` list. They are Rolf
  (Scandinavian, `needs_review`), Ольга, Елена, Мстислав (Георгий),
  Ростислав (Михаил, `rejected`), Марена (`rejected`), Милуша
  (`rejected`), Милослава (`rejected`) and Онцифор — none included in the
  CSV.

## Gaps (real, per acceptance rule "≥10 male + ≥10 female per people")

The source candidate itself declares these pools as empty:
`karelian`, `izhorian`, `votic`, `estonian`, `broad_finnic`. The brief also
calls for Baltic, Scandinavian and German pools; the only excluded
Scandinavian candidate name network-wide is Rolf (`needs_review`), and
`baltic_west_contextual` in the npc_name_pools file is empty. The
candidate's `contextual_authoring_only` list (separate from `names` and
from `excluded`) does hold 6 more seeds that are neither mentioned nor
exported by this build: Гюлопа (`turkic_novgorod_context`), Иголанд
(`finnic_context`), and Hæil(h)vatr, Regenbode, Dethard, Adam (all
`baltic_west`) — all `evidence_grade: B1`, `status:
contextual_authoring_only`, not compiled into `personal_names.csv` or
into any pool. These are the only existing non-Slavic seeds in the
candidate at all.

The 54-row source compiler does not fill these pools. The separate B2 evidence
projection now adds the individually sourced Izhora, Estonian/Chud, Gotlandic
and German forms listed in `name_pool_entries.csv`, but none reaches the
≥10/≥10 ordinary threshold. Closing those gaps still needs sourced per-people
onomastic corpora; the report records the current count for every selector.

`personal_names.csv` still carries only baptismal / vernacular first names and
keeps placeholder `name_kind=baptismal_or_vernacular`. Component forms and
rules are now enumerated in the separate C016 tables; the remaining gap is
runtime composition, not absence of candidate data.

## D51 names-gap review: initial search (historical, before D61; 2026-10-01)

The first two review circles found no additional forms meeting all source,
people, sex, ordinary-class and period checks. This is a historical search
result, superseded for Korela by the later D61 calendar-rule candidate below.
The B2 build imports detailed gap rationales into `name-pool-report.json`.

| People | Ordinary male at initial search | Ordinary female at initial search | Historical result |
|---|---:|---:|---|
| Gotland (`pp_fg001`) | 1 | 0 | Хейльватр is attested in the 1160–1170s layer; no additional form in the target period was found in that search. |
| German trading circle (`pp_fg002`) | 16 | 0 | Sixteen male forms remain sourced to the 1229 trade-treaty context; no ordinary female form was found in that search. |
| Korela (`pp_korela`) | 0 | 0 | Валит remains significant; source dates bearer to 1337/38 and may use “валит” as a title. |
| Izhora (`pp_izhora`) | 1 | 0 | Филипп remains ordinary under the Christian-calendar rule; Пелгусий/Пелугий remain significant for one named person. |
| Chud/Estonian (`pp_chud_est`) | 0 | 0 | Лембито/Лембит remains significant for the named Sakala leader. |
| Smolyane (`pp_smolyane`) | 0 | 0 | Ивор remains significant; Водмол is a by-name, and Михайлович is a patronymic. |

Novgorod control remains 204 male / 62 female. These are initial-search counts,
not current Korela counts and not an approval or runtime-selection claim.
Igoland remains `people_ref_unresolved`: pp_fg005 is a mixed Finnic guest
group and the collected source does not identify a single people. The local
SQLite book-index search found no resolving passage.

### Current D51 candidate after D61

The operational B2 draft has 337 entries across 7 pools. D61 adds 12 Korela
baptismal-name candidates by calendar rule in a separate candidate CSV: 4 male
and 8 female. Current operational ordinary pool counts are Gotland 1/0,
German 16/0, Korela 0/0, and Izhora 1/0 (male/female); the Korela candidate
counts are 4/8 outside the operational pool. Both Korela pools remain below
the 10-name threshold. The 12 forms are draft,
confidence C calendar transfers, not direct attestations of Korela bearers;
the name-pool package was accepted by Opus with limits but remains unbound and
not import-authorized.

The German and Gotland female gaps are `not_applicable` in the D61 candidate
because its foreign-merchant successor is male-only. This is not a historical
absence claim. The operational @2 profile still permits female guests, so
those gaps can be treated as closed only if the @3 successor and name-pool
candidate are promoted together after operational re-approval. Until then,
runtime behavior and the current pool bindings remain unchanged.

The search started with the compiled names-peoples evidence, rus13 candidate,
regional onomastic notes, WK, and read-only master archive, then checked the
local read-only FTS5 books index for the remaining gaps. Index searches are
bounded; an unlocated name is left as a gap rather than filled by analogy or
Russian fallback. Exact per-gap reasons and inspected source refs are in
`names-gaps-additions.json` and the generated report.

### V17 applicability review (circle 2, updated for D61 candidate)

`needed_in_v17` below means a people-origin can be materialized by the
approved-data-only G4/G5 target authoring and its composition profile. This
table reflects the D61 target successor: its Gotland/German female gaps are
`not_applicable` because @3 is male-only. The current operational @2 still
permits both sexes; import and activation remain unauthorized.

| People | Sex | needed_in_v17 | Target context and causal basis | Name result |
|---|---|---|---|---|
| Gotland | male | yes | Foreign-merchant composition on eight Lower Dvina G4/G5 contexts; merchant contact attested, transfer to generated scenes analogical. | One older ordinary form; no new target-period form. |
| Gotland | female | no* | D61 @3 successor removes female applicability for these target contexts; this is a candidate profile constraint, not a historical absence claim. | `not_applicable` in draft; operational @2 still permits female guests until paired promotion. |
| German trading circle | male | yes | Foreign-merchant composition on the same eight contexts; German merchant contact attested, target-scene transfer analogical. | Sixteen existing forms retained; no new form proposed. |
| German trading circle | female | no* | D61 @3 successor removes female applicability for these target contexts; this is a candidate profile constraint, not a historical absence claim. | `not_applicable` in draft; operational @2 still permits female guests until paired promotion. |
| Korela | male | yes | Traveler/guide profile on six river-route contexts. Karelians are attested near Ladoga/Neva; ordinary G5 travel is explicitly low-confidence analogy, not a resident cohort. | Operational pool 0; 4 draft calendar-rule candidates stay outside the pinned CSV. Confidence C, `period_cap=1260`; not direct Korela-bearer attestations. |
| Korela | female | yes | Same guide contexts; profile permits female sex category. This is target authoring eligibility, not direct evidence of female guides. | Operational pool 0; 8 draft calendar-rule candidates stay outside the pinned CSV. Confidence C, `period_cap=1260`; not direct Korela-bearer attestations. |
| Izhora | male | yes | Traveler/guide profile on six river-route contexts; Izhora presence near the Neva is source-backed, ordinary G5 travel analogical. | Existing `Филипп` retained, no duplicate. `book:857568 §733`: «один ижорянин – Пелгусий, во Святом Крещении Филипп»; event dated 1240 (`book:681281 §419`), `basis=calendar_rule`, `confidence=A`, `period_cap=1240`. |
| Izhora | female | yes | Same guide contexts; profile permits female sex category. This is target authoring eligibility, not direct evidence of female guides. | No attributed female form; gap remains. |
| Chud/Estonian | male | only outside slice | No Chud/Estonian origin profile or people composition group in target v17 contexts. Estonian Chud homeland lay outside the Novgorod oblast; exceptional tribute/war contact does not establish ordinary local generation (`book:751267 §649`). | No v17 name gap. Lembitu remains significant, outside ordinary pool. |
| Chud/Estonian | female | only outside slice | No Chud/Estonian origin profile or people composition group in target v17 contexts; this is scope, not a historical absence claim. | No v17 name gap. |
| Smolyane | male | only outside slice | No Smolyane origin profile or composition group in Lower Dvina target contexts. Smolensk guests are attested in Novgorod (`book:301539 §884`), outside this materialized context set. | No v17 name gap; catalog coverage gap remains for a later context. |
| Smolyane | female | only outside slice | No Smolyane origin profile or composition group in Lower Dvina target contexts; this is scope, not a historical absence claim. | No v17 name gap. |

`no*` means not applicable under the pending D61 @3 target successor. Do not
close these female gaps in an operational package that still uses @2.

The eight Gotland/German target pairs are `zaostrovye_landing`,
`sheltered_landing_terrace`, `central_navigation_reach`, `north_exposed_turn`,
`north_outflow_reach`, `sheltered_inner_reach`, `south_entry_reach`, and
`vikhtuy_river_approach`. The six Korela/Izhora route pairs are
`floodplain_ridge_route`, `central_current_split`, `east_flood_bypass`,
`east_side_channel`, `west_side_channel`, and `tributary_mouth`.

The Korela calendar forms derive from names attested in Novgorod records and
the 1227 mass-baptism rule; they do not attest Korela bearers. Chud and Smolyane
are outside this generated slice, not historically absent. Foreign pools remain
unbound in current identity runtime; the D61 successor and paired female-gap
disposition are candidates only. The matrix and exact references are in
`names-gaps-additions.json` and `name-pool-report.json`.

## Sources

- `pr98:onomastics/candidates/novgorod-1230-1250-v1/candidate.json` (54
  names; underlying evidence: берестяные грамоты, НПЛ, Чайкина 2006, etc. —
  see each row's `attestation`/`source_refs`).
- `game-base:tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json`
  (draft, `requires_human_audit: true`).
- `../sources/book_evidence_m2c_names_b2.csv` (149 pinned rows used by B2;
  full 207-row include/exclude accounting is generated from
  `b2-evidence-derivations.tsv`).
