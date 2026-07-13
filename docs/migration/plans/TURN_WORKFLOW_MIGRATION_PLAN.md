# План миграции единого turn workflow

Дата: 2026-07-12  
Целевой релиз: `0.14.0-migration.14`  
Исходный релиз: `0.13.0-migration.13`

## Цель

Заменить роль разрозненных `master.js`, `engine.js` и `turn-runtime/runtime.js` одним каноническим production-пакетом `@rus/turn`, не переключая legacy entrypoint до отдельного shadow run и cutover.

## Архитектурные ограничения

1. Слова игрока являются намерением, а не фактом мира.
2. Код не выбирает режим действия и не создаёт последствия.
3. Semantic decisions поступают только через явные resolvers.
4. Проверки D20 выполняются только по утверждённым `check_request` и через injected `RandomSource`.
5. Narrator получает только validated `visible_context_package`.
6. DB, provider SDK, UI и legacy imports внутри `@rus/turn` запрещены.
7. Persistence выполняется только после narration/security/contract gates.
8. `repair_required` блокирует commit.

## План работ

1. Зафиксировать контракты `PlayerTurnInput`, mode resolution, availability, consequence, narration, write plan и result.
2. Создать декларативный порядок 13 блоков:
   - normalize intent;
   - resolve mode;
   - load context;
   - availability;
   - checks;
   - consequence;
   - time update;
   - hidden update;
   - visible projection;
   - narration;
   - persistence plan;
   - commit;
   - screen projection.
3. Подключить общий `@rus/pipeline-engine`.
4. Вынести все внешние зависимости в ports/services.
5. Выполнять approved checks через `@rus/checks-rng`.
6. Применять утверждённую длительность через `@rus/time-events-history`.
7. Использовать `@rus/visibility-knowledge-memory` как security boundary.
8. Использовать `@rus/presentation` только для публичной read-model projection.
9. Добавить compatibility adapter со старыми runtime-именами без импорта legacy implementation.
10. Добавить unit, workflow, isolation, security, repair и idempotency tests.
11. Расширить architecture checker и release reports.
12. Собрать релизный архив и контрольную сумму.

## Definition of Done

- `@rus/turn` имеет один публичный workflow entrypoint;
- все 13 блоков выполняются через pipeline-engine;
- semantic resolver обязателен;
- deterministic semantic fallback отсутствует;
- hidden leak блокирует narration и commit;
- failed narration audit блокирует persistence;
- `repair_required` останавливает pipeline до commit;
- tests, architecture check и release hygiene проходят;
- legacy production route остаётся доступным до отдельного cutover.
