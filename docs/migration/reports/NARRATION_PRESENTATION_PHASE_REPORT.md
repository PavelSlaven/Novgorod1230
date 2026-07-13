# Отчёт фазы: Narration и Presentation

Дата: 2026-07-12  
Релиз: `0.15.0-migration.15`

## Выполнено

- Создан production-пакет `@rus/narration`.
- Добавлен канонический `runNarrationFlow`.
- Добавлены versioned contracts `narration_request`, `narration_output`, `narration_audit`, `narration_repair_route` и `narration_flow_result`.
- Реализован bounded generation → audit → repair → senior audit flow.
- Добавлены explicit ports: writer, auditor, format repairer, senior writer, senior auditor и router.
- Failed audit формирует `repair_required` или `blocked`, но не approved prose.
- Добавлен адаптер approved new-game Stages 22–23 в общий narration result.
- `@rus/presentation` расширен versioned FirstGameScreen, TurnScreen и семью panel types.
- Stage 26 result адаптируется в FirstGameScreen без импорта stage implementation.
- TurnScreen строится только из approved narration flow.
- `@rus/turn` теперь вызывает `narrator.run` и public `@rus/presentation` API.
- Custom screen projector повторно проходит TurnScreen contract и hidden leak validation.
- Architecture checker проверяет imports, cycles, size budgets, ports и security markers новых пакетов.

## Security и semantic gates

- hidden fields во visible context блокируются до writer call;
- hidden fields в narrator output блокируются до audit/commit;
- invalid writer output требует format repair либо блокируется;
- failed audit маршрутизируется explicit router;
- exhausted repair budget возвращает typed upstream repair request;
- public screens не содержат hidden state;
- diagnostic panel скрыт вне explicit developer mode;
- player input contract остаётся `intent_not_fact`.

## Проверки

- `npm run test:narration-presentation`: 13 успешно, 0 ошибок;
- `npm run test:turn`: 12 успешно, 0 ошибок;
- `npm run test:modules`: 217 успешно, 0 ошибок;
- `npm run test:domain`: 30 успешно, 0 ошибок;
- полный `npm test`: 247 успешно, 0 ошибок;
- architecture boundaries: passed;
- release hygiene: passed.

## Не выполнено этой фазой

- реальные LLM provider adapters в game-server composition root;
- реальные DB adapters и DB-backed integration;
- HTTP/game-web подключение новых read models;
- production-corpus shadow run;
- browser E2E;
- default cutover legacy entrypoints.
