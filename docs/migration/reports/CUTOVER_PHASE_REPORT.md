# Отчёт фазы staged cutover — migration-0.21.0

Дата: 2026-07-12

## Результат

- Steps: 13/13 passed.
- Gates: 65/65 passed.
- Failed gates: 0.
- Decision: `cutover_complete`.
- Default runtime route: `modular`.
- Explicit rollback route: `legacy`.
- Legacy deletion allowed: false.

## Выполненные изменения

- Создан автономный `@rus/cutover` и versioned `rus.cutover_plan.v1`.
- Feature flags разделены по subsystem boundaries и включаются накопительно.
- Modular game-server/game-web route стал default после нормативного шага 12.
- Legacy route оставлен только как явный rollback mode.
- Partial modular profiles блокируются fail-closed.
- Default `@rus/new-game` export graph больше не загружает legacy adapter.
- Static import proof проверил 331 runtime files и 731 import edges: legacy imports 0.
- Каждый шаг повторил smoke, shadow/golden, DB dry-run, diagnostics и rollback.

## Restore и rollback

- Party runtime snapshot восстановил sessions, delivery state и idempotency records.
- Предыдущий release `0.20.0` сохранён отдельным rollback archive.
- Rollback archive integrity, architecture, shadow tests и release hygiene проверены.
- Legacy source не удалён.

## Regression

- modules: 217/217;
- domain: 30/30;
- applications: 11/11;
- tools: 25/25;
- shadow: 6/6;
- cutover: 4/4;
- integration: 3/3;
- Chromium E2E: 1/1;
- total: 297/297.

Documentation reproducibility, architecture boundaries и release hygiene пройдены.

## Ограничение среды

Cutover выполнен как проверяемая release/staging configuration. Live deployment, реальные secrets, live LLM provider и внешняя production database не изменялись. Для запуска modular production route требуется явно переданный production bindings module.

## Следующая фаза

Финализация: migration manifest, restore evidence, manual delete checklist review и решение о ручном архивировании/удалении legacy. Автоматическое удаление запрещено.
