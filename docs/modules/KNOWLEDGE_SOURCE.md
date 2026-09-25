# Knowledge Source

## Поток данных

```text
canonical corpus
→ corpus manifest и SHA-256 gate
→ @rus/knowledge-source
→ source-backed candidates
→ явно разрешённый LLM context
```

Generated representations:

```text
canonical corpus
→ structural document nodes
→ generated graph

canonical corpus
→ deterministic lexical chunks
→ generated RAG
```

## Регистрация, покрытие и видимость

Регистрация в corpus manifest, статус документа, retrieval-policy metadata и lexical provenance coverage — раздельные понятия. Каждый registered документ обязан иметь policy metadata и запись RAG coverage. Генератор создаёт deterministic lexical chunks для всех статусов; graph получает structural nodes только для `active`. По умолчанию query и reader видят `active` и `reference`; `proposed` и `deprecated` доступны только при явном status request. Статус `reference` в ранжировании ниже любого `active`. Изменение текста любого registered документа, включая non-active, требует штатной пересборки generated RAG.

The public `@rus/docs-tools.writeKnowledgeSourceOutputs` API and both `knowledge:generate` and `docs:generate` use the same v2 lexical materializer. `knowledge:import` preflights corpus targets, manifest, aliases, inventory and import history before writing.

## Public API

- `listDocuments({})`;
- `getDocument({ document_id })`;
- `resolveSourceLocation({ document_id, section | start_line/end_line })`;
- `searchDocuments({ query, limit? })`;
- `createKnowledgeRagReader({ storage })` — ranked lexical retrieval, controls, readiness.
