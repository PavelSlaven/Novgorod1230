# Stage 3C readiness and legacy migration

## Current state

The actual operator PostgreSQL/NocoDB database was not accessible from this execution environment. `LEGACY_SOURCE_STATUS.json` therefore records `verified=false`, keeps row counts as `null` and explicitly forbids interpreting the empty GitHub bundle as proof that no local legacy rows exist.

The deterministic result is:

- 120 templates in scope: 102 items and 18 containers;
- 0 fully ready;
- all 120 blocked by source review;
- all 120 blocked by physical/quantity/container parameters;
- all 120 blocked by profiles, rules or permissions;
- all 120 blocked by the unverified legacy source;
- 0 ready for editorial approval;
- no review or approval status transitions;
- no promotion and no activation.

## Operator export

Run against the actual PostgreSQL database used by NocoDB or the project:

```bash
DATABASE_URL='postgresql://...' node scripts/export-legacy-item-classification-inventory.mjs \
  --source-kind nocodb_postgresql_backend \
  --out data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3c/readiness/LEGACY_INVENTORY_EXPORT.json
```

The exporter reads only columns that physically exist. Every non-empty legacy field receives exactly one status:

- `mapped` — one reviewed mapping to an approved category;
- `data_gap` — a required classification field has no reviewed mapping;
- `migration_conflict` — stale, duplicate, invalid or non-approved mapping;
- `deferred` — an optional legacy field is preserved without an inferred mapping.

## Required integration order

1. Export from the actual operator database.
2. Review every exported row and resolve all required `data_gap` and `migration_conflict` rows.
3. Complete source evidence, parameters, regional permissions, profiles and G4 rules for all 120 templates.
4. Regenerate the deterministic readiness report.
5. Record explicit human evidence-review attestation for the complete cohort.
6. Record explicit `approve_all_120` attestation bound to the readiness digest.
7. Run strict all-template promotion with transactional readback and rollback.
8. Request activation separately. Existing party revision pins must not be changed automatically.
