# names-peoples — candidate group

Status: **candidate, not approved.** Collector: collect-names-peoples. This
group covers three domains from the brief
(`.../scratchpad/gb-retry/names-peoples.json`): `personal_names`,
`place_names`, `peoples_origins`.

All three tables are derived by deterministic scripts (`scripts/`) from
existing project sources and (as of 2026-09-26, `peoples_origins`) the
verified remote book evidence — no invented facts, no invented frequency
weights. Real gaps are listed per-domain README and are NOT filled with
guesses; closing the remaining ones needs either new sourced research
(finno-ugric name pools for водь/ижора/корела/весь/чудь/емь-сумь;
смоляне; Baltic/Scandinavian/German name pools) or an owner decision on
v6→v17 node id migration (place_names).

An earlier pass of this collector skipped the book-evidence CSVs on the
remote machine and new web research for token-budget reasons; the
2026-09-26 fixer pass (see `VERIFICATION.md` and `peoples_origins/README.md`,
section "Fixed this pass") ran the
`names-peoples.csv` remote book evidence for `peoples_origins` and used
it to source 7 previously-missing peoples rows. `personal_names` and
`place_names` still have not had that pass run against them; that
remains a flagged, real gap.

## Domains

- `personal_names/` — 54 candidate personal names (pr98 onomastics
  candidate, `status: candidate_not_approved`). Pool membership comes
  only from the candidate's own `pools` map; the rus13tpl
  `novgorod_npc_name_pools_v1.json` file is read by the build script but
  contributes nothing (see `personal_names/README.md`) — it is not
  cross-joined, and it is in any case a declared
  `forbidden_promotion_source` for this candidate.
- `place_names/` — 911 place names from the v6 naming register TSV.
- `peoples_origins/` — 23 candidate rows: 10 itinerant/guest groups from
  the costume dataset `foreigner_profiles.csv` + 6 neighbor lands from
  `novgorod_neighbor_regions_v1.json` + 7 distinct peoples (новгородцы,
  водь, ижора, корела, весь, чудь/эсты, емь/сумь) added 2026-09-26 from
  verified remote book evidence; see `peoples_origins/README.md`.

## Not done (out of scope for this collector, flagged for owner/critic)

- `critic_problems` items about universal vs. regional layering, category
  registry links, and the many M2c/M3 priority disputes in the brief are
  cross-cutting catalog decisions, not something a single-domain collector
  can fix; they need the catalog owner.
