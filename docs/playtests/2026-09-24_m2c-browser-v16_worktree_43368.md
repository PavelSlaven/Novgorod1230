# M2c v16 browser regression check — run 43368

## Identity

- Result: **FAIL**. Real Chromium, production-v16 fixture root and isolated PostgreSQL; test `test/e2e/lower-dvina-trace-browser-acceptance.test.js` on the M2c working tree.
- Provider: deterministic test fixture. No live production service or save was used.

## Preconditions

The browser selected `lower_dvina_trace_v1` from the public scenario list. No player turn was submitted.

## Gameplay transcript

No first game screen appeared. Waiting for `[data-turn-form]` timed out after 120,000 ms. There is no opening prose or turn result to transcribe. This run did not capture the public API error body.

## Persistence/readback

No successful party creation, turn commit or reload was established by the test.

## Findings

The test duration was 259,833 ms. A diagnostic rerun captured the underlying public error; see [run 24840](2026-09-24_m2c-browser-v16_worktree_24840.md). This failed run is preserved and is not acceptance evidence.

## Result

**FAIL** — browser never reached its first turn form.
