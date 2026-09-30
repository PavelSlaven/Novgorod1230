# m2c-lines-v1 — line fields of the local G5–G5 connections (candidate)

**Status: candidate, not approved, not imported.** Phase (а) of PLAN-rt-lines-a (Spatial 4.7.0 lines, LW-097). No world_base DDL
for the new tables exists yet and no import manifest is produced: they come with phases a3/a4 and only after the Opus data pass.

`node tools/spatial-v3/build-line-wave.mjs [--line-names <path>] [--slice-step-minutes <n>] [--check]` writes `datasets/` and
`generator-report.json` from: the active binding@2 (`../m2c-g4-expansion-v1`), the approved place-geo minutes
(`../../../m2c-place-coordinates/derived-report.json`), the Opus-approved line-names candidate
(`../../../m2c-line-names/candidate.json`, sha `ffea92ed…`, see its `approval-attestation.json`) and the authored `line-kind-spec.json`.

- binding@3 × 454 (227 pairs): `line_kind_profile`, `line_name`, `base_minutes` (place-geo `proposed_minutes`, D1), reverse slots swapped
  (paired-slot rule), `availability_condition_set_ref` null (D3), no direction/discriminator/toponym.
- `line_kind_profile` @1 for the 8 kinds, `line_kind_alternative_method` (swim for the three water kinds), cost profiles `cost.line_*`
  (method and options, no minutes: D8), `env.open_water`.
- D56: there is no length ceiling. The 14 lines of 31–48 minutes are in the wave; a line longer than the slice step (`max_segment_minutes`
  of the profile, parameter, default 30) must have a recheck policy that slices it (the validator checks `fixed_time_interval` and
  `fixed_progress_slices`); the existing policies of the kinds (15 / 30 minutes) do. `long_lines` in the report lists them.
  Editorial values (swim factors), assumptions and open items are in the report for the Opus pass.

Tests: `tools/spatial-v3/test/build-line-wave.test.js` (includes the regeneration check).
