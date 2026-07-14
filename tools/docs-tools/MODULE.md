# @rus/docs-tools

## Назначение

Автономные инструменты проверки document graph/RAG и воспроизводимой генерации канонической документации.

## Владеет

- проверкой source ranges document graph;
- построением RAG index через injected embedding port;
- генерацией `MODULE_INDEX.md` и schema reference;
- generated manifest и проверкой reproducibility;
- canonical-path, seed-source и dated-artifact policy checks.

## Не делает

- не импортирует provider SDK или production runtime;
- не изменяет игровые данные и БД;
- не создаёт смысловые документы из неутверждённых данных;
- не использует deterministic embedding fallback.

## Public API

`verifyDocumentGraph`, `buildRagIndex`, `verifyRagIndex`, `queryVectorIndex`, `buildDocumentationOutputs`, `writeDocumentationOutputs`, `checkDocumentationOutputs`, `validateDocumentationTree`.

## CLI

- `npm run docs:generate` — воспроизводимо обновляет generated reference и `MODULE_INDEX.md`;
- `npm run docs:check` — сравнивает committed output с повторной генерацией и проверяет policies.

## Инварианты

Generated output не редактируется вручную. Каждый прежний документ имеет один canonical path. Embeddings создаются только переданным adapter.

## Knowledge-source commands

- `npm run knowledge:inventory` — classify every legacy DOCUMENTS file;
- `npm run knowledge:import` — byte-faithful legacy refresh that preserves verified native records and aliases;
- `npm run knowledge:generate` — materialize graph/RAG from the canonical corpus and approved snapshots;
- `npm run knowledge:check` — verify corpus parity, provenance and stale state.
