# Independent data review request — M2c activity observation

Status: `candidate_approval_pending`; approved=false; import_authorized=false; activation_authorized=false. No approval file is present.

Review exact candidate bytes: `candidate.json` SHA-256 `69e26bcded6e56e7453c88eac54be0ab4c7da1c9cc0c22de5c4f77c12d34308f`.

Canonical record digests:

- ActivityProfile `activity_m2c_npc_fisher_initial_work_observation_v1@1`: `43891d6cea5c70bb7dbcfe071dbb89e0c053c097970885809bc695a4a2f7f076`
- Fisher binding `m2c_npc_fisher_v1@4`: `0c12eef971dfdd5f8faeb2238db0b23bd5ec4ca3b853faaed2220c750ba9d9a6`
- Canonical initial composition `m2c_g4_npc_composition_canonical_initial_novgorod_vikhtuy_work_storage_v1@2`: `ef26a77f4d30996ce45da2ea2221d9f1c4f0428db51e6e03cd948ab06f5025da`

Scope: adds only `payload.player_safe_observation = Осматривает рыболовную сеть.` to a distinct ActivityProfile. Fisher @4 derives from active Fisher @1, retaining its regional context and all non-activity fields. Composition @2 changes only Fisher ref to @4; its G4, G5, count, placement, and other profile refs remain unchanged. Existing records are not rewritten.

Independent approver should review candidate bytes and source lineage, then issue the normal approval artifact bound to the exact candidate SHA-256. Approval, import/promotion, and runtime activation are separate steps; this package performs none of them.
