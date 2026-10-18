# D49: arrival environment verification

## Scope

Implementation HEAD: `d3ade7ce2cb466af3ff1615e20939978c3ba33c9`, including `e4b329e1b5171e2b1c625a4b2d0c0ba220862b25`. Fresh isolated PostgreSQL, production composition, deterministic fake provider. This verifies request construction and persistence; it does not assess production-model prose or accept D49.

The movement projector previously lost current environment facts when the commit owner replaced its context with the prepared destination context. The existing commit merge now retains sensory details. Arrival weather and season are projected by the existing approved environment owner at the arrival clock, including the digest-matched destination reuse path. Natural destination observations remain unchanged; there is no extra scene load or weather owner.

## Executed checks

- Correctly targeted pre-fix PostgreSQL regression: RED, actual narrator request lacked the current approved season fact `Лето.`. Setup and arrival completed before the assertion failed.
- A first three-file patch still failed that assertion. Direct tracing identified the subsequent commit merge as the first point where projected sensory facts were discarded.
- With the commit fix, PostgreSQL regression passed 1/1 in 527570 ms. Independent audit then rejected a separate stale-environment path at a time boundary; this intermediate pass was not accepted as complete.
- The new reuse/time-boundary unit regression failed before correction and passed after it. It verifies current night/dark/overcast facts, absence of prior evening/daylight/clear facts, preservation of the natural water sound, and zero scene reloads.
- Final production-wired PostgreSQL regression passed 1/1 in 540799 ms. It compares facts in the actual narrator request against the current committed environment snapshot.
- Final focused checks: 94/94. Syntax, `git diff --check`, `docs:check`, and `architecture:check` passed. Full integrated CI is a separate gate.

Earlier setup failure from a temporary archive without required Git history did not reach the target assertions. The runner was corrected to use a real clone with the historical approval subject; approval files and checks were not weakened. Earlier captures accidentally selected the auditor instead of the narrator and are not acceptance evidence. Corrected captures select the actual production narrator role.

## Request evidence

The lead read the complete production-built before/after requests, including system, user and parameters. The paired PostgreSQL captures have identical system text and parameters. Arrival sensory facts are added to the user input; the existing shore observations remain. These fake-provider captures contain no World Knowledge response, so the older live call 25 is a separate diagnostic input, not the paired baseline.

Private captures remain outside Git: `before-regression-writer-request.json` and `after-regression-writer-request.json` in the local temporary evidence directory. Final after-request SHA-256: `4080a5f9f304aa6927af9ffadd1f6f5b17ae095e0a2329b844e46aa45ebb4adf`. It is byte-identical to the earlier after-request for the same non-boundary PostgreSQL case; the additional unit regression covers the time-boundary correction.

Independent review preserved both the [rejected intermediate audit](d49-transition-e4b-rejected-audit.md) and the [P1 closure audit](d49-transition-d3ade-audit.md). Final verdict is `PASS_WITH_NOTES` for this patch. The [saved live D49 run](../../playtests/2026-10-18_d49_5ba92a85_browser.md) remains FAIL; neither these tests nor the architecture audit replace a successful live route, literary-quality assessment, and save/reload check.
