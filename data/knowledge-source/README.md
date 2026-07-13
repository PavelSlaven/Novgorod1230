# Canonical knowledge source

This directory contains 26 canonical documents: 19 byte-faithful sources migrated from the read-only legacy corpus and 7 native project normatives.

- `corpus/DOCUMENTS` is the source of truth.
- `imports/legacy-inventory.json` records the complete classified legacy inventory and permits autonomous verification.
- `imports/graph` preserves the approved semantic graph snapshot used for deterministic materialization.
- `imports/rag` preserves approved embedding vectors; chunks are rebuilt from the canonical corpus and matched by exact ordered content.
- Approved semantic vectors are accepted only when the semantic corpus hash and every ordered chunk field still match; otherwise generation fails closed.
- `generated/knowledge-source` contains reproducible runtime artifacts.
- Runtime code must access documents only through `@rus/knowledge-source`.

`npm run knowledge:import` refreshes legacy-owned records only. Verified native records, aliases and files remain registered and unchanged.
- Native documents without approved embeddings receive structural graph nodes and lexical-only chunks; the generator never fabricates semantic links or vectors.
