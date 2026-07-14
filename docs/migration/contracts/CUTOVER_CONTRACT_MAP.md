# Карта контрактов staged cutover

## `rus.cutover_plan.v1`

Владелец: `@rus/cutover`.

Содержит 13 ordered steps, cumulative feature flags, default/rollback routes и пять обязательных gates для каждого шага.

## `rus.cutover_step_report.v1`

Фиксирует один шаг cutover:

- step id и order;
- effective feature profile;
- smoke result;
- shadow result;
- DB dry-run result;
- diagnostics result;
- rollback result;
- итоговый pass/fail.

## `rus.cutover_report.v1`

Агрегирует все шаги и разрешает `cutover_complete` только при:

- 13 passed steps;
- 65 passed gates;
- нулевом legacy import count в modular runtime graph;
- сохранённом explicit rollback route;
- `legacy_deletion_allowed=false` до финализации.

## `rus.runtime_import_proof.v1`

Статически обходит import graph от:

- `apps/game-server/src/modular-entry.js`;
- `apps/game-web/src/main.js`.

Разрешение любого import в `legacy/` является blocking failure.

## Runtime routing contract

- default: `modular`;
- rollback: `legacy` только через явный route;
- неполная комбинация subsystem flags: typed startup failure;
- production bindings: обязательны, не угадываются кодом.

## State continuity contract

Rollback не изменяет party session. Backup/restore должен сохранять:

- game sessions;
- delivery attempts;
- opening acknowledgements;
- commit idempotency records.
