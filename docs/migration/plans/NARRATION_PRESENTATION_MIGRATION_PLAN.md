# План миграции Narration и Presentation

Дата: 2026-07-12  
Целевой релиз: `0.15.0-migration.15`  
Исходный релиз: `0.14.0-migration.14`

## Цель

Создать единые production-пакеты `@rus/narration` и `@rus/presentation`, подключить их к modular turn workflow и унифицировать player-visible handoff для new-game и turn без переключения legacy application entrypoints.

## Архитектурные ограничения

1. Narrator получает только validated visible context.
2. Код не пишет художественную прозу и не создаёт факты мира как fallback.
3. Generation, audit, repair и senior audit выполняются только через explicit ports.
4. Repair ограничен счётчиком и после ремонта всегда выполняется повторный аудит.
5. Failed или upstream audit не выдаёт approved prose и блокирует persistence.
6. Presentation принимает только approved narration или successful Stage 26 result.
7. FirstGameScreen, TurnScreen и panels являются versioned read models.
8. Hidden, audit, source, DB и provider payloads не попадают в публичный экран.
9. `intent_not_fact` сохраняется в player input panel.
10. Narration/Presentation не импортируют legacy, apps, provider SDK или DB drivers.

## План работ

1. Инвентаризировать Stage 22, Stage 23, Stage 26 и turn narration/screen hooks.
2. Создать `@rus/narration` с versioned request/output/audit/route/result contracts.
3. Реализовать bounded writer → audit → repair → senior audit flow.
4. Добавить typed upstream repair request и histories.
5. Добавить адаптер approved new-game Stages 22–23 в общий narration result.
6. Расширить `@rus/presentation` versioned FirstGameScreen и TurnScreen.
7. Добавить Character, Inventory, People, Route, Map, Journal и Diagnostic panels.
8. Добавить Stage 26 → FirstGameScreen read-model adapter.
9. Подключить `@rus/turn` к `narrator.run` и `createTurnScreenReadModel`.
10. Запретить custom screen projector обходить versioned contract и hidden leak gate.
11. Расширить architecture checker и isolation tests.
12. Обновить manifest, status, reports, checksums и release archive.

## Definition of Done

- единый `runNarrationFlow` существует и не содержит semantic fallback;
- approved prose появляется только после успешного аудита;
- repair bounded и повторно аудируется;
- new-game Stages 22–23 адаптируются в общий narration approval;
- Stage 26 адаптируется в versioned FirstGameScreen;
- turn возвращает versioned TurnScreen;
- hidden leak блокируется до public output;
- tests, architecture check и release hygiene проходят;
- legacy app/server entrypoints остаются default до отдельной integration/cutover фазы.
