# @rus/world-knowledge

## Назначение

Pure read-only gameplay factual owner. Загружает caller-provided immutable compiled Knowledge Pack и детерминированно разрешает `world_knowledge_query_v1` в bounded `world_knowledge_slice_v1`.

Pack может включать независимо проверенные игровые реконструкции (§0.2 WK
контракта). Existing qualifiers и runtime text сохраняют отличие реконструкции
от установленного факта; отдельного retrieval interface или генератора нет.
Compact context помечает direct/inferred/analogical/editorial/unknown как
FACT/INFERENCE/ANALOGY/EDITORIAL/UNCERTAIN соответственно.

## Владеет

- query/bundle validation и structured slice construction; query budget содержит
  `max_facts` и `max_candidates`, slice не содержит prose `context_text`;
- canonical empty six-field `semantic_resolution` query plan как
  `NO_KNOWLEDGE_REQUIRED`; при пустом
  `domains` refs/predicates/hints тоже обязаны быть пустыми;
- bounded planner focus candidates из compiled lexical postings с теми же
  tokenization/IDF и claim→concept MAX; русский last-letter stem расширяет
  только начала индексных токенов. Domain filter и stable tie сохраняются;
  exact lexical retrieval Core не получает это расширение;
- exact, structured и localized lexical retrieval;
- caller-provided vector scores и pure flat-vector scan; Core остаётся
  backend-neutral, а active production server требует этот input; vector
  similarity only adds recall candidates and never bypasses applicability;
- optional caller-provided `rerankScores` (D17): reorder admitted candidates
  only (between ranking and packing); do not expand recall; production wiring
  stays behind D21 gate (LW-053);
- `admittedCandidateRefs(query, { vectorScores? })` — pure list of admitted
  claim refs before ranking/packing; grounding scores exactly this set for
  D17 so all-or-nothing rerank can apply (not vector top-k alone);
- pack-specific applicability, coverage/verdict, explicit conflicts, ranking и deterministic claim packing;
- lexicographic ranking: hard constraints, exact focus, requested predicates,
  query relevance (lexical+vector, or rerank when supplied), context specificity, qualifiers, stable claim reference;
- relative lexical admission per independent search hint; aggregate lexical
  relevance ranks the admitted candidates without suppressing common topics;
- `search_hint_hits` / `search_hint_relevance` on the Core slice: one bool and
  one topical score per hint (orchestrator §63 sufficiency; not model wire).
  Relevance is cosine of the claim against the **joined** search query (not a
  single hint); claims outside the vector top-k score 0. When D21 rerank
  applies all-or-nothing, scores are min-max bge over admitted and must not be
  compared to the provisional Giga-cosine floor (`wk-sufficiency:giga-cosine:v1`,
  LW-054).
- actor-safe filtering только по уже переданным caller facets.
  `knowledge_access.required_values` опционально ограничивает значение
  разрешённого facet только для actor-facing purposes (`conversation`,
  `narration`); `npc_decision` — устройство мира и не фильтруется
  `ACTOR_FACING_PURPOSES` (D15). Actor-facing purposes также исключают
  `domain_internal_only` claims; достижимость таких доменов по purpose
  задают pack `coverage_profiles` (§15). materialization и другие не
  actor-facing запросы не получают из `required_values` availability
  restriction.

## Не владеет

LLM calls, filesystem/network/DB, party state, presence/materialization, actor decisions, exact mechanics, persistence или narration. Missing claim возвращает `unresolved`, не запрет действия.

## API

- `CONDITION_FACETS` — single owner registry (incl. `started_historical_events`); pack compiler imports it. Empty `context.conditions.started_historical_events` means nothing has begun yet. Claim conditions for that facet allow only `includes` + string `event_id`. Focus filter skips claims missing `applicability` / `knowledge_access` (§13, no fail-open).
- `isValidCondition` — shared condition validator; pack compiler must call it (no second rule copy).
- `candidateWorldKnowledgeFocusRefs(bundle, input, locale, domains, limit|options)`;
  optional `options.{limit,purpose,context}` applies the same `isApplicable` /
  `canAccess` date/access gate as Core before offering concepts to the planner;
- `createWorldKnowledgeCore(bundle)` → frozen `{ resolveWorldKnowledge(query, { vectorScores?, rerankScores? }), admittedCandidateRefs(query, { vectorScores? }) }`;
- `createWorldKnowledgeFlatVectorIndex(metadata, bytes,
  { conceptToClaimRefs? })` → frozen `{ search(vector, options) }`; optional
  mapping is snapshotted and collapses concept hits to claim refs before limit.
- `validateWorldKnowledgeQuery(query, bundle)`;
- `validateWorldKnowledgeQueryPlannerRequest(request, bundle)`;
- `validateWorldKnowledgeQueryPlan(plan, request, bundle)`;
- `WorldKnowledgeError` с `WORLD_KNOWLEDGE_QUERY_INVALID` или `WORLD_KNOWLEDGE_UNAVAILABLE`.

## Тесты

`node --test packages/world-knowledge/test/*.test.js`
