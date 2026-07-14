# Stage 24: Party DB Write Plan

## Назначение

Формирует и проверяет утверждённый логический план первоначальной записи партии. Стадия не выполняет SQL и не изменяет базу данных.

## Делает

- связывает утверждённые артефакты Stages 3–23 с manifest и digest;
- проверяет неизменяемую write policy;
- формирует code precheck;
- кодом строит неизменяемый план только для нормализованных таблиц `party_runtime_v2`;
- вызывает LLM только для аудита плана и ремонта формата audit envelope;
- проверяет таблицы, поля, операции, ссылки, порядок batch, rollback, source trace и hidden/public boundary;
- возвращает утверждённый `stage24_party_db_write_plan_result` для Stage 25.

## Не делает

- не исполняет SQL;
- не подключается к party DB или world_base;
- не создаёт мировые сущности и ID;
- не передаёт LLM создание или смысловой ремонт write plan;
- не разрешает commit или показ игроку без Stage 25.

## Публичный API

Основной API: `@rus/new-game/stages/stage-24`.
Совместимость: `@rus/new-game/stages/stage-24/compat`.

## Разрешённые зависимости

- `@rus/contracts`
- `@rus/kernel` транзитивно через contracts
- внутренние файлы Stage 24

## Запрещённые зависимости

- legacy
- реализации Stages 23 и 25
- provider SDK
- PostgreSQL client
- UI/server

## Инварианты

- все upstream audit approvals должны пройти;
- план связан digest с input, schema snapshot, world snapshot и manifest;
- world_base mutation запрещена;
- transaction должна быть atomic и dry-run-first;
- rollback покрывает все batch;
- hidden-only данные не попадают в player-facing таблицы;
- builder требует полный набор version pins и сохраняет materialization run/choices/trace;
- Stage 25 отклоняет v1 и любые physical targets вне `party_runtime_v2`.
