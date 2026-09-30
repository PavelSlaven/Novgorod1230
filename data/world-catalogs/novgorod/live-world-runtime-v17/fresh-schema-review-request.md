# Fresh v17 database schema review request

Review [fresh-schema-request.json](fresh-schema-request.json) at source commit
`0cd9f981dab5977181457042e522f500d852b52e`. Request SHA-256:
`e4eb53fd3d373bda402b05e7c6957122fe54aeef656dcbb87ebd5a02310abe73` (15800 bytes).
This is a pending request, not an approval or execution record.

Requested target is two **new** databases in the existing managed local-play
PostgreSQL cluster: `novgorod_world_v17` owned by `world_operator`, and
`novgorod_party_v17` owned by `party_operator`. Existing `novgorod_world` and
`novgorod_party` must remain unchanged. Independent Sol high review must verify
the exact request, source commit, all 29 world DDL parts, the world entrypoint,
the ordered 37 party migrations and chain digest
`872412c5875e37896e3633caf300bbaff884ee6f99dba6e60c5f957fa66c9d01` before any write.

The operator must confirm cluster identity, database absence, roles, and a
verified backup before creating either database. Stop if either v17 name exists.
After creation, prove each database empty before applying DDL. Apply the world
entrypoint to the new world database only: it includes `01.sql`, whose first
statement drops `world_base` with `CASCADE`. Use
`psql -X -v ON_ERROR_STOP=1 -1 -f infra/world-base/schema.sql` from the
repository root against that verified target. Apply party migrations through
`runSpatialV3TargetMigrations` against the new party database only; its owner
executes the complete ordered chain in one transaction.

Read back 222 world tables, the world-reader grants, party migration result
`applied: 37`, empty party count, and unchanged old-database row counts. Record
actual target identity, source hashes, execution results and exact readback in
an independent execution attestation. Do not treat this request or its review
as evidence that either database was created.

P12 import needs its **own** request and independent attestation after schema
readback. The old P12 request targets a different database and cannot authorize
import into `novgorod_world_v17`. No P12 import, catalog activation, runtime
selection, party migration or default startup change is in this request.
