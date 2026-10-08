# M2c P12 live schema review request v2

Review [request.json](request.json) and [exact-apply.sql](exact-apply.sql) together. The request pins source HEAD `02e0c40850d9fb68ee0f446a8f95f0c88d0cc069`. Request SHA-256: `56d47d8439640efc0013d86f94272c55e2f3bb18e6cf934d680af647ad9e8613`. Exact SQL: 15,908 bytes, SHA-256 `9eda7de0c5600c8d168eb04c4467df4b49fa67e8d616359b35f1935ff545e46e`.

The designated persistent local-play `world_base` is treated as pre-beta production. The previous v1 request and approval cover only parts 22–26. They do not authorize this corrected v2 transaction. **No database write is authorized by this request.** Obtain independent high review and approval of the exact v2 digest before execution.

Read-only inventory found parts 18–20 complete and part 21 applied only through line 259. The missing official tail is `infra/world-base/schema/21.sql` lines 260–282: the procedural-scene compiled-record table and complete `GRANT SELECT` statement. Parts 22–26 are absent. The transaction contains ASCII `BEGIN;\n`, raw official part-21 tail bytes, raw full part-22 through part-26 bytes in order, then ASCII `COMMIT;\n`, with no separators. Do not rerun full part 21: its earlier constraint triggers already exist and are not guarded for replay.

Before execution, reconfirm database identity and verified offline backup at `%LOCALAPPDATA%\Novgorod1230\backup-m2c-before-v17-20260924\postgres-16.14.0-utf8`; prior verification reported 3,369 files and 388,999,846 bytes. Recheck every precondition in `request.json`, including zero expansion-profile rows, no duplicate node-parent exact edges, absence of all requested objects, and no row that violates the part-26 check. Fail closed on any discrepancy. Verify source and SQL hashes. Use operator-selected connection settings without printing secrets. Only after new approval, execute `psql -X -v ON_ERROR_STOP=1 -f <verified-exact-apply.sql>` once. The explicit transaction is atomic; an error requires investigation, not replay.

Read back the seven tables, five explicit indexes, four named constraints, function, trigger, `world_reader` SELECT grant, and route-profile column nullability in `request.json` from `pg_catalog`. Verify the route-profile check is `profile_scope = 'site_connection' OR availability_condition_set_ref IS NOT NULL`. Confirm no world-base data rows changed. Record actual target identity, SQL digest, readback, and unchanged row counts in an independent execution attestation.

This request excludes P12 data import, runtime or release selection, party migration, and activation.
