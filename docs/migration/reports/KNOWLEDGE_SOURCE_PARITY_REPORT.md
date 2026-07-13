# Knowledge Source parity report

Дата: 2026-07-12  
Релиз: `0.23.0-migration.23`

## Corpus

- Canonical documents: 19/19.
- Byte parity: passed.
- SHA-256 parity: passed.
- Unknown legacy files: 0.

## Graph

- Materialization mode: `approved_snapshot_materialization`.
- Documents referenced: 19.
- Nodes: 1295.
- Links: 3602.
- Hyperedges: 11.
- Source-location validation: passed.
- Semantic changes: none; approved snapshot preserved.

## RAG

- Materialization mode: `corpus_rechunk_with_approved_embedding_snapshot`.
- Chunks: 813.
- Model: `jina-embeddings-v3`.
- Dimensions: 1024.
- Chunk order/id/text/line/vector parity: passed.
- Corpus root: `data/knowledge-source/corpus/DOCUMENTS`.

## Decision

Parity accepted. Generated graph/RAG are bound to the migrated corpus and contain no runtime dependency on legacy paths.
