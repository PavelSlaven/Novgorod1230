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
canonical corpus + approved graph snapshot
→ source-location validation
→ generated graph

canonical corpus + approved embedding snapshot
→ deterministic rechunk
→ exact chunk/text/vector parity
→ generated RAG
```

## Public API

- `listDocuments({})`;
- `getCorpusManifest({})`;
- `getDocument({ document_id })`;
- `resolveSourceLocation({ document_id, start_line, end_line })`;
- `searchDocuments({ query, limit, allowed_document_ids, search_mode })`;
- `verifyCorpus({})`;
- `getGeneratedIndexStatus({})`.

Все результаты неизменяемы. Поиск `full_text` является техническим поиском строк, а не смысловым решением.
