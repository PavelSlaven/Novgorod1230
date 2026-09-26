# Independent M2c scene movement edge candidate repin review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

Exact candidate: `data/world-catalogs/novgorod/m2c-scene-movement-edges/candidate.json`, SHA-256 `c4742a5b9642638b7e2ca3c440ffe344e724549abfa788ed39b8627314957356`.

The sole candidate edit replaces the `target-start-candidate.json` source SHA-256 `d6c2d53779f617e1f849e5ebe00fc86c82d5d4cfc4ed893e310aad1a9eadfe2f` with `fd448da3e194aa8563fffacdcfa870be4eb5e004c2da61a4bdc9e0dd767d3412`. The start changed only its M2c expansion import-manifest pin. Verify exact current source bytes, unchanged canonical initial placement refs and slot, 68 unchanged reciprocal edge rows across 17 scene templates, capacity and NPC occupancy boundary, and all other source refs. Run `node --test data/world-catalogs/novgorod/m2c-scene-movement-edges/candidate.test.mjs`.

`m2c-sol-data-approval.json` approves the earlier candidate SHA only; it does not approve these bytes. If the review passes, issue a fresh exact-data approval before downstream repins or use. No import, runtime movement or release activation follows from this review.