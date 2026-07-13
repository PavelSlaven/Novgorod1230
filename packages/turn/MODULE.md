# @rus/turn

## Назначение

Единый модульный workflow одного игрового хода. Модуль принимает слова игрока как намерение, запускает изолированные блоки обработки, фиксирует утверждённые последствия и возвращает публичный экран.

## Владеет

- контрактом `PlayerTurnInput`;
- декларативным порядком блоков хода;
- orchestration context и run summary;
- вызовом semantic-resolvers через явные ports;
- исполнением только явно запрошенных проверок через `RandomSource`;
- применением утверждённой длительности к clock formula;
- hidden/visible security boundary;
- commit gate и передачей утверждённого write plan в party store;
- публичным `TurnResult` и compatibility adapter.

## Не владеет

- созданием фактов мира, NPC, предметов, маршрутов, причин и последствий;
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

## Ports

Обязательные: `stateReader`, `modeResolver`, `availabilityResolver`, `consequenceResolver`, `visibleProjector`, `narrator.run`, `writePlanner`, `partyStore`. `RandomSource` обязателен только если semantic-resolver запросил бросок.

## Инварианты

1. `raw_text` всегда имеет `contract = intent_not_fact`.
2. Код не выбирает режим и не создаёт последствия.
3. Проверка выполняется только для явно утверждённого `check_request`.
4. Narrator вызывается через `@rus/narration` и получает только validated `visible_context_package`.
5. Commit невозможен до успешных structural/security gates.
6. Каждый block получает отдельный frozen input и не читает mutable global context.
7. Повторный commit должен использовать idempotency key.

## Ошибки

Все ошибки имеют код `TURN_*` и фазу. Ошибка конфигурации не заменяется deterministic fallback.

## Совместимость

Compatibility adapter сохраняет старые имена runtime-функций, но требует явных modular services. Старый deterministic mode resolver не переносится в production package.
