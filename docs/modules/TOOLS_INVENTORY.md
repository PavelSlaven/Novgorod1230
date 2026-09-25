# Tools inventory

REFERENCE. Каталоги `tools/*` — автономные CLI; production runtime их не импортирует,
кроме исключения LW-038 (`tools/world-catalog-workflow` из отдельных стадий
`packages/new-game`). Граница tools/runtime и полный список пакетов —
[MODULE_INDEX](../../MODULE_INDEX.md); запись в БД и operator flows — `MODULE.md`
соответствующего tool (например [tools/runtime-catalog-activation/MODULE.md](../../tools/runtime-catalog-activation/MODULE.md)).

Числа таблиц/миграций сюда не копируются — [DB_SCHEMA](../context/DB_SCHEMA.md).

## CI contract

[.github/workflows/test.yml](../../.github/workflows/test.yml) — матрица suite;
обязательные schema gates на `fast` и `integration`: `world-db:schema-check`,
`world-db:schema-doc-check`, DDL + table count (см. DB_SCHEMA / TESTING).
`test/integration/ci-workflow-contract.test.js` ловит выпадение gates.
