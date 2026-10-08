# M2c P12 live schema review request

Review [request.json](request.json) from source HEAD `ba3e2af1874dd0f35e17ae6990efa66af68f19e5`. Its SHA-256 is `2a22c66415ba87c5eba8ee313187a8e6d010635f7e0cdef6b18f5858e8d09ea9`. This requests an independent high review of one DDL transaction on the owner-designated persistent local-play `world_base` database, treated as pre-beta production. The verified offline PostgreSQL backup is at `%LOCALAPPDATA%\Novgorod1230\backup-m2c-before-v17-20260924\postgres-16.14.0-utf8` (3,369 files; 388,999,846 bytes). The operator must verify its availability and target identity again before any write. PostgreSQL is stopped while this request is prepared.

Apply only ordered `infra/world-base/schema/22.sql` through `26.sql`. `schema.sql` includes these parts but is not the apply command for this already-initialized database. Reproduce the five file hashes and the exact SQL: ASCII `BEGIN;\n`, raw file bytes in numeric order with no separator, ASCII `COMMIT;\n`. Every part already ends in LF. Expected **14,971 bytes**, SHA-256 `cdfdf1e0c18f15fd261a7925284a3e8671a19a26b62ea872c4246d31a8d54f78`. Generate a temporary file outside the repository. Fail on any mismatch.

Before execution, read the designated database identity and baseline schema. The six requested tables, five explicit indexes, four named constraints, function and trigger in `request.json` must be absent; `world_base.spatial_v3_canonical_g5_connection_profiles.availability_condition_set_ref` must be `NOT NULL`. Existing dependencies from schema parts 01–21 must be present. Parts 22–25 use `IF NOT EXISTS` or guarded creation for their tables, indexes and foreign keys; part 25 replaces a function and trigger. Part 26 drops `NOT NULL`, then adds `spatial_v3_route_profile_requires_availability` **without `IF NOT EXISTS`**. Treat the combined DDL as a one-shot transition; a repeated run is an error, not an idempotent operation.

After independent approval, operator strategy from repository root (connection selected through existing PostgreSQL environment/service configuration, never printed):

```powershell
$sqlPath = Join-Path $env:TEMP 'novgorod-m2c-p12-live-schema.sql'
@'
import hashlib, pathlib, sys
parts = [pathlib.Path(f'infra/world-base/schema/{n:02}.sql') for n in range(22, 27)]
expected = [
    '6c58a6e3167581c8fddc135c719b2c8d1cd9ae4b5644087744f2ecba313e6acc',
    '6662724cbb979fd61dfee829ddf186839c81601870aef068e023087a9f940f46',
    '97bb116691658bf448d77b1459e14356be64384ab9a8e94ec53428db2dc2c225',
    '6cb1335cad47efe02cc9544881d3397b4a8d40b04ec11f16b797ac83ffbf8253',
    '9ba49fee1b39831b0df2d67a4ea65919b8462dd536262090fb7eea74e6bac29b',
]
raw = [part.read_bytes() for part in parts]
assert all(hashlib.sha256(data).hexdigest() == pin for data, pin in zip(raw, expected))
sql = b'BEGIN;\n' + b''.join(raw) + b'COMMIT;\n'
assert len(sql) == 14971
assert hashlib.sha256(sql).hexdigest() == 'cdfdf1e0c18f15fd261a7925284a3e8671a19a26b62ea872c4246d31a8d54f78'
pathlib.Path(sys.argv[1]).write_bytes(sql)
'@ | py -3 - $sqlPath
if ($LASTEXITCODE -ne 0) { throw 'DDL generation or digest failed' }
psql -X -v ON_ERROR_STOP=1 -f $sqlPath
if ($LASTEXITCODE -ne 0) { throw 'DDL transaction failed' }
```

Use the operator's verified connection selection; do not put a database URL or password in this request, command log or process arguments. `psql -X` avoids user startup commands; `ON_ERROR_STOP` stops on SQL error. The explicit `BEGIN`/`COMMIT` makes all five files one atomic transaction. An approved rollback rehearsal can use a separate temporary copy with only final `COMMIT;\n` changed to `ROLLBACK;\n`, then verify baseline readback; never mistake its different digest for the approved apply SQL.

Read back the exact table, index, constraint, function, trigger and column properties listed in `request.json` from `pg_catalog`/`information_schema`. Verify the route-profile check definition as `profile_scope = 'site_connection' OR availability_condition_set_ref IS NOT NULL`, and no world-base data row changes. Record actual readback and database identity in the independent execution attestation. This request does not authorize P12 data import, runtime/release selection, party migration or activation. Existing insert-only P12 attestation does not approve this DDL.
