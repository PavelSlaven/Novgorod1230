# Start parameter extraction vocabulary, candidate v1 (#109, D75)

Lexical candidate labels for the four new-start parameters — region, season, occupation and social position — that a deterministic server-side matcher reads from the player's start text.

- `candidate-vocabulary.json` — schema v3, 139 rows with per-row provenance; sha256 `07415033f141ea4754d5c1c4433e943b1e639814a3ba56ed2caf1342bbb9d18f`.
- `bench-cases.json` — the 16 frozen regression cases; sha256 `f572c4511936777a3758ae8710a76c71c1d3ebb23d2997461f7cb559e619b511`.

Approval: APPROVE_WITH_LIMITS by the independent `ap-m7-vocab` pass 2 (D67), for the lexical candidate labels only.

Limits:
- Rows keep their `pending_d67` and non-runtime flags. There are no canonical world IDs, no eligibility, no start compatibility, no import and no activation.
- The Ladoga → Novgorod land link stays candidate-only.
- This catalog is not part of `target-starts-manifest.v1.json`.
