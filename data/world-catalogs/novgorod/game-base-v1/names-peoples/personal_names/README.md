# personal_names — candidate

Status: candidate. Not approved (this collector does not self-approve).

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
  1230–1250 attestation.
- Only the personal first-name form enters this pool. Patronymics, demonyms
  and nicknames are excluded for a future component pool. `source_form` in
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
a closed row-level reason. The resulting pool has 179 unique entries. Typed
gaps include every people×sex ordinary pool below 10 rows, unresolved
social-position selection, the `medieval_general` temporal caveat and the
future patronymic/nickname component pool. No mention-count weights are used.

Build and check:

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

Patronymic (`-ич`, `-ов`) and nickname (`name_kind`) patterns are NOT
separately enumerated yet — the source candidate carries only baptismal /
vernacular first names, no patronymic-formation rules or nickname corpus.
`name_kind` in the CSV is a placeholder value
(`baptismal_or_vernacular`) pending that split; treat it as a further gap.

## Sources

- `pr98:onomastics/candidates/novgorod-1230-1250-v1/candidate.json` (54
  names; underlying evidence: берестяные грамоты, НПЛ, Чайкина 2006, etc. —
  see each row's `attestation`/`source_refs`).
- `game-base:tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json`
  (draft, `requires_human_audit: true`).
- `../sources/book_evidence_m2c_names_b2.csv` (149 pinned rows used by B2;
  full 207-row include/exclude accounting is generated from
  `b2-evidence-derivations.tsv`).
