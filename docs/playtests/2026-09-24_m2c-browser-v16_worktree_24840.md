# M2c v16 browser regression check — run 24840

## Identity

- Result: **FAIL**. Real Chromium, production-v16 fixture root and isolated PostgreSQL; diagnostic rerun of `test/e2e/lower-dvina-trace-browser-acceptance.test.js` on the M2c working tree.
- Provider: deterministic test fixture. The temporary capture contained local provider configuration and was deleted after extracting only the public error code below.

## Preconditions

The browser loaded the public scenario list and selected `lower_dvina_trace_v1`. No player turn was submitted.

## Gameplay transcript

No first game screen was returned. The public start response was an error: `TRACE_S1_WORLD_CATALOG_GAP`, message `S1 template closure is unavailable from world-base.` The browser then timed out waiting 30,000 ms for `[data-turn-form]`. There is no opening prose or player-visible turn result.

## Persistence/readback

The public start did not establish a successful party, turn commit or reload. Total test duration: 197,979 ms.

## Findings

The new canonical scene reader requires authoring-version approval rows absent from the independently approved v16 S1 closure. The Spatial owner is correcting this version-scope regression. Previous failed attempt: [run 43368](2026-09-24_m2c-browser-v16_worktree_43368.md). A later passing run will be recorded separately.

## Result

**FAIL** — v16 start blocked before the first screen.
