# План фазы: доменные модули

Дата: 2026-07-12  
Целевой релиз: `0.13.0-migration.13`  
Исходный релиз: `0.12.0-migration.12`

## Основание

New-game Stages 2–26 и общий orchestrator уже модульны. Следующая последовательная фаза нормативного плана — выделение владельцев доменных правил. Код не создаёт смысловые сущности: доменные модули принимают уже утверждённые данные, проверяют инварианты и применяют зафиксированные формулы.

## Цель

Создать десять независимых production-пакетов без доступа к БД, UI, LLM transport и legacy runtime:

1. `@rus/actors`;
2. `@rus/body-state`;
3. `@rus/items-property`;
4. `@rus/space-map`;
5. `@rus/movement-routes`;
6. `@rus/time-events-history`;
7. `@rus/checks-rng`;
8. `@rus/combat-health`;
9. `@rus/social-law`;
10. `@rus/visibility-knowledge-memory`.

## Работы

1. Зафиксировать ownership map: какая сущность и формула принадлежит какому пакету.
2. Для каждого пакета создать `MODULE.md`, `package.json`, закрытую реализацию и минимальный `src/index.js`.
3. Перенести только чистые структурные проверки и утверждённые формулы; не переносить prompts, provider calls, SQL, persistence и orchestration.
4. Сохранить поведенческий паритет основных формул с legacy fixtures.
5. Передавать RNG только через `RandomSource`; запретить скрытый `Math.random()`.
6. Физически отделить visible projection от hidden state.
7. Добавить unit-тест каждого пакета и общий parity suite.
8. Расширить architecture gate: запрещённые импорты, циклы, лимиты файлов, наличие документации и тестов, единственный владелец формулы.
9. Обновить manifest, status, changelog и краткий список фаз.
10. Собрать архив без `node_modules`, временных файлов и вложенных release-архивов.

## Критерии завершения

- все десять пакетов имеют самостоятельный public API и `MODULE.md`;
- пакеты тестируются без БД и LLM;
- нет циклических зависимостей;
- domain не импортирует apps, UI, provider SDK, DB adapters или legacy;
- формулы проверки, движения, тела и боя имеют одного владельца;
- hidden fields не проходят visible boundary;
- старое подтверждённое поведение сохраняется на parity fixtures;
- полный модульный suite и release hygiene проходят.

## Не входит в фазу

- production turn orchestrator;
- semantic выбор того, когда нужна проверка или какое последствие создать;
- DB-backed integration;
- browser E2E;
- cutover legacy entrypoints.
