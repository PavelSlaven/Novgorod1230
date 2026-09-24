# M2c target start — failed PostgreSQL run 5168

## Identity

- Result: **FAIL**. This failure is preserved; the corrected run is recorded separately.
- Scope: isolated PostgreSQL fixture for `spatial-v3-production-v17`, target revision `novgorod_spatial_v3_target_contract_approval_001`; direct `officialRoot.startNewGame`.
- Source: `test/spatial-v3/target-canonical-start-postgres-acceptance.js` on the M2c working tree before the exact catalog-pin fix; run/session `5168`.
- Provider: deterministic external HTTP fixture. No production service or player save was used.

## Preconditions

The test supplied fixture-issued item and actor approvals and exact target catalog data. This was not an operational approval or live production import. Start request: `scenario_id=novgorod_pine_ridge_approach_v1`, `request_id=target-real-public-opening`.

## Gameplay transcript

No player turn was submitted. The start failed before an opening screen existed; therefore there is no first-screen prose to transcribe. The observed error was `G4_NATURAL_CATALOG_INVALID`, `details.reason=pin`. No player-visible result was returned. Total test duration was approximately 103,216.9 ms; stage timings were not exposed.

## Persistence/readback

The test did not reach the successful public start/replay/screen/ACK assertions. No successful committed party or gameplay transition is claimed for this run.

## Findings

The shared target binding passed a loader-added `activation_scope:null` field into the natural catalog pin. The exact verified target pin omitted that optional field, so natural-catalog validation correctly rejected the mismatch. The binding now uses the exact verified pin; see the later success report.

## Result

**FAIL** — no first screen and no playable turn. Baseline generative materialization calls were not measured in this failed run.
