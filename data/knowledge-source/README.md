# Canonical knowledge source

This directory contains 19 byte-faithful canonical documents migrated from the read-only legacy corpus.

- `corpus/DOCUMENTS` is the source of truth.
- `imports/legacy-inventory.json` records the complete classified legacy inventory and permits autonomous verification.
- `imports/graph` preserves the approved semantic graph snapshot used for deterministic materialization.
- `imports/rag` preserves approved embedding vectors; chunks are rebuilt from the canonical corpus and matched by exact ordered content.
- `generated/knowledge-source` contains reproducible runtime artifacts.
- Runtime code must access documents only through `@rus/knowledge-source`.
