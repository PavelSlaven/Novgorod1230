# Gate1 import into the fresh v17 world database — approval request

Status: **blocked pending P12 coexistence review, then independent high approval**. This request does not authorize a database write or production activation.

## Exact subject

- Destination: PostgreSQL `current_database() = novgorod_world_v17`, supplied through `PR17_TEST_DATABASE_URL`. The Stage 3c runner requires `--mode local-play --expected-database novgorod_world_v17` and rejects every other actual database name for this request.
- Operation: run `scripts/run-pr17-item-container-stage3c.mjs` in `local-play` mode once against the fresh v17 world database, after the approved P12 target import and its readback. Do not use `fixture-bootstrap` on this database.
- Scope: import the existing approved Gate1 item/container catalog and its canonical owner closure without activation or rematerialization. Preserve the P12 target Spatial rows and all existing party state.
- Prior approval chain: `authoring-approval-attestation.json`, `source-record-reconciliation-v1/authoring-approval-attestation.json`, `seed-closure-v1/authoring-approval-attestation.json`, and `docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json`. No new authoring approval is asserted here.

## Immutable values to review

| Field | Expected value |
|---|---|
| `promotion_manifest_digest` | `2818932121b2b65baf3611bb33c15b8bb996bbd52dfa650fb0ff9f2984ce0293` |
| `target_revision_id` | `world_revision_novgorod_1230_item_container_approved_001` |
| `target_catalog_digest` | `1d5fd4cd3c7dd9946d68276011cd3264e6e2ccd12f67486171928e18b56451f5` |
| Approved item templates | 102 |
| Approved container templates | 18 |
| Approved G4 mappings | 9 |

These values match `import-readback-result.json` in this directory. The `dry-run` plan reports 39 datasets, nine status transitions, `activation_performed: false`, and `existing_parties_rematerialized: false`.

## Required independent review before execution

1. Read the live v17 database identity and P12 import readback. Confirm the database is the intended fresh target and P12 target data is present. Record the exact connection identity and P12 evidence without credentials.
2. Resolve the P12 coexistence blocker before approval. P12 dependency closure imports 12 rows into `world_base.source_records`. Gate1 seed closure expects 183 rows and hashes the **entire** table after seed import. Therefore `assertGate1SeedClosure` would reject a P12-first database with `GATE1_SEED_TABLE_PAYLOAD_MISMATCH:source_records`, even when the 12 P12 rows do not collide by ID. This approved closure cannot simply be relaxed in this request; obtain the correct reviewed import sequence or an approved coexistence amendment.
3. Review the runner's `buildGate1ImportPlan`, `importGate1OwnerData`, and transaction path against the P12 target data. The `compatibleRows` loop reads v2–v6 `world_revisions.json` and inserts those rows only into `world_base.world_revisions`; it does not import v2–v6 Spatial node, edge, or route datasets. Review the canonical seed import separately for overlap with the P12 target rows.
4. Confirm the exact plan digests and counts above against the approved Gate1 readback, and that no active runtime catalog pin, party, or historical catalog bytes will be changed.
5. Approve or reject this **exact** database, plan, and operation in a separate high review. Approval must precede the `local-play` database write. Then capture the actual v17 import readback and check the same values, rollback/repeat results, and absence of activation.

No v16 activation is requested. A predecessor activation is needed only if the later successor activation contract explicitly requires it.
