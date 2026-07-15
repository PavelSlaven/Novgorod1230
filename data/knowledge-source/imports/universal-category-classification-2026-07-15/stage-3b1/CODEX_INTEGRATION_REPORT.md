# Stage 3B-1 — integration report

## Bundle boundary

`bundle/manifest.json` is a separate supplemental manifest. It is `draft`, has `deletion_policy = none`, names only registered authoring tables and contains real SHA-256 digests of canonical JSON arrays. It does not alter `rus13-base-v1.tar.gz`, does not import party tables and cannot make runtime candidates.

## Текущее техническое состояние

- 120 stable template IDs: 102 `item_templates`, 18 `container_templates`;
- one draft object/form category per template; item templates additionally have exactly one draft primary-function binding;
- draft region options use neutral technical weight and explicitly do not claim commonness;
- specialized sheath, scabbard, quiver and needle-case content profiles are explicit; general containers do not infer liquid/hot/sharp/bulky compatibility;
- migration inventory is intentionally empty: canonical tracked legacy rows are zero;
- supplemental dry-run passed for all 20 datasets; code critic result is `PASS WITH NOTES`.

## Отложенные promotion и runtime activation

The supplemental validator is authoring validation only. PostgreSQL apply/readback/rollback is not yet run because the local compose contract requires an unavailable `POSTGRES_PASSWORD`; the next step must use disposable PostgreSQL 16 credentials in CI. Promotion and runtime loading remain blocked further by individual historical source records, quantity-unit model, material review and a reviewed import adapter. No record in this bundle is `approved`; no world revision is activated.
