# @rus/turn

## Назначение

Единый модульный workflow одного игрового хода. Модуль принимает слова игрока как намерение, запускает изолированные блоки обработки, фиксирует утверждённые последствия и возвращает публичный экран.

## Владеет

- контрактом `PlayerTurnInput`;
- декларативным порядком блоков хода;
- orchestration context и run summary;
- вызовом code resolvers и bounded decision protocol через явные ports;
- исполнением только явно запрошенных проверок через `RandomSource`;
- применением утверждённой длительности к clock formula;
- hidden/visible security boundary;
- commit gate и передачей утверждённого write plan в party store;
- формальным `position_transition`; cross-G4 transition всегда включает first-entry materialization в тот же commit;
- публичным `TurnResult` и compatibility adapter.

## Не владеет

- созданием категорий, истории и отсутствующих вариантов;
- выбором режима по регулярным выражениям или иным procedural guesses;
- прямым доступом к PostgreSQL, party DB, world_base или provider SDK;
- prompt transport;
- художественной прозой как смысловым источником; narration lifecycle принадлежит `@rus/narration`;
- UI DOM и HTTP routes.

## Public API

- `runTurnWorkflow(input, services, options)`;
- `createTurnWorkflowContext(input)`;
- `TURN_WORKFLOW_STAGE_PLAN`;
- validators и константы контрактов;
- `createLegacyTurnCompatibilityAdapter(services)` через `@rus/turn/compat`.
- `@rus/turn/spatial-v3`: `createCombinedWritePlanBuilder` (P08 target stub; no v2 fallback).
- `@rus/turn/spatial-v3-execution`: pure P19 immediate-action, timed-activity, traversal and synchronized-slice proposal engine; it has no database writer and remains target-only until P28.

## Ports

Обязательные: code-owned `commandRegistry`, `stateReader`, `visibleProjector`, `narrator.run`, `partyStore`. `decisionExecutor` с подписанным bounded-протоколом обязателен только при нескольких допустимых командах. `RandomSource` обязателен только если выбранный code handler сформировал утверждённый `check_request`.

## Инварианты

1. `raw_text` всегда имеет `contract = intent_not_fact`.
2. Код выбирает применимый handler, материализует допустимые instances и рассчитывает последствия; неоднозначный смысловой выбор оформляется bounded request.
3. Проверка выполняется только для явно утверждённого `check_request`.
4. Narrator вызывается через `@rus/narration` и получает только validated `visible_context_package`.
5. Commit невозможен до успешных structural/security gates.
6. Каждый block получает отдельный frozen input и не читает mutable global context.
7. Повторный commit должен использовать idempotency key.
8. `party_current_position` нельзя записать без `from_g4_id/to_g4_id`; первый вход сериализуется repository lock и не материализуется повторно.

## Ошибки

Все ошибки имеют код `TURN_*` и фазу. Ошибка конфигурации не заменяется deterministic fallback.

## Совместимость

Compatibility adapter сохраняет старые имена runtime-функций, но требует явных modular services. Старый deterministic mode resolver не переносится в production package.
