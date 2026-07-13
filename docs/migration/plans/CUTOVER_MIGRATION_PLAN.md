# План staged cutover — migration-0.21.0

Дата: 2026-07-12

## Цель

Переключить production route с legacy на modular implementation в нормативном порядке, не меняя игровые правила, не удаляя legacy source и сохраняя проверяемый rollback.

## Последовательность

1. Contracts и kernel.
2. LLM runtime.
3. World-base и knowledge-source.
4. Party-store.
5. New-game Stages 24–26.
6. New-game Stages 20–23.
7. Остальные new-game stages.
8. Полный new-game orchestrator.
9. Turn workflow.
10. Presentation.
11. Game server.
12. Game web и modular route как default.
13. Tools и release pipeline.

## Обязательные gates каждого шага

- staging smoke test;
- полный shadow/golden corpus;
- DB dry-run;
- diagnostics check;
- rollback check без изменения party state.

Любой failed gate блокирует следующий шаг. Частичный modular profile отклоняется fail-closed.

## Изменения маршрутизации

- `RUS_RUNTIME_ROUTE=modular` — default после шага 12.
- `RUS_RUNTIME_ROUTE=legacy` — явный rollback route.
- subsystem flags включаются только накопительно по `rus.cutover_plan.v1`.
- default export `@rus/new-game` не загружает legacy adapter.
- legacy compatibility остаётся доступна через отдельный export и explicit route.

## Финальные проверки

- 13/13 шагов и 65/65 gates;
- static modular runtime import proof;
- полный regression suite;
- Chromium E2E;
- party DB backup/restore test;
- restore test текущего release archive;
- отдельный rollback archive предыдущего релиза;
- architecture, documentation и release hygiene checks.

## Ограничение

Эта фаза выполняет cutover в release/staging configuration. Она не подключается к неизвестной внешней production deployment system и не удаляет legacy. Реальные credentials, live provider и production DB не изменяются автоматически.
