# Canonical knowledge source

This directory uses corpus manifest v2. Documents may be `proposed`, `active` or `deprecated`; production reads only `active` by default. Canonicalized legacy documents retain separate legacy digest/byte provenance and are never overwritten by re-import.

- `corpus/DOCUMENTS` is the source of truth.
- `imports/legacy-inventory.json` records the complete classified legacy inventory and permits autonomous verification.
- `imports/graph` preserves the approved semantic graph snapshot used for deterministic materialization.
- `imports/rag` preserves approved embedding vectors; chunks are rebuilt from the canonical corpus and matched by exact ordered content.
- Approved semantic vectors are accepted per byte-compatible document. A changed document becomes lexical-only until a new semantic snapshot is approved; invalid vectors or semantic provenance still fail closed.
- `generated/knowledge-source` contains reproducible runtime artifacts.
- Runtime code must access documents only through `@rus/knowledge-source`.

`npm run knowledge:import` validates the complete import plan before its first write, then refreshes legacy-owned records only. Verified native records, aliases and files remain registered and unchanged, including on a rejected collision.
- Native documents without approved embeddings receive structural graph nodes and lexical-only chunks; nodes, links, hyperedges and every `member_source_files` entry may reference only the exact approved embedding document set, and no semantic relation may touch a structural-only node.
