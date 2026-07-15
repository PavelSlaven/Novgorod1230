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

## Ports

Обязательные: code-owned `commandRegistry`, `stateReader`, `visibleProjector`, `narrator.run`, `partyStore`. `decisionExecutor` с подписанным bounded-протоколом обязателен только при нескольких допустимых командах. `RandomSource` обязателен только если выбранный code handler сформировал утверждённый `check_request`.

Travel integration uses the same workflow: state blocks `active_journey`, `journey_legs`, `travel_position`, environment feature blocks and `transport_state`; normalized persistence targets include journeys, legs and environment runs/features. The command handler remains code-owned and may not replace a missing approved bundle or route with a fallback.

The only travel command IDs are `travel.start_route`, `travel.start_course`, `travel.continue`, `travel.stop`, `travel.change_pace`, `travel.reroute`, `travel.camp`, `travel.resume` and `travel.abandon`.

`createTravelTurnCommandDefinitions` supplies the code-owned definitions to the normal command registry. It selects only `routing_context.travel_command_id` and returns a typed block if the state reader did not provide formal travel context and persistence proposal; it does not infer either from player text.

`travel.start_route` создаёт journey только из заранее выбранного version-pinned `JourneyPlan`. `travel.start_course` дополнительно требует selected applicable fact-graph candidate и проверяет, что он буквально совпадает с первым leg; он не выбирает edge или destination сам. `travel.continue` требует `travel-advance-request.v1`, связывающий journey, leg, state version и selected boundary; он возвращает `travel-advance-result.v1` и не принимает похожие, но несвязанные поля. `travel.stop`, `travel.camp`, `travel.resume`, `travel.change_pace` и `travel.abandon` выполняют только соответствующий pure transition при validated active journey, pinned travel context и formal request, затем строят normalized journey/leg/position proposal. Завершение последнего leg формирует `travel-arrival-request.v1` и ровно один `position_transition`; следующий persistence block использует уже существующий atomic first-entry gate. `travel.reroute` принимает только replacement plan на `progress_permille=0`, сохраняет version pins и не вычисляет новую ветвь. Все lifecycle requests требуют explicit duration и updated_at от владельца времени.

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
