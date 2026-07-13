# План миграции new-game Stages 2–8

Дата: 2026-07-12  
Статус: выполнен

## Цель

Перенести ранний участок запуска новой партии в изолированные stage-модули без изменения смысловых границ: Stage 2 только нормализует заявку, Stage 3 выбирает историческую рамку из разрешённых кандидатов, Stages 4–8 только читают и проверяют утверждённые наборы данных. Код не материализует места, NPC, предметы или инвентарь раньше соответствующих LLM-этапов.

## Работы

1. Зафиксировать исходные реализации Stages 2–8 из `0.9.0-migration.9` в golden fixtures.
2. Вынести Stage 2 в модуль contract shaping: input, policy, constants, validation, definition и compatibility API.
3. Вынести Stage 3 в модуль candidate-bound semantic selection: candidate retrieval, policy, input, validation и compatibility API.
4. Перевести Stages 4–8 на явные read-only ports без прямых импортов legacy, SQL, provider SDK, UI или server.
5. Оставить legacy retrievers только в центральном compatibility adapter; legacy stage-файлы заменить однострочными фасадами.
6. Зафиксировать запреты ранней материализации: resolved world IDs в Stage 2, выбор вне candidate set в Stage 3, concrete items/inventory в Stage 8.
7. Добавить export parity, port isolation, facade и architecture tests.
8. Обновить manifest, status, architecture/test reports, checksums и release archive.

## Критерии готовности

- все baseline named exports сохранены;
- legacy Stage 2–8 не содержат реализации;
- stage core не импортирует `legacy/`;
- Stages 4–8 исполняются только через переданные порты;
- модульный suite и architecture checker проходят;
- release hygiene проходит;
- известные legacy failures не маскируются и не выдаются за новые регрессии.
