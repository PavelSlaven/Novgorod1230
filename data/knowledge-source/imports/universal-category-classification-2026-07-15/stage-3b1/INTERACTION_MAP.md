# Stage 3B-1 — карта взаимодействий

**Статус:** `draft_authoring_only`; не является runtime pipeline.

## Контур данных

```text
editorial catalog + source register + reviewed/gap decisions
        │
        ▼
scripts/generate-stage-3b1-bundle.mjs
        │ canonical JSON datasets + manifest/digests
        ▼
Stage 3B-1 CLI loads manifest/datasets
        ├───────────────────┐
        ▼                   ▼
stage3b1-parent-source-bundle.mjs   @rus/world-catalog-workflow
        │ verifies registered parent archive + source CSV digest
        │ declared external source IDs
        └───────────────► validateSupplementalCatalogBundle
        │ JSON Schema + table registry + FK/XOR/order/status checks
        ├── failure → typed authoring error; no import, no repair
        ▼
Stage 3B-1 dry-run
        │ no writes; records/counts only
        ▼
explicit disposable-DB adapter (optional integration check)
        │ begin → ordered insert → readback count/digest → commit | rollback
        ▼
promotion readiness report
        │ 0/120 ready; hard blocks retained
        ▼
non-executable activation proposal
        └── no revision activation, no runtime candidate set, no party write
```

## Последующий Stage 3C promotion gate

```text
verified operator PostgreSQL/NocoDB export
        + all-120 source/parameter/profile/rule closure
        ▼
buildLegacyClassificationInventory + buildCatalogEditorialReadinessReport
        ├── any source/parameter/profile/rule/legacy gap → typed blocked report
        ▼
human review attestation + approve_all_120 attestation bound to report digest
        ▼
buildAllTemplateRevisionPromotionPlan
        ├── partial cohort, stale digest or unresolved legacy row → hard block
        ▼
buildRevisionPromotionPlan → disposable/approved transaction adapter
        │ insert → readback → parent-unchanged check → commit | rollback
        ▼
approved but inactive revision
        └── activation remains a separate explicit operation; party pins unchanged
```

## Владение данными и контрактами

| Артефакт/операция | Владелец | Вход | Выход | Может изменить состояние | Hard block |
|---|---|---|---|---|---|
| Editorial catalog and source decisions | редакторский процесс | historical source/review evidence | draft source/template proposals or explicit gap | только versioned authoring files | missing/ambiguous evidence |
| Bundle generator | `scripts/generate-stage-3b1-bundle.mjs` | editorial catalog + fixed rules | 25 JSON datasets, manifest, derived reports | только generated Stage 3B-1 files | invalid source/category/template input |
| Parent-source verifier | `stage3b1-parent-source-bundle.mjs` | referenced external IDs | frozen verified parent rows | нет | `PARENT_SOURCE_*` digest/path/record error |
| Supplemental validator | `@rus/world-catalog-workflow` | manifest, local datasets, declared external IDs | immutable typed errors | нет | unknown table/schema, digest, FK, XOR, order, party table |
| Dry-run CLI | `run-stage-3b1-supplemental-importer.mjs` | validated bundle | counts only | нет | any validator error |
| PostgreSQL integration adapter | `run-stage-3b1-supplemental-postgres.mjs` | validated plan + disposable DB | transactional readback result | disposable DB only | adapter/readback failure → rollback |
| Readiness/proposal reports | generator | draft datasets and explicit gaps | status evidence | only Markdown artifacts | no inferred approval |
| Runtime candidate loader / Stage 8/16 | runtime packages | approved, active, applicable catalog only | candidates/instances | party state only after separate pipeline gates | draft bundle is excluded |
| Stage 3C readiness | `@rus/world-catalog-workflow` | verified legacy export + all 120 dependencies | digest-bound readiness report | нет | any individual template blocker |
| Stage 3C promotion | `@rus/world-catalog-workflow` + injected adapter | complete readiness + human attestation | blocked/ready promotion plan and transaction audit | only explicitly approved target revision | partial cohort, bad closure/readback or implicit activation |

## Границы с runtime, LLM и party state

- `world_base` remains read-only to runtime; the supplemental bundle is not production-imported.
- Stage 8/16 consume approved runtime data, not this manifest. A draft category, external mapping or source binding cannot grant regional permission, materialization rule or candidate eligibility.
- No LLM participates in generation, validation, import, readiness or activation of this bundle. It cannot repair a missing source/category/profile/rule.
- Existing party instances are not read, written, migrated or rematerialized by any Stage 3B-1 component.
- Stage 3C may create only a new approved-but-inactive revision through an explicit adapter; it still cannot activate it or alter existing party revision pins.

## Error and repair policy

There is no semantic repair path. Structural authoring mistakes may be corrected by the editor and revalidated against the unchanged approved input. Missing evidence, material review, physical review, compatibility review and legacy export are data gaps; they remain explicit hard blocks until a later reviewed stage supplies evidence.

## Связанные реестры

- [MODULE.md](../../../../../tools/world-catalog-workflow/MODULE.md) — ownership and public boundary;
- [CONTRACTS.md](../../../../../tools/world-catalog-workflow/CONTRACTS.md) — public interfaces, inputs, outputs and errors;
- [TARGET_TABLE_COVERAGE.md](TARGET_TABLE_COVERAGE.md) — DDL/schema/importer/readiness coverage;
- [DATA_GAPS.md](DATA_GAPS.md) — unresolved data gates;
- [PROMOTION_READINESS_REPORT.md](PROMOTION_READINESS_REPORT.md) — derived current readiness;
- [ACTIVATION_PROPOSAL.md](ACTIVATION_PROPOSAL.md) — explicit no-activation decision.
- [../stage-3c/README.md](../stage-3c/README.md) — promotion scope and operator order;
- [../stage-3c/readiness/README.md](../stage-3c/readiness/README.md) — verified legacy export and all-120 editorial gate.
