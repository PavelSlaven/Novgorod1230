# Knowledge Source parity report

Дата: 2026-07-12  
Релиз: `0.23.0-migration.23`

## Corpus

- Canonical documents: 26/26.
- Legacy documents with provenance: 19.
- Native project documents: 7.
- Byte parity: passed.
- SHA-256 parity: passed.
- Unknown legacy files: 0.

## Graph

- Materialization mode: `approved_snapshot_materialization`.
- Documents referenced: 19.
- Structural-only documents: 7.
- Nodes: 1295.
- Links: 3602.
- Hyperedges: 11.
- Source-location validation: passed.
- Semantic changes: none; approved snapshot preserved.

Generated graph after structural extension: 1302 nodes, 3602 links and 11 hyperedges. The seven native documents have no generated semantic links.

## RAG

- Materialization mode: `corpus_rechunk_with_approved_embedding_snapshot`.
- Chunks: 813.
- Lexical-only chunks: 346 across 7 native documents.
- Model: `jina-embeddings-v3`.
- Dimensions: 1024.
- Chunk order/id/text/line/vector parity: passed.
- Lexical chunks contain no `embedding` field.
- Corpus root: `data/knowledge-source/corpus/DOCUMENTS`.

## Decision

Parity accepted. Generated graph/RAG are bound to the migrated corpus and contain no runtime dependency on legacy paths.
