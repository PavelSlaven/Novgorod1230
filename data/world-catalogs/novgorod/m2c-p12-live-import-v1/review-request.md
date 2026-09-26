# M2c P12 live import review request

Review [request.json](request.json) against reviewed HEAD `eed7f0f4acc24cfa65e146a1b70013a278652d89` and request digest `d1590cf151765edc518567542f9f5a31edabfd652abfd365fe2c364338d5159c`. This is a request for one insert-only import into the owner-designated persistent local-play `world_base` database, treated as pre-beta production. No database write or activation has occurred under this request. The offline backup is owner-reported; the operator must verify it before execution.

Independent high review must bind the exact request digest, all five manifest and approval SHA-256 pins, the importer SHA-256, and the generated SQL SHA-256. Reject drift, incomplete P12 validation, cross-bundle primary-key conflicts, existing-row mismatch, or any SQL statement mutating approved `world_base` rows. The five ordered bundles are expansion, mapped NPC, canonical NPC, acoustic, then local movement. Their distinct temporary-table prefixes prevent collisions inside the one transaction.

Generate each SQL part with `buildTransactionalImportSql({ manifestPath, wrapTransaction: false, allowTypedGaps: false, temporaryTablePrefix })` from the pinned importer. Concatenate UTF-8 `BEGIN;\n`, the five returned strings in request order, and `COMMIT;\n`, with no other bytes. Expected output: **109,935,306 bytes**, SHA-256 `bfa0b6960fcf545a1ae637c3043f5c15e48f8b94b772a445108abb821974ba48`. Generate into a temporary file at execution time; no SQL artifact is committed.

The SQL digest was computed from reviewed HEAD, including committed `infra/world-base/schema/26.sql` and generated schema reference. The request pins the effective DDL digest. Independent review must reproduce the exact SQL digest before execution.

After independent approval, use the exact SQL with only the final `COMMIT;` replaced by `ROLLBACK;` for a dry run on the designated database. Verify rollback and no errors. Then regenerate and rehash the original SQL, execute its single transaction, and read back every pinned primary key and row. Expected manifest-scoped result: **12,359 distinct rows across 53 tables**, with per-table counts in `request.json`; unrelated existing rows are outside these counts. Record before/after evidence for existing rows, exact row equality and any failed statement. No runtime release, composition, party migration or activation is requested.

Approval and execution attestations belong to independent reviewers/operators. This document does not grant either authority.
