# @rus/world-knowledge

## Назначение

Pure read-only gameplay factual owner. Загружает caller-provided immutable compiled Knowledge Pack и детерминированно разрешает `world_knowledge_query_v1` в bounded `world_knowledge_slice_v1`.

## Владеет

- query/bundle validation и slice construction;
- exact, structured и localized lexical retrieval;
- optional caller-provided vector scores и pure flat-vector scan; vector
  similarity only adds recall candidates and never bypasses applicability;
- pack-specific applicability, coverage/verdict, explicit conflicts, ranking и deterministic context packing;
- actor-safe filtering только по уже переданным caller facets.

## Не владеет

LLM calls, filesystem/network/DB, party state, presence/materialization, actor decisions, exact mechanics, persistence или narration. Missing claim возвращает `unresolved`, не запрет действия.

## API

- `createWorldKnowledgeCore(bundle)` → frozen `{ resolveWorldKnowledge(query) }`;
- `createWorldKnowledgeFlatVectorIndex(metadata, bytes)` → frozen
  `{ search(vector, options) }`;
- `validateWorldKnowledgeQuery(query, bundle)`;
- `validateWorldKnowledgeQueryPlannerRequest(request, bundle)`;
- `validateWorldKnowledgeQueryPlan(plan, request, bundle)`;
- `WorldKnowledgeError` с `WORLD_KNOWLEDGE_QUERY_INVALID` или `WORLD_KNOWLEDGE_UNAVAILABLE`.

## Тесты

`node --test packages/world-knowledge/test/*.test.js`
