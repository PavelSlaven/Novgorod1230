# Отчёт фазы: единый modular turn workflow

Дата: 2026-07-12  
Релиз: `0.14.0-migration.14`

## Выполнено

- Пакет `@rus/turn` заменён с legacy-loader skeleton на самостоятельный workflow package.
- Добавлен канонический `runTurnWorkflow`.
- Workflow разбит на 13 изолированных блоков.
- Выполнение блоков идёт через общий `@rus/pipeline-engine`.
- Добавлены frozen workflow context, checkpoint и run summary.
- Mode, availability, consequences и logical write targets принадлежат зарегистрированному code command handler.
- При неоднозначности LLM получает только подписанный bounded option set; свободные mode/consequence/write-plan ответы не принимаются.
- Approved check requests исполняются через `@rus/checks-rng` и injected `RandomSource`.
- Approved duration применяется через `@rus/time-events-history`.
- Hidden/visible boundary выполняется через `@rus/visibility-knowledge-memory`.
- Public screen строится через `@rus/presentation`.
- Commit использует idempotency key; PostgreSQL party store принимает только in-process sealed plan и сохраняет bounded-decision trace.
- Добавлен отдельный code-owned workflow autonomous updates с version-bound `party_change_set_v2`.
- Добавлен `@rus/turn/compat` со старыми runtime-именами без legacy imports.
- Architecture checker проверяет imports, cycles, file budgets, stage completeness и отсутствие deterministic semantic fallback.

## Поведение gates

- отсутствующий/поддельный command registry: configuration failure;
- unknown/stale/expired bounded command: failure;
- отсутствующий RandomSource при утверждённой проверке: failure;
- hidden field в visible package: failure до narrator;
- failed narration audit: failure до write plan;
- invalid write target: failure до commit;
- `repair_required`: pipeline stop до time/narration/persistence;
- неподписанный или содержащий физические target tables write plan: failure;
- approved sealed write plan: atomic idempotent commit.

## Проверки

- `npm run test:turn`: 11 успешно, 0 ошибок;
- `npm run test:modules`: 214 успешно, 0 ошибок;
- `npm run test:domain`: 19 успешно, 0 ошибок;
- полный `npm test`: 233 успешно, 0 ошибок;
- architecture boundaries: passed;
- release hygiene: passed.

## Не выполнено этой фазой

- переключение legacy turn entrypoint;
- подключение реальных provider/DB adapters в game-server composition root;
- production-corpus shadow run;
- browser E2E;
- staged cutover.
