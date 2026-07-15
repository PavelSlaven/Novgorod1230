# Stage 3B-1 — PostgreSQL integration report

## Scope

The supplemental authoring bundle was tested only in a disposable PostgreSQL 16 compose project. It did not use production credentials, production volumes or a runtime database.

## Result

| Gate | Result |
|---|---|
| PostgreSQL | 16 |
| world_base DDL | PASS, 119 tables |
| manifest | `novgorod_1230_item_catalogue_draft_001` |
| apply | PASS, 23 datasets, including 1 quantity unit and 12 item quantity profiles |
| readback count/digest audit | PASS |
| rollback probe | PASS; zero residual source record |
| repeated apply | PASS; `ON CONFLICT (id) DO NOTHING` plus digest audit |
| quantity unit/dimension DB guard | PASS; mismatched `volume` profile against mass `g` unit rejected with no residual row |
| referenced unit mutation DB guard | PASS; changing referenced unit dimension rejected with no residual change |
| activation | PASS: draft revision remained draft |

The latest run was executed on 2026-07-15 in a fresh disposable compose project on port 65433 with explicit disposable credentials. Before inserting FK prerequisites, the integration script verifies the registered parent archive and source CSV digests, then inserts the exact referenced parent source-record fields into the disposable database only. Its container and volume were removed after the run.

## Command

```text
DATABASE_URL=postgresql://…/stage3b1_ci npm run world-db:import:stage3b1:integration
```

The CI workflow runs the same command against its existing PostgreSQL 16 service after the full DDL step and before the full suite.

## Remaining boundary

This proves the supplemental lifecycle, not promotion. Historical source evidence, material and physical review, quantity-profile editorial review, compatibility, legacy migration and editorial approval still block promotion and runtime activation.
