# Отчёт фазы: единый modular turn workflow

Дата: 2026-07-12  
Релиз: `0.14.0-migration.14`

## Выполнено

- Пакет `@rus/turn` заменён с legacy-loader skeleton на самостоятельный workflow package.
- Добавлен канонический `runTurnWorkflow`.
- Workflow разбит на 13 изолированных блоков.
- Выполнение блоков идёт через общий `@rus/pipeline-engine`.
- Добавлены frozen workflow context, checkpoint и run summary.
- Mode, availability, consequences, visible projection, narration и write plan поступают через injected services.
- Код не использует regex-routing или deterministic consequence fallback.
- Approved check requests исполняются через `@rus/checks-rng` и injected `RandomSource`.
- Approved duration применяется через `@rus/time-events-history`.
- Hidden/visible boundary выполняется через `@rus/visibility-knowledge-memory`.
- Public screen строится через `@rus/presentation`.
- Commit использует idempotency key и injected party store.
- Добавлен `@rus/turn/compat` со старыми runtime-именами без legacy imports.
- Architecture checker проверяет imports, cycles, file budgets, stage completeness и отсутствие deterministic semantic fallback.

## Поведение gates

- отсутствующий semantic resolver: configuration failure;
- отсутствующий RandomSource при утверждённой проверке: failure;
- hidden field в visible package: failure до narrator;
- failed narration audit: failure до write plan;
- invalid write target: failure до commit;
- `repair_required`: pipeline stop до time/narration/persistence;
- approved write plan: idempotent commit.

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
