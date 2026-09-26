# personal_names — candidate

Status: candidate. Not approved (this collector does not self-approve).

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

**None of these are filled by this pass.** Filling them needs new sourced
research (per-people onomastic corpora for Karelian/Izhorian/Votic/Estonian
communities ~1230, and Scandinavian/German name pools for the guest
merchant/clergy/mercenary groups in `peoples_origins.csv`), which this
collector did not run given the token budget for this pass. Every affected
people fails the stated acceptance rule (≥10/≥10) until then.

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
