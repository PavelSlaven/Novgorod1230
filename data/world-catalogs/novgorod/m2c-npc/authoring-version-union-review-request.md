# Independent NPC authoring version union review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

After the approved connection availability repin, both NPC import bundles gained exactly 457 `spatial_v3_authoring_versions` rows from `spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_authoring_versions.json`: 454 `canonical_g5_connection_binding@2` and 3 `canonical_g5_connection_profile@2`. Verify exact row equality, no duplicate `(entity_kind, entity_id, version)`, all prior NPC rows preserved, and complete expansion authoring-version coverage in both bundles. Check all dataset SHA pins and the dependent manifests against current bytes.

- Import dataset SHA-256: `b4f90a07628f601bbe04d2a94a15d6d82e107258c065b06b4ae5e23d6e549e5a` (2616 rows).
- Canonical initial dataset SHA-256: `58814ac3007418663809562a0eb9c2d634362b11c013afcb1f5bb6a5967b467f` (2621 rows).
- Import manifest SHA-256: `c9ef915cbd16c41bd06857243af54b6f64a20960e6748feffda96d2144ffbdee`.
- Canonical initial manifest SHA-256: `1138d846f4728fc472a64f3ed7f9b6444325bac5493431699bcb472f526152c1`.

Run P12 validation for both manifests and `node --test test/spatial-v3/m2c-npc-import-postgres.test.js` against real PostgreSQL. This request records no new approval or release activation.
