# M2c world routes v1 candidate

Draft data candidate for `cross_g4_01..24`: 24 reciprocal pairs, 48 directed routes, 60 physical segments, 108 route points, and 96 endpoint bindings. `route-spec.json` records the source trace groups, segment boundaries, labels, minute allocation, and source hashes. Generated table rows and `import-manifest.json` are candidates only.

Inputs: place-geo route traces and proposed minutes, `m2c-line-names/candidate.json`, the approved wave-1 line profiles, and the existing G4 expansion authoring rows. No runtime, DDL, canonical bindings, or active bootstrap inputs are changed. Import only together with the b2 runtime reader cutover; no bootstrap import.

## Review assumptions and limits

- `central_head_branch` in pairs 06–08 and 23 uses `lkp__side_channel@1` under reviewer decision `A-routes-b2-01` and wave-1 approval-attestation limit 7. This is an editorial hypothesis for independent Opus review. Existing line-names still labels 04–08 as `river_channel`; its owner must reconcile that mismatch separately.
- Other non-main authored waterbody references map to `side_channel`. Trace `waterbody_ref` changes define route points with provenance, but those schematic transitions are not evidence of exact historical river boundaries near 1230. Internal points have no invented toponyms.
- Direction totals equal place-geo `proposed_minutes`; multi-segment totals use largest-remainder allocation over unrounded trace-duration weights. These are draft calibration values, not measured historical durations. `cross_g4_10` at 741 minutes each way needs explicit plausibility review.
- Chord fallbacks are used where place-geo has no trace: pairs 11, 15, 18, 19, and 20. No bend-only or travel-band-only route points are added.
- Movement IDs are translated through the existing D5 `movement_method_map` in `m2c-lines-v1/line-kind-spec.json`. Wave-1 profiles are reused; `line.offroad` has candidate `lkp__offroad@1` and `cost.line_offroad@1`.
- `hazard.swim_*` references lack supporting records; swim availability and safety remain unresolved. Water routes have no winter ice data. Candidate import and runtime activation remain unauthorized.

The P12 manifest is `draft`, uses `delete_policy: forbid`, and has no bootstrap stage. The author has not approved these data; separate independent Opus approval and the b2 runtime cutover are required.
