# M2c target start — PostgreSQL run 12868

## Identity

- Result: **PARTIAL**. Isolated real PostgreSQL fixture; direct `officialRoot.startNewGame`, replay, screen, ACK and canonical Phase2.
- Release `spatial-v3-production-v17`; scenario `novgorod_pine_ridge_approach_v1`; run/session `12868` on the M2c working tree after the exact catalog-pin fix.
- Provider: deterministic HTTP narrator/auditor fixture. Operational production approval was not used.

## Preconditions

Fixture-issued exact target item/actor approvals and catalog pins. Start request `{ "scenario_id": "novgorod_pine_ridge_approach_v1", "request_id": "target-real-public-opening" }`; replay used the same identity; ACK used `client_ack_id=target-public-ack`.

## Gameplay transcript

The test returned a first screen and passed its assertions, but this run did not persist a verbatim screen artifact. Its sampled player/prose cannot be reconstructed from later independent runs. No player turn was submitted, so no player-visible turn result or domain turn outcome exists.

## Persistence/readback

The direct official-root start, exact replay, `getPartyScreen`, ACK and canonical Phase2 assertions passed. No generated G5 traversal or resource extraction was exercised.

## Findings

The run corrected the prior `G4_NATURAL_CATALOG_INVALID` pin-shape failure ([run 5168](2026-09-24_m2c-target-start_worktree_5168.md)). Its missing verbatim screen record means it is not used as first-screen acceptance evidence; [run 13802](2026-09-24_m2c-target-start_8ee34d91_13802.md) preserves the exact next-run screen. Total test duration was 106,111.7 ms; test case 105,200.9 ms. Separate catalog/generation/commit/projection/narration/remainder timings and materialization call count were not captured for this run.

## Result

**PARTIAL** — official start persistence passed; first-screen transcript and playable movement were not demonstrated by this run.
