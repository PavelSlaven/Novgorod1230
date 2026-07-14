# План фазы: shadow run и структурное сравнение

Дата: 2026-07-12  
Исходный релиз: `0.19.0-migration.19`  
Целевой релиз: `0.20.0-migration.20`

## Цель

Подать одинаковые утверждённые inputs старым compatibility/baseline routes и новым модульным routes, сравнить структурные свойства и выдать формальную рекомендацию для staged cutover. Художественная проза не сравнивается посимвольно; сравниваются schema, ссылки, audits, permissions и safety invariants.

## Корпус

Корпус фиксируется в `data/shadow-corpus/manifest.json` как `rus.shadow_corpus.v1`. Он использует versioned golden fixtures, baseline snapshots, реальные legacy compatibility routes, modular package APIs, production infrastructure integration tests и Chromium public-boundary E2E. LLM-output подаётся как заранее утверждённые fixtures; live provider calls и production DB writes запрещены.

## Работы

1. Создать автономный `@rus/shadow-run`, не импортируемый runtime-кодом.
2. Зафиксировать allowlisted corpus cases и provenance.
3. Покрыть 12 нормативных категорий: schema equivalence, canonical IDs, отсутствие новых фактов от кода, audit decisions, repair tier, DB write plan, commit result, visible/hidden separation, UI read model, error classification, idempotency и telemetry completeness.
4. Добавить реальный turn shadow case: один intent проходит legacy и modular routes, результаты нормализуются до общей структуры.
5. Добавить rollback test для `RUS_MODULES_ENABLED` и `RUS_UI_MODULES_ENABLED`.
6. Исполнять каждый case отдельным Node test process без shell-интерполяции.
7. Выпускать `rus.shadow_run_report.v1` в JSON и Markdown.
8. Любой failed parity/isolation/rollback case классифицировать как blocking.
9. Выдать `go_to_staged_cutover` только при полном покрытии категорий, нуле blocking differences и успешном rollback case.
10. Прогнать полный regression suite, docs check, architecture и release hygiene.

## Критерии завершения

- Все cases прошли на одном зафиксированном corpus.
- Все 12 категорий имеют evidence.
- Нет blocking расхождений.
- Semantic/safety invariants приняты.
- Rollback route проверен.
- Отчёт и cutover recommendation сохранены в dated artifacts.
- Legacy entrypoint не удалён и не переключён автоматически.
