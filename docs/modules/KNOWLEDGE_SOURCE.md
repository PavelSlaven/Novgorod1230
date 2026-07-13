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

canonical document without approved embeddings
→ structural-only graph node
→ lexical-only chunks without `embedding`
```

The public `@rus/docs-tools.writeKnowledgeSourceOutputs` API and both `knowledge:generate` and `docs:generate` use the same v2 materializer. The legacy writer is not part of the package public API.

The v2 materializer accepts approved embeddings only when the semantic subset hash and every ordered chunk field match the current corpus. It validates matching source paths and logical line ranges for every semantic node, link and hyperedge, validates every hyperedge member source, requires the exact approved semantic document set, and rejects relations touching structural-only nodes. `knowledge:import` preflights corpus targets, manifest, aliases, inventory, imported snapshots and import history before writing.

## Public API

- `listDocuments({})`;
- `getCorpusManifest({})`;
- `getDocument({ document_id })`;
- `resolveSourceLocation({ document_id, start_line, end_line })`;
- `searchDocuments({ query, limit, allowed_document_ids, search_mode })`;
- `verifyCorpus({})`;
- `getGeneratedIndexStatus({})`.

Все результаты неизменяемы. Поиск `full_text` является техническим поиском строк, а не смысловым решением.
