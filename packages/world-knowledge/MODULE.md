# @rus/world-knowledge

## Назначение

Pure read-only gameplay factual owner. Загружает caller-provided immutable compiled Knowledge Pack и детерминированно разрешает `world_knowledge_query_v1` в bounded `world_knowledge_slice_v1`.

Pack может включать независимо проверенные игровые реконструкции (§0.2 WK
контракта). Existing qualifiers и runtime text сохраняют отличие реконструкции
от установленного факта; отдельного retrieval interface или генератора нет.
Compact context помечает direct/inferred/analogical/editorial/unknown как
FACT/INFERENCE/ANALOGY/EDITORIAL/UNCERTAIN соответственно.

## Владеет

- query/bundle validation и slice construction;
- exact, structured и localized lexical retrieval;
- caller-provided vector scores и pure flat-vector scan; Core остаётся
  backend-neutral, а active production server требует этот input; vector
  similarity only adds recall candidates and never bypasses applicability;
- pack-specific applicability, coverage/verdict, explicit conflicts, ranking и deterministic context packing;
- lexicographic ranking: hard constraints, exact focus, requested predicates,
  query relevance, context specificity, qualifiers, stable claim reference;
- relative lexical admission per independent search hint; aggregate lexical
  relevance ranks the admitted candidates without suppressing common topics;
- actor-safe filtering только по уже переданным caller facets.
  `knowledge_access.required_values` опционально ограничивает значение
  разрешённого facet только для actor-facing purposes; materialization и другие
  не actor-facing запросы не получают из него availability restriction.

## Не владеет

LLM calls, filesystem/network/DB, party state, presence/materialization, actor decisions, exact mechanics, persistence или narration. Missing claim возвращает `unresolved`, не запрет действия.

## API

- `createWorldKnowledgeCore(bundle)` → frozen `{ resolveWorldKnowledge(query) }`;
- `createWorldKnowledgeFlatVectorIndex(metadata, bytes,
  { conceptToClaimRefs? })` → frozen `{ search(vector, options) }`; optional
  mapping is snapshotted and collapses concept hits to claim refs before limit.
- `validateWorldKnowledgeQuery(query, bundle)`;
- `validateWorldKnowledgeQueryPlannerRequest(request, bundle)`;
- `validateWorldKnowledgeQueryPlan(plan, request, bundle)`;
- `WorldKnowledgeError` с `WORLD_KNOWLEDGE_QUERY_INVALID` или `WORLD_KNOWLEDGE_UNAVAILABLE`.

## Тесты

`node --test packages/world-knowledge/test/*.test.js`
