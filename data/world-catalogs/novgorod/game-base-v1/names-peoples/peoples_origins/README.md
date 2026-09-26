# peoples_origins — candidate

Status: candidate.

## Method

`../scripts/build-peoples-origins.mjs` combines three sources:
- `game-base:data/world-catalogs/novgorod/sources/costume-dataset-v1/data/foreigner_profiles.csv`
  (10 rows, candidate) — itinerant/guest groups (merchants, clergy,
  mercenaries). `entity_kind = guest_itinerant`.
- `Одним ПРОМТОМ:data/rus13-base-staging/nov_region_audit/novgorod_neighbor_regions_v1.json`
  (6 neighbor lands, draft) — border lands, not peoples.
  `entity_kind = neighbor_land`.
- the verified remote book evidence
  (`ssh servak … data/books/evidence/names-peoples.csv`, domain
  `peoples_origins`), hardcoded in the script as `BOOK_ATTESTED_PEOPLES`
  with a `book:<book_id> §<section_path> ¶<para_no>` citation per fact —
  7 distinct `people` rows this pass added. `entity_kind = people`.

Writes `peoples_origins.csv` (23 rows).

### `entity_kind` (added this pass)

The 2026-09-26 verification flagged a category error: the table mixed
lands and peoples in one list with no way to tell them apart
(`pp_pskov_land` etc. are lands, not peoples). `entity_kind` now says
explicitly which of `guest_itinerant` / `neighbor_land` / `people` each
row is.

## Counts (from script output)

- 23 rows: 10 foreigner/guest groups (FG001–FG010, `guest_itinerant`) + 6
  neighbor lands (Pskov, Ladoga-Izhoria, Karelia, Zavolochye, Belozero,
  Vladimir-Suzdal, `neighbor_land`) + 7 book-attested peoples added this
  pass (`people`): новгородцы (`pp_novgorod_rus`), водь (`pp_vod`), ижора
  (`pp_izhora`), корела (`pp_korela`), весь (`pp_ves`), чудь/эсты
  (`pp_chud_est`, bundles эстонскую чудь и чудь заволочскую — one brief
  people, not two), емь/сумь (`pp_yem_sum`).
- `pp_novgorod_rus` is keyed to `novgorod_rus` on purpose, so that
  `personal_names.csv`'s `people_ref = novgorod_rus` now resolves to a
  real row.

## Gaps (real, per brief's people list)

The brief names: новгородцы, псковичи, суздальцы/владимирцы, смоляне,
карелы, ижора, водь, чудь/эсты, весь, емь/сумь, готландцы, немцы,
скандинавы. Coverage against that list:

| Brief people | Row in this CSV | Note |
|---|---|---|
| готландцы | `pp_fg001` | `guest_itinerant` |
| немцы | `pp_fg002` | `guest_itinerant` |
| скандинавы | `pp_fg003` | `guest_itinerant`, umbrella "варяги", not split by Norse/Swedish/Danish |
| новгородцы | `pp_novgorod_rus` | added this pass, book evidence |
| водь | `pp_vod` | added this pass, book evidence |
| ижора | `pp_izhora` | added this pass, book evidence |
| корела | `pp_korela` | added this pass, book evidence |
| весь | `pp_ves` | added this pass, book evidence |
| чудь/эсты | `pp_chud_est` | added this pass, book evidence |
| емь/сумь | `pp_yem_sum` | added this pass, book evidence |
| псковичи | `pp_pskov_land` | `neighbor_land`, not a commoner-people row |
| суздальцы/владимирцы | `pp_vladimir_suzdal_land` | `neighbor_land`, not a commoner-people row |
| **смоляне** | **none** | **still a real gap** — no row in the read-only book evidence or other sources checked this pass; not invented |

`pp_karelian_land` and `pp_ladoga_izhoria_land` remain `neighbor_land`
rows (route/trade-basis for that direction of travel), separate from the
`people` rows `pp_korela` and `pp_izhora` above — a land and the people
who live there are not the same row.

**Смоляне is the one brief people this pass could not source** — closing
it needs new sourced research (real gap, not invented).

Every `guest_itinerant`/`neighbor_land` row still has `clothing_profile_ref`
and `name_pool_ref` either pointing at the source-profile id or
`unassigned` (per the acceptance rule's gap flag); the 7 new `people` rows
are `unassigned` on all three of `clothing_profile_ref` /
`name_pool_ref` / `legal_status_ref` too — filling those needs a
clothing/name-pool pass this collector did not run. `presence_note` /
`typical_occupations` carry qualitative, cited basis, never a numeric
weight — no invented frequency numbers were added, per the "no invented
numbers" rule; a real `presence[pf_id, season, frequency_class]` table
needs `place_family` weights that do not yet exist for these peoples.

## Fixed this pass (2026-09-26, see `../VERIFICATION.md`)

- `A–B` was not a valid `confidence` value (2 rows, `pp_fg005`/`pp_fg008`
  in the source costume CSV). The build script now normalizes any
  `A–B`-style combined grade to the lower grade (`B`) instead of copying
  it verbatim.
- `pf_ids` held costume group ids (`FG001`…), not place_family ids — a
  wrong reference, not a missing one. It is now left empty for every row
  (the group id already lives in `clothing_profile_ref`); no place_family
  ids exist yet to put there for real.
- The costume source's own `source_ids` (`SRC013`, `SRC035`, …) are now
  carried into `source_refs` for the 10 `guest_itinerant` rows.
- 6 of 7 brief-named peoples missing a row (новгородцы, водь, ижора,
  корела, весь, чудь/эсты, емь/сумь — see table above) are now present as
  `people` rows sourced from the verified remote book evidence. Смоляне
  remains an open gap (no source found).

## Sources

- `game-base:data/world-catalogs/novgorod/sources/costume-dataset-v1/data/foreigner_profiles.csv`
- `Одним ПРОМТОМ:data/rus13-base-staging/nov_region_audit/novgorod_neighbor_regions_v1.json`
- remote book evidence: `ssh servak "cat /srv/novgorod-work/data/books/evidence/names-peoples.csv"`,
  domain `peoples_origins`; each `people` row cites the exact `book:<id> §<section_path> ¶<para_no>`
  entries it draws on in its own `source_refs` cell.
