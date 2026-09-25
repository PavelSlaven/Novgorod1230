# Canonical knowledge source

This directory uses corpus manifest v2. Documents may be `proposed`, `active` or `deprecated`; production reads only `active` by default. Canonicalized legacy documents retain separate legacy digest/byte provenance and are never overwritten by re-import.

- `corpus/DOCUMENTS` is the source of truth.
- `imports/legacy-inventory.json` records the complete classified legacy inventory and permits autonomous verification.
- Generated graph (`generated/knowledge-source/graph`) is structural document nodes only.
- Generated RAG (`generated/knowledge-source/rag`) is deterministic lexical chunks; there is no embedding snapshot import.
- `generated/knowledge-source` contains reproducible runtime artifacts.
- Runtime code must access documents only through `@rus/knowledge-source`.

`npm run knowledge:import` validates the complete import plan before its first write, then refreshes legacy-owned records only. Verified native records, aliases and files remain registered and unchanged, including on a rejected collision.
