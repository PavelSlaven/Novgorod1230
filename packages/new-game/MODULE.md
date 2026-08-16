# @rus/new-game

## Назначение

Модульный workflow создания новой игры: изолированные Stages 2–26, compatibility facades и общий orchestrator.

## Владеет

- каталогом и публичными entrypoints Stages 2–26;
- stage-local precheck/validation/repair contracts;
- общим new-game orchestration order;
- handoff к Stage 25 persistence и Stage 26 first-screen result.

## Не делает

- не содержит конкретный provider transport или PostgreSQL adapter;
- не создаёт категории, историю или отсутствующие варианты;
- не хранит UI state;
- не выполняет соседний stage через внутренний импорт.

## Публичный API

`NEW_GAME_STAGE_CATALOG`, `runNewGamePipeline`, orchestrator exports и версионированные stage subpaths.

## Контракты

Каждый stage принимает точный input contract. Для активированного
`actor_base_appearance_v1` Stage 7 требует pinned actor profile snapshot и
возвращает typed hard block при его отсутствии; historical revisions сохраняют
нестрогий контракт. Stage 8 связывает equipment candidate с target NPC slot,
Stage 11 сохраняет разрешённый player intent и передаёт пропуски общему
code-owned appearance completion, Stages 12/15/24 требуют полный контракт для
новых actors, а Stage 16 разрешает target NPC/player и создаёт одежду как
реальные item instances. Stages
13, 15, 16 и 24 выполняются кодом; LLM используется только в явно разрешённых
ролях.

## Допустимые зависимости

`@rus/contracts`, `@rus/kernel`, `@rus/materialization`, `@rus/pipeline-engine`, `@rus/party-store` через публичные APIs.

## Запрещённые зависимости

Apps, UI, provider SDK, DB driver и внутренние файлы соседних stages.

## Инварианты

Код материализует instances только из approved profiles/rules; LLM repair не создаёт runtime state; commit идемпотентен.

## Ошибки

Stage-specific typed failures, validation failures, upstream repair requests и persistence failures.

## Тесты

Module/parity tests Stages 2–26, orchestrator tests, integration и browser E2E.

## Совместимость

Legacy facade доступен только через отдельный explicit rollback export; default modular graph его не загружает.
