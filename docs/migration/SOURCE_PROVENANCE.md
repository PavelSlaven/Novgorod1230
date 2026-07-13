# Source provenance — 0.23.0-migration.23

## Source release

- Release: `0.22.0-migration.22`.
- Archive: `Rus_modules-migration-0.22.0.zip`.
- SHA-256: `a52e5bfed859973677f317e8a7b66e18347885c60f17b6b0beba7aabac72921c`.

## Knowledge corpus

- Legacy source: `legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS`.
- Canonical target: `data/knowledge-source/corpus/DOCUMENTS`.
- Documents: 19.
- Copy mode: byte-for-byte.
- Integrity evidence: `corpus-manifest.json` and parity report.

## Generated provenance

- Graph semantic snapshot: `data/knowledge-source/imports/graph/graph.json`.
- RAG embedding snapshot: `data/knowledge-source/imports/rag/index.json`.
- Graph output is materialized only after validation of every source location against the canonical corpus.
- RAG chunks are rebuilt from the canonical corpus; imported vectors are accepted only for exact ordered chunk parity.

## Manual boundary

Legacy remains read-only rollback evidence. This phase does not authorize automatic deletion.
