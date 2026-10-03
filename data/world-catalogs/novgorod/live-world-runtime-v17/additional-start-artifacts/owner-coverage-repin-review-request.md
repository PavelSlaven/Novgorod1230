# Owner coverage repin (approved acoustic baselines merged with canonical-walk): mechanical re-approval request

Independent reviewer: confirm a mechanical re-approval, not a new data approval. This request grants no import and no activation.

`owner-import.mjs` asserts that the SHA-256 of `m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json` equals `owner-coverage-data-approval.json` → `reviewed_source_sha256.m2c_acoustic_approved_baselines`. Merging the approved `canonical-walk` package (147 rows) into that file changes its bytes:

- old SHA-256: `9d7f7a482fd4709813f1930e0abdd3fb029735c16e401566fb323a40f865be01` (71 rows)
- new SHA-256: `8056b3816f512ce1e8c516fea7026942cce60e9e81fb148b14ade67c6e89d91d` (218 rows)

Evidence that the start rows are unchanged:

- None of the six start canonical G5 ids is a `canonical-walk` row; the four `exact_approved` starts keep their approved rows; `work_storage` and `household_cluster` still have no row in the approved file. `owner-coverage.mjs --check` passes on the new file, so `owner-coverage-candidate-v1.json` (SHA-256 `16f9f3479c2fddb2d8af6dfbf18fbb6bb00603ad36afa8146c97e4a0310078f2`) is unchanged.
- `buildAdditionalStartOwnerRows()` output (6 NPC, 4 acoustic, 10 authoring rows) is byte-identical when run on the tree before the merge (commit `86d87dae`) and after the merge with the new SHA (the check temporarily substituted the new SHA in the approval file and restored it right after; `git status` shows the approval file unchanged).
- `semantic_npc_approval`, `semantic_acoustic_approval`, scope and limitations stay as approved.

Approval action (reviewer only): replace the old SHA with the new one on the single `m2c_acoustic_approved_baselines` line of `owner-coverage-data-approval.json`. Until then `owner-import.mjs` fails closed with an SHA mismatch, so a fresh v17 bootstrap cannot run on this branch.
