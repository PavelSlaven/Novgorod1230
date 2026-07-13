# Отчёт фазы Game server и Game web

Дата: 2026-07-12  
Релиз: `0.16.0-migration.16`

## Выполнено

- Создан application composition root `createGameCompositionRoot`.
- Добавлены explicit adapters для LLM role runner, world-base reader, party-store, new-game и turn workflows.
- Добавлен technical session store и delivery acknowledgement lifecycle.
- Опубликованы versioned `/api/v1` routes: health, new game, party screen, opening acknowledgement и turn.
- Добавлены bounded JSON parsing, typed errors, no-store JSON responses и allowlisted static assets.
- Public HTTP payload проходит hidden-leak gate.
- Legacy server route изолирован в `legacy-entry.js` и выбирается feature flags.
- Создан модульный `game-web`: API client, contracts, UI store, router, bootstrap и девять feature surfaces.
- Web-клиент потребляет только FirstGameScreen/TurnScreen и отправляет действия как intent.
- Добавлены application architecture rules и 11 tests.

## Проверки

- `npm run test:apps`: 11/11.
- `npm run test:modules`: 217/217.
- `npm run test:domain`: 30/30.
- полный `npm test`: 258/258.
- architecture boundaries: passed.
- release hygiene: passed.
- ZIP integrity: passed.

## Ограничения

Выполнена production composition/package структура, но не выполнены live provider calls, production DB connection, browser automation, shadow run и cutover. Для modular startup требуется явно предоставленный composition module через `RUS_COMPOSITION_MODULE`; это предотвращает скрытое угадывание DB/provider wiring кодом.
