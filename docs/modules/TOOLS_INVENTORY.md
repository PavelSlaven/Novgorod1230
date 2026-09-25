# Tools inventory

REFERENCE. tools с MODULE.md — [MODULE_INDEX](../../MODULE_INDEX.md); граница tools/runtime —
[`docs/architecture/DEPENDENCY_RULES.md`](../architecture/DEPENDENCY_RULES.md) (+LW-038).
Запись в БД и operator flows — `MODULE.md` соответствующего tool
(например [tools/runtime-catalog-activation/MODULE.md](../../tools/runtime-catalog-activation/MODULE.md)).

Числа таблиц/миграций сюда не копируются — [DB_SCHEMA](../context/DB_SCHEMA.md).

## CI contract

[.github/workflows/test.yml](../../.github/workflows/test.yml) — матрица suite;
обязательные schema gates на `fast` и `integration`: `world-db:schema-check`,
`world-db:schema-doc-check`, DDL + table count (см. DB_SCHEMA / TESTING).
`test/integration/ci-workflow-contract.test.js` ловит выпадение gates.
