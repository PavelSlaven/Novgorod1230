# Stage 3B-1 — PostgreSQL integration report

## Scope

The supplemental authoring bundle was tested only in a disposable PostgreSQL 16 compose project. It did not use production credentials, production volumes or a runtime database.

## Result

| Gate | Result |
|---|---|
| PostgreSQL | 16 |
| world_base DDL | PASS, 117 tables |
| manifest | `novgorod_1230_item_catalogue_draft_001` |
| apply | PASS, 20 datasets |
| readback count/digest audit | PASS |
| rollback probe | PASS; zero residual source record |
| repeated apply | PASS; `ON CONFLICT (id) DO NOTHING` plus digest audit |
| activation | PASS: draft revision remained draft |

The temporary compose project used port 65432 and an explicit disposable password. Its container and volume were removed after the run.

## Command

```text
DATABASE_URL=postgresql://…/stage3b1_ci npm run world-db:import:stage3b1:integration
```

The CI workflow runs the same command against its existing PostgreSQL 16 service after the full DDL step and before the full suite.

## Remaining boundary

This proves the supplemental lifecycle, not promotion. Historical source evidence, material and physical review, bulk quantity semantics, compatibility, legacy migration and editorial approval still block promotion and runtime activation.
