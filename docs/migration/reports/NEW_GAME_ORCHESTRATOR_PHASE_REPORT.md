# Отчёт фазы: общий modular new-game orchestrator

Дата: 2026-07-12  
Релиз: `0.12.0-migration.12`

## Выполнено

- Добавлен `packages/new-game/src/orchestrator`.
- Зафиксирован единый stage plan Stages 2–26.
- Добавлен общий runner с opt-in gate `enableNewGamePipeline=true`.
- Добавлен orchestration context для outputs, managed results, gates, repair history, событий и frozen artifacts.
- Реализованы checkpoints и resume.
- Реализована маршрутизация repair к явно объявленному upstream stage.
- Downstream state очищается при repair; история repair сохраняется.
- Добавлены ограничения `maxRepairCycles` и `maxStageExecutions`.
- Утверждённые stage artifacts регистрируются с digest.
- Stage 2 и Stage 3 получили исполнимые definitions; общий definitions registry содержит Stages 2–26.
- API опубликован как `@rus/new-game/orchestrator`.
- Legacy production entrypoint не переключён и не изменён.

## Архитектурная граница

Оркестратор не создаёт мир, не выбирает отсутствующие значения, не чинит смысловые ошибки самостоятельно и не получает скрытый доступ к БД. Для stage-specific входов используются явные input builders и injected services. Отсутствующий builder или executor является ошибкой конфигурации, а не основанием для процедурной догадки.

## Проверки

- `npm run test:new-game-orchestrator`: 6/6;
- `npm test`: 206/206;
- architecture boundaries: passed;
- release hygiene: passed.

Проверены точный порядок Stages 2–26, полный проход, repair routing, checkpoint resume, восстановление frozen artifacts и отсутствие legacy imports.

## Ограничения

Фаза завершает модульный управляющий слой, но не является production cutover. Для реального запуска ещё нужны composition root с provider/DB adapters, production-corpus shadow run, DB-backed integration, browser E2E и переключение feature flag после parity-аудита.
