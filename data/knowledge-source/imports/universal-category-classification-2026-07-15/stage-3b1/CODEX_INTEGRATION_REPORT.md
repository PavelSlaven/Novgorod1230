# Stage 3B-1 — integration report

## Bundle boundary

`bundle/manifest.json` is a separate supplemental manifest. It is `draft`, has `deletion_policy = none`, names only registered authoring tables and contains real SHA-256 digests of canonical JSON arrays. It does not alter `rus13-base-v1.tar.gz`, does not import party tables and cannot make runtime candidates.

## Текущее техническое состояние

- 120 stable template IDs: 102 `item_templates`, 18 `container_templates`;
- one draft object/form category per template; item templates additionally have exactly one draft primary-function binding;
- draft region options use neutral technical weight and explicitly do not claim commonness;
- specialized sheath, scabbard, quiver and needle-case content profiles are explicit; general containers do not infer liquid/hot/sharp/bulky compatibility;
- migration inventory is intentionally empty: canonical tracked legacy rows are zero;
- supplemental dry-run passed for all 25 datasets; 12 bulk templates have draft normalized mass quantity profiles with an explicit `g` unit and no materializer default; 15 FK-normalized `item_template_source_bindings` derive their external IDs only after `stage3b1-parent-source-bundle.mjs` verifies the registered parent archive and its `source_records_unified_v1.csv` digest. Each is `draft/needs_review` and supports only `historical_presence`; 105 templates remain explicitly blocked for individual evidence. PostgreSQL 16 rerun and final code critic both passed.

## Отложенные promotion и runtime activation

The supplemental validator is authoring validation only. PostgreSQL 16 apply/readback/digest/rollback/repeat apply now passes against the current 121-table contract in a disposable database, including template-source revision guards. `PROMOTION_READINESS_REPORT.md` records `0` ready templates and `120` source-blocked templates; `ACTIVATION_PROPOSAL.md` is deliberately non-executable and proposes `0` approved records. Promotion and runtime loading remain blocked by individual historical evidence for 105 templates, review of the 15 draft bindings, quantity-profile review, material review and editorial approval. No record in this bundle is `approved`; no world revision is activated.
