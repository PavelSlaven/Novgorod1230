# Canonical walk acoustic candidates

Approved authoring pack (`approval.json`, `APPROVE_M2C_CANONICAL_WALK_ACOUSTIC_AUTHORING_V1`, independent data approval only). Rows stay `draft` in `authoring-rows.json`; `scripts/promote-m2c-acoustic-packages.mjs` promotes them into the approved acoustic dataset. Not a production activation.

- Scope: 147 target×G6 rows: 14 Vikhtuy rows first, then 133 other canonical connection targets.
- The 195-target set comes from distinct to_canonical_g5_id values in spatial_v3_canonical_g5_connection_bindings.json, joined to approved scene profiles, scene candidates and G6 template slots. Every target resolves to one main slot.
- The 46 existing canonical target baselines are in ../approved/spatial_v3_g6_acoustic_baselines.json. The remaining 149 include two Vikhtuy start-owner rows, excluded here to avoid duplicate primary keys.
- work_storage and household_cluster use the v17 additional-start import: ../../live-world-runtime-v17/additional-start-artifacts/owner-import.mjs and its approval ../../live-world-runtime-v17/additional-start-artifacts/owner-coverage-data-approval.json. These rows are excluded from this pack.
- Each row defaults to its exact parent-G4 approved generated-family baseline. A local G5 description may override that default only with a separate rationale quoting the G5 and citing an approved analogue. Current exceptions are 13; all others retain the family value. No value 2 is assigned.

## Post-approval import path

The approved acoustic dataset is the single spatial_v3_g6_acoustic_baselines dataset in the acoustic manifest. P12 rejects duplicate dataset entries for the same table. The approved rows are merged into the normal approved dataset by `node scripts/promote-m2c-acoustic-packages.mjs`, which regenerates the manifest, capacity-v2 import and the P12 request `m2c-p12-v17-walk-acoustics-v1`. This changes the approved dataset SHA checked by owner-import.mjs; the reviewer mechanically refreshed the SHA in owner-coverage-data-approval.json. Owner rows and owner-import code stay unchanged.
